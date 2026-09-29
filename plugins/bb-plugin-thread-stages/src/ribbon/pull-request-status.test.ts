import { describe, expect, it } from "vitest";
import {
  parsePullRequestUrl,
  pullRequestSignal,
  type PullRequestDetails,
  type SidebarPullRequest,
} from "./pull-request-status";

function pr(overrides: Partial<SidebarPullRequest> = {}): SidebarPullRequest {
  return {
    number: 12,
    title: "Ship it",
    url: "https://github.com/acme/app/pull/12",
    state: "open",
    attention: "none",
    ...overrides,
  };
}

function details(overrides: Partial<PullRequestDetails> = {}): PullRequestDetails {
  return {
    url: "https://github.com/acme/app/pull/12",
    autoMerge: false,
    inMergeQueue: false,
    mergeStateStatus: "CLEAN",
    mergeable: "MERGEABLE",
    reviewDecision: null,
    requestedReviewers: [],
    checks: { state: "success", total: 3, passed: 3, failed: 0, pending: 0 },
    ...overrides,
  };
}

describe("parsePullRequestUrl", () => {
  it("reads the host, owner, repository, and number", () => {
    expect(parsePullRequestUrl("https://github.com/acme/app/pull/12")).toEqual({
      host: "github.com",
      owner: "acme",
      repo: "app",
      number: 12,
    });
  });

  it("rejects URLs that are not pull requests", () => {
    expect(parsePullRequestUrl("https://github.com/acme/app/issues/12")).toBeNull();
    expect(parsePullRequestUrl("not a url")).toBeNull();
  });
});

describe("pullRequestSignal", () => {
  it("keeps finished and draft pull requests free of a status mark", () => {
    expect(pullRequestSignal(pr({ state: "merged", attention: "merged" }), null))
      .toEqual({ lifecycle: "merged", mark: null, label: null });
    expect(pullRequestSignal(pr({ state: "closed", attention: "closed" }), null))
      .toEqual({ lifecycle: "closed", mark: null, label: null });
    expect(pullRequestSignal(pr({ state: "draft", attention: "draft" }), details()))
      .toEqual({ lifecycle: "draft", mark: null, label: null });
  });

  it("falls back to bb's attention when GitHub details are unavailable", () => {
    expect(pullRequestSignal(pr({ attention: "checks_failed" }), null))
      .toEqual({ lifecycle: "open", mark: "failing", label: "CI failing" });
    expect(pullRequestSignal(pr({ attention: "blocked" }), null))
      .toEqual({ lifecycle: "open", mark: "waiting", label: "Blocked" });
    expect(pullRequestSignal(pr({ attention: "ready_to_merge" }), null))
      .toEqual({ lifecycle: "open", mark: "ready", label: "Ready to merge" });
    expect(pullRequestSignal(pr({ attention: "none" }), null))
      .toEqual({ lifecycle: "open", mark: null, label: null });
  });

  it("marks every reason a pull request needs a fix", () => {
    expect(
      pullRequestSignal(
        pr(),
        details({
          mergeable: "CONFLICTING",
          mergeStateStatus: "DIRTY",
          reviewDecision: "CHANGES_REQUESTED",
          checks: { state: "failure", total: 34, passed: 31, failed: 2, pending: 1 },
        }),
      ),
    ).toEqual({
      lifecycle: "open",
      mark: "failing",
      label: "Merge conflicts · CI failing (2 of 34) · changes requested",
    });
  });

  it("names the reviewers a pull request is waiting on", () => {
    expect(
      pullRequestSignal(
        pr(),
        details({
          mergeStateStatus: "BLOCKED",
          reviewDecision: "REVIEW_REQUIRED",
          requestedReviewers: ["Blake Wills", "octo-team"],
        }),
      ),
    ).toEqual({
      lifecycle: "open",
      mark: "waiting",
      label: "Waiting on review from Blake Wills, octo-team",
    });
  });

  it("separates an approved pull request waiting on CI from one waiting on review", () => {
    expect(
      pullRequestSignal(
        pr(),
        details({
          mergeStateStatus: "BLOCKED",
          reviewDecision: "APPROVED",
          checks: { state: "pending", total: 35, passed: 30, failed: 0, pending: 5 },
        }),
      ),
    ).toEqual({
      lifecycle: "open",
      mark: "waiting",
      label: "Approved · waiting on CI (30/35)",
    });
  });

  it("names everything a pull request is waiting on at once", () => {
    expect(
      pullRequestSignal(
        pr(),
        details({
          mergeStateStatus: "BLOCKED",
          reviewDecision: "REVIEW_REQUIRED",
          checks: { state: "pending", total: 3, passed: 2, failed: 0, pending: 1 },
        }),
      ).label,
    ).toBe("Waiting on review and CI (2/3)");
  });

  it("explains a blocked pull request with no other reason", () => {
    expect(pullRequestSignal(pr(), details({ mergeStateStatus: "BEHIND" })).label)
      .toBe("Branch is behind its base");
    expect(pullRequestSignal(pr(), details({ mergeStateStatus: "BLOCKED" })).label)
      .toBe("Blocked by branch protection");
  });

  it("marks a clean pull request ready to merge", () => {
    expect(pullRequestSignal(pr(), details({ reviewDecision: "APPROVED" })))
      .toEqual({ lifecycle: "open", mark: "ready", label: "Approved · ready to merge" });
    expect(pullRequestSignal(pr(), details({ checks: { state: "none", total: 0, passed: 0, failed: 0, pending: 0 } })))
      .toEqual({ lifecycle: "open", mark: "ready", label: "Ready to merge" });
  });

  it("leaves the mark off while GitHub is still computing mergeability", () => {
    expect(pullRequestSignal(pr(), details({ mergeStateStatus: "UNKNOWN", mergeable: "UNKNOWN" })))
      .toEqual({ lifecycle: "open", mark: null, label: null });
  });

  it("shows auto-merge and the merge queue as the auto lifecycle", () => {
    expect(
      pullRequestSignal(
        pr(),
        details({
          autoMerge: true,
          mergeStateStatus: "BLOCKED",
          checks: { state: "pending", total: 35, passed: 30, failed: 0, pending: 5 },
        }),
      ),
    ).toEqual({
      lifecycle: "auto",
      mark: "waiting",
      label: "Auto-merge on · waiting on CI (30/35)",
    });
    expect(
      pullRequestSignal(
        pr(),
        details({
          autoMerge: true,
          mergeStateStatus: "BLOCKED",
          checks: { state: "failure", total: 35, passed: 34, failed: 1, pending: 0 },
        }),
      ),
    ).toEqual({
      lifecycle: "auto",
      mark: "failing",
      label: "Auto-merge on · CI failing (1 of 35)",
    });
    expect(pullRequestSignal(pr(), details({ inMergeQueue: true })))
      .toEqual({ lifecycle: "auto", mark: "waiting", label: "Queued to merge" });
  });
});
