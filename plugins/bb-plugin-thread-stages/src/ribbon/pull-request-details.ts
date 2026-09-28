import { execFile } from "node:child_process";
import type { PullRequestDetailsV1 } from "./contracts";
import { parsePullRequestUrl, type PullRequestLocation } from "./pull-request-status";

/** Runs one GraphQL query against a GitHub host and returns the raw response. */
export type GitHubGraphqlRunner = (host: string, query: string) => Promise<string>;

/** GitHub's node limits allow far more; this keeps each response small. */
const BATCH_SIZE = 25;
const SAFE_NAME = /^[A-Za-z0-9_.-]+$/u;

const PULL_REQUEST_FIELDS = `
  url mergeStateStatus mergeable reviewDecision isInMergeQueue
  autoMergeRequest { enabledAt }
  reviewRequests(first: 5) { nodes { requestedReviewer {
    __typename ... on User { login name } ... on Team { name } ... on Bot { login } ... on Mannequin { login }
  } } }
  commits(last: 1) { nodes { commit { statusCheckRollup { state contexts {
    checkRunCountsByState { state count }
    statusContextCountsByState { state count }
  } } } } }`;

const PASSED = new Set(["SUCCESS", "NEUTRAL", "SKIPPED"]);
const FAILED = new Set([
  "FAILURE",
  "ERROR",
  "CANCELLED",
  "TIMED_OUT",
  "ACTION_REQUIRED",
  "STARTUP_FAILURE",
  "STALE",
]);
const PENDING = new Set(["PENDING", "EXPECTED", "QUEUED", "IN_PROGRESS", "WAITING", "REQUESTED"]);

interface CountByState {
  state: string;
  count: number;
}

interface PullRequestNode {
  url: string;
  mergeStateStatus: string | null;
  mergeable: string | null;
  reviewDecision: string | null;
  isInMergeQueue: boolean;
  autoMergeRequest: unknown;
  reviewRequests: {
    nodes: { requestedReviewer: { login?: string; name?: string | null } | null }[];
  };
  commits: {
    nodes: {
      commit: {
        statusCheckRollup: {
          state: string;
          contexts: {
            checkRunCountsByState: CountByState[];
            statusContextCountsByState: CountByState[];
          };
        } | null;
      };
    }[];
  };
}

function checks(node: PullRequestNode): PullRequestDetailsV1["checks"] {
  const rollup = node.commits.nodes[0]?.commit.statusCheckRollup ?? null;
  if (rollup === null) {
    return { state: "none", total: 0, passed: 0, failed: 0, pending: 0 };
  }
  let passed = 0;
  let failed = 0;
  let pending = 0;
  for (const { state, count } of [
    ...rollup.contexts.checkRunCountsByState,
    ...rollup.contexts.statusContextCountsByState,
  ]) {
    if (PASSED.has(state)) passed += count;
    else if (FAILED.has(state)) failed += count;
    else if (PENDING.has(state)) pending += count;
  }
  const state =
    rollup.state === "SUCCESS"
      ? "success"
      : rollup.state === "FAILURE" || rollup.state === "ERROR"
        ? "failure"
        : "pending";
  return { state, total: passed + failed + pending, passed, failed, pending };
}

function details(node: PullRequestNode): PullRequestDetailsV1 {
  return {
    url: node.url,
    autoMerge: node.autoMergeRequest != null,
    inMergeQueue: node.isInMergeQueue,
    mergeStateStatus: node.mergeStateStatus,
    mergeable: node.mergeable,
    reviewDecision: node.reviewDecision,
    requestedReviewers: node.reviewRequests.nodes.flatMap(({ requestedReviewer }) => {
      const name = requestedReviewer?.name ?? requestedReviewer?.login;
      return name ? [name] : [];
    }),
    checks: checks(node),
  };
}

function query(locations: readonly PullRequestLocation[]): string {
  const fields = locations.map(
    ({ owner, repo, number }, index) =>
      `p${index}: repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(repo)}) { pullRequest(number: ${number}) { ${PULL_REQUEST_FIELDS} } }`,
  );
  return `query { ${fields.join("\n")} }`;
}

