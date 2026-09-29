import type { PluginSidebarPullRequest } from "@get-bb/plugin-sdk/app";
import type { PullRequestDetailsV1 } from "./contracts";

export type SidebarPullRequest = PluginSidebarPullRequest;
export type PullRequestDetails = PullRequestDetailsV1;

/** The glyph beside a row's PR number: bb's four states plus auto-merge. */
export type PullRequestLifecycle = "open" | "draft" | "auto" | "merged" | "closed";

/**
 * GitHub's own status vocabulary, reused for everything a PR can wait on:
 * something needs a fix, something is still pending, or nothing is left.
 */
export type PullRequestMark = "failing" | "waiting" | "ready";

export interface PullRequestSignal {
  lifecycle: PullRequestLifecycle;
  mark: PullRequestMark | null;
  /** Names what the mark stands for, e.g. "Waiting on review from Blake". */
  label: string | null;
}

export interface PullRequestLocation {
  host: string;
  owner: string;
  repo: string;
  number: number;
}

export function parsePullRequestUrl(url: string): PullRequestLocation | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const match = /^\/([^/]+)\/([^/]+)\/pull\/(\d+)\/?$/u.exec(parsed.pathname);
  if (!match) return null;
  return {
    host: parsed.hostname,
    owner: decodeURIComponent(match[1]!),
    repo: decodeURIComponent(match[2]!),
    number: Number(match[3]),
  };
}

const ATTENTION_SIGNALS: Partial<
  Record<SidebarPullRequest["attention"], { mark: PullRequestMark; label: string }>
> = {
  checks_failed: { mark: "failing", label: "CI failing" },
  changes_requested: { mark: "failing", label: "Changes requested" },
  conflicts: { mark: "failing", label: "Merge conflicts" },
  checks_pending: { mark: "waiting", label: "Waiting on CI" },
  review_requested: { mark: "waiting", label: "Waiting on review" },
  blocked: { mark: "waiting", label: "Blocked" },
  ready_to_merge: { mark: "ready", label: "Ready to merge" },
};

/** "Approved" + "Waiting on CI" reads "Approved · waiting on CI"; "CI" keeps its case. */
function joinReasons(parts: readonly string[]): string {
  return parts
    .map((part, index) =>
      index === 0 || /^\p{Lu}{2}/u.test(part)
        ? part
        : part.charAt(0).toLocaleLowerCase() + part.slice(1),
    )
    .join(" · ");
}

function detailedSignal(
  details: PullRequestDetails,
): Omit<PullRequestSignal, "lifecycle"> {
  if (details.inMergeQueue) return { mark: "waiting", label: "Queued to merge" };
  const { checks } = details;
  const prefix = details.autoMerge ? ["Auto-merge on"] : [];

  const failing: string[] = [];
  if (details.mergeable === "CONFLICTING" || details.mergeStateStatus === "DIRTY") {
    failing.push("Merge conflicts");
  }
  if (checks.state === "failure") {
    failing.push(`CI failing (${checks.failed} of ${checks.total})`);
  }
  if (details.reviewDecision === "CHANGES_REQUESTED") failing.push("Changes requested");
  if (failing.length > 0) {
    return { mark: "failing", label: joinReasons([...prefix, ...failing]) };
  }

  const approved = details.reviewDecision === "APPROVED" ? ["Approved"] : [];
  const waitingOn: string[] = [];
  if (details.reviewDecision === "REVIEW_REQUIRED") {
    waitingOn.push(
      details.requestedReviewers.length > 0
        ? `review from ${details.requestedReviewers.join(", ")}`
        : "review",
    );
  }
  if (checks.state === "pending") {
    waitingOn.push(`CI (${checks.passed}/${checks.total})`);
  }
  const waiting = waitingOn.length > 0 ? [`Waiting on ${waitingOn.join(" and ")}`] : [];
  if (waiting.length === 0 && details.mergeStateStatus === "BEHIND") {
    waiting.push("Branch is behind its base");
  }
  if (waiting.length === 0 && details.mergeStateStatus === "BLOCKED") {
    waiting.push("Blocked by branch protection");
  }
  if (waiting.length > 0) {
    return { mark: "waiting", label: joinReasons([...prefix, ...approved, ...waiting]) };
  }

  if (
    details.mergeStateStatus === "CLEAN" ||
    details.mergeStateStatus === "HAS_HOOKS" ||
    details.mergeStateStatus === "UNSTABLE"
  ) {
    return {
      mark: "ready",
      label: joinReasons([...prefix, ...approved, "Ready to merge"]),
    };
  }
  // GitHub computes mergeability lazily; say nothing until it knows.
  return { mark: null, label: null };
}

export function pullRequestSignal(
  pullRequest: SidebarPullRequest,
  details: PullRequestDetails | null,
): PullRequestSignal {
  if (pullRequest.state !== "open") {
    return { lifecycle: pullRequest.state, mark: null, label: null };
  }
  if (details === null) {
    const signal = ATTENTION_SIGNALS[pullRequest.attention];
    return {
      lifecycle: "open",
      mark: signal?.mark ?? null,
      label: signal?.label ?? null,
    };
  }
  return {
    lifecycle: details.autoMerge || details.inMergeQueue ? "auto" : "open",
    ...detailedSignal(details),
  };
}
