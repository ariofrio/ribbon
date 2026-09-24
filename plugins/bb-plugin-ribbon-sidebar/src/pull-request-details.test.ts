import { describe, expect, it, vi } from "vitest";
import {
  createPullRequestDetailsService,
  fetchPullRequestDetails,
} from "./pull-request-details";

function node(overrides: Record<string, unknown> = {}) {
  return {
    url: "https://github.com/acme/app/pull/1",
    mergeStateStatus: "BLOCKED",
    mergeable: "MERGEABLE",
    reviewDecision: "REVIEW_REQUIRED",
    isInMergeQueue: false,
    autoMergeRequest: { enabledAt: "2026-09-24T20:19:29Z" },
    reviewRequests: {
      nodes: [
        { requestedReviewer: { __typename: "User", login: "bwills", name: "Blake Wills" } },
        { requestedReviewer: { __typename: "User", login: "maydar", name: null } },
        { requestedReviewer: { __typename: "Team", name: "Platform" } },
      ],
    },
    commits: {
      nodes: [
        {
          commit: {
            statusCheckRollup: {
              state: "PENDING",
              contexts: {
                checkRunCountsByState: [
                  { state: "SUCCESS", count: 29 },
                  { state: "SKIPPED", count: 1 },
                  { state: "IN_PROGRESS", count: 5 },
                  { state: "FAILURE", count: 0 },
                ],
                statusContextCountsByState: [
                  { state: "SUCCESS", count: 1 },
                  { state: "PENDING", count: 1 },
                ],
              },
            },
          },
        },
      ],
    },
    ...overrides,
  };
}

describe("fetchPullRequestDetails", () => {
  it("batches pull requests per host into one GraphQL query", async () => {
    const run = vi.fn(async (host: string, query: string) => {
      expect(host).toBe("github.com");
      expect(query).toContain('p0: repository(owner: "acme", name: "app") { pullRequest(number: 1)');
      expect(query).toContain('p1: repository(owner: "acme", name: "api") { pullRequest(number: 7)');
      return JSON.stringify({
        data: {
          p0: { pullRequest: node() },
          p1: { pullRequest: null },
        },
      });
    });

    const details = await fetchPullRequestDetails(
      ["https://github.com/acme/app/pull/1", "https://github.com/acme/api/pull/7"],
      run,
    );

    expect(run).toHaveBeenCalledTimes(1);
    expect(details).toEqual([
      {
        url: "https://github.com/acme/app/pull/1",
        autoMerge: true,
        inMergeQueue: false,
        mergeStateStatus: "BLOCKED",
        mergeable: "MERGEABLE",
        reviewDecision: "REVIEW_REQUIRED",
        requestedReviewers: ["Blake Wills", "maydar", "Platform"],
        checks: { state: "pending", total: 37, passed: 31, failed: 0, pending: 6 },
      },
    ]);
  });

  it("reports no checks when a commit has no rollup", async () => {
    const run = async () =>
      JSON.stringify({
        data: {
          p0: {
            pullRequest: node({
              autoMergeRequest: null,
              commits: { nodes: [{ commit: { statusCheckRollup: null } }] },
            }),
          },
        },
      });
    const [details] = await fetchPullRequestDetails(["https://github.com/acme/app/pull/1"], run);
    expect(details?.autoMerge).toBe(false);
    expect(details?.checks).toEqual({ state: "none", total: 0, passed: 0, failed: 0, pending: 0 });
  });

  it("ignores URLs that are not pull requests", async () => {
    const run = vi.fn(async () => "{}");
    expect(await fetchPullRequestDetails(["https://example.com/nope"], run)).toEqual([]);
    expect(run).not.toHaveBeenCalled();
  });

  it("asks each host separately", async () => {
    const hosts: string[] = [];
    const run = async (host: string) => {
      hosts.push(host);
      return JSON.stringify({ data: { p0: { pullRequest: node() } } });
    };
    await fetchPullRequestDetails(
      ["https://github.com/acme/app/pull/1", "https://ghe.example.com/acme/app/pull/1"],
      run,
    );
    expect(hosts.sort()).toEqual(["ghe.example.com", "github.com"]);
  });
});

describe("createPullRequestDetailsService", () => {
  const url = "https://github.com/acme/app/pull/1";
  const response = JSON.stringify({ data: { p0: { pullRequest: node() } } });

  it("reuses fresh details until bb reports a change", async () => {
    let now = 0;
    const run = vi.fn(async () => response);
    const service = createPullRequestDetailsService({ run, now: () => now, ttlMs: 30_000 });

    await service.get([{ url, stamp: "open:blocked" }]);
    await service.get([{ url, stamp: "open:blocked" }]);
    expect(run).toHaveBeenCalledTimes(1);

    await service.get([{ url, stamp: "open:checks_failed" }]);
    expect(run).toHaveBeenCalledTimes(2);

    now = 30_001;
    await service.get([{ url, stamp: "open:checks_failed" }]);
    expect(run).toHaveBeenCalledTimes(3);
  });

  it("shares one request between concurrent callers", async () => {
    const run = vi.fn(async () => response);
    const service = createPullRequestDetailsService({ run, now: () => 0, ttlMs: 30_000 });
    const [left, right] = await Promise.all([
      service.get([{ url, stamp: "a" }]),
      service.get([{ url, stamp: "a" }]),
    ]);
    expect(run).toHaveBeenCalledTimes(1);
    expect(left).toEqual(right);
  });

  it("keeps the last known details when GitHub cannot be reached", async () => {
    let now = 0;
    const run = vi.fn(async () => response);
    const onError = vi.fn();
    const service = createPullRequestDetailsService({ run, now: () => now, ttlMs: 30_000, onError });
    expect(await service.get([{ url, stamp: "a" }])).toHaveLength(1);

    run.mockRejectedValueOnce(new Error("gh: not logged in"));
    now = 30_001;
    expect(await service.get([{ url, stamp: "a" }])).toHaveLength(1);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "gh: not logged in" }));

    // A failure is not retried on every poll.
    await service.get([{ url, stamp: "a" }]);
    expect(run).toHaveBeenCalledTimes(2);
  });
});