export async function fetchPullRequestDetails(
  urls: readonly string[],
  run: GitHubGraphqlRunner,
): Promise<PullRequestDetailsV1[]> {
  const byHost = new Map<string, PullRequestLocation[]>();
  for (const url of new Set(urls)) {
    const location = parsePullRequestUrl(url);
    if (!location || !SAFE_NAME.test(location.owner) || !SAFE_NAME.test(location.repo)) continue;
    byHost.set(location.host, [...(byHost.get(location.host) ?? []), location]);
  }
  const batches = [...byHost].flatMap(([host, locations]) =>
    Array.from({ length: Math.ceil(locations.length / BATCH_SIZE) }, (_, index) => ({
      host,
      locations: locations.slice(index * BATCH_SIZE, (index + 1) * BATCH_SIZE),
    })),
  );
  const results = await Promise.all(
    batches.map(async ({ host, locations }) => {
      const response = JSON.parse(await run(host, query(locations))) as {
        data?: Record<string, { pullRequest: PullRequestNode | null } | null>;
      };
      return locations.flatMap((_, index) => {
        const node = response.data?.[`p${index}`]?.pullRequest;
        return node ? [details(node)] : [];
      });
    }),
  );
  return results.flat();
}

export interface PullRequestDetailsRequest {
  url: string;
  /** Changes whenever bb sees the pull request change, forcing a fresh fetch. */
  stamp: string;
}

interface CacheEntry {
  stamp: string;
  fetchedAt: number;
  details: PullRequestDetailsV1 | null;
}

/**
 * Caches details per pull request so every client's poll shares one GitHub
 * query, and refetches early when bb's own pull request state moves.
 */
export function createPullRequestDetailsService({
  run,
  now = Date.now,
  ttlMs = 30_000,
  onError,
}: {
  run: GitHubGraphqlRunner;
  now?: () => number;
  ttlMs?: number;
  onError?: (error: Error) => void;
}) {
  const cache = new Map<string, CacheEntry>();
  const inFlight = new Map<string, Promise<void>>();

  async function refresh(requests: readonly PullRequestDetailsRequest[]) {
    const fetchedAt = now();
    try {
      const fetched = new Map(
        (await fetchPullRequestDetails(requests.map(({ url }) => url), run)).map(
          (item) => [item.url, item],
        ),
      );
      for (const { url, stamp } of requests) {
        cache.set(url, { stamp, fetchedAt, details: fetched.get(url) ?? null });
      }
    } catch (error) {
      onError?.(error instanceof Error ? error : new Error(String(error)));
      for (const { url, stamp } of requests) {
        cache.set(url, { stamp, fetchedAt, details: cache.get(url)?.details ?? null });
      }
    }
  }

  return {
    async get(
      requests: readonly PullRequestDetailsRequest[],
    ): Promise<PullRequestDetailsV1[]> {
      const stale = requests.filter(({ url, stamp }) => {
        const entry = cache.get(url);
        return !inFlight.has(url) && (!entry || entry.stamp !== stamp || now() - entry.fetchedAt > ttlMs);
      });
      if (stale.length > 0) {
        const pending = refresh(stale);
        for (const { url } of stale) inFlight.set(url, pending);
        void pending.finally(() => {
          for (const { url } of stale) {
            if (inFlight.get(url) === pending) inFlight.delete(url);
          }
        });
      }
      await Promise.all(requests.map(({ url }) => inFlight.get(url)));
      return requests.flatMap(({ url }) => {
        const found = cache.get(url)?.details;
        return found ? [found] : [];
      });
    },
  };
}

/** bb's own GitHub integration looks in the same places when PATH lacks Homebrew. */
const GH_CANDIDATES = ["gh", "/opt/homebrew/bin/gh", "/usr/local/bin/gh"];

function execGh(binary: string, args: readonly string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(binary, args, { timeout: 15_000, maxBuffer: 8 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(Object.assign(error, { message: stderr.trim() || error.message }));
      } else {
        resolve(stdout);
      }
    });
  });
}

export function createGhGraphqlRunner(): GitHubGraphqlRunner {
  let binary: Promise<string> | null = null;
  const resolveBinary = async () => {
    for (const candidate of GH_CANDIDATES) {
      try {
        await execGh(candidate, ["--version"]);
        return candidate;
      } catch {
        // Try the next location.
      }
    }
    throw new Error("GitHub CLI (gh) was not found.");
  };
  return async (host, graphql) => {
    binary ??= resolveBinary().catch((error: unknown) => {
      binary = null;
      throw error;
    });
    return execGh(await binary, [
      "api",
      "graphql",
      ...(host === "github.com" ? [] : ["--hostname", host]),
      "-f",
      `query=${graphql}`,
    ]);
  };
}
