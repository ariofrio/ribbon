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
  queued: { mark: "waiting", label: "Queued to merge" },
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

function publicSignal(pullRequest: SidebarPullRequest): PullRequestSignal {
  if (pullRequest.experimental_inMergeQueue || pullRequest.attention === "queued") {
    return { lifecycle: "auto", mark: "waiting", label: "Queued to merge" };
  }
  const autoMerge = pullRequest.experimental_autoMerge;
  const prefix = autoMerge ? ["Auto-merge on"] : [];
  const failing: string[] = [];
  if (pullRequest.experimental_mergeability.state === "conflicts")
    failing.push("Merge conflicts");
  if (pullRequest.experimental_checks.state === "failing")
    failing.push("CI failing");
  if (pullRequest.experimental_review.state === "changes_requested")
    failing.push("Changes requested");
  if (failing.length > 0) {
    return {
      lifecycle: autoMerge ? "auto" : "open",
      mark: "failing",
      label: joinReasons([...prefix, ...failing]),
    };
  }
  const approved =
    pullRequest.experimental_review.state === "approved" ? ["Approved"] : [];
  const waiting: string[] = [];
  if (
    ["review_required", "review_requested"].includes(
      pullRequest.experimental_review.state,
    )
  )
    waiting.push("review");
  if (pullRequest.experimental_checks.state === "pending") waiting.push("CI");
  const signal =
    waiting.length > 0
      ? { mark: "waiting" as const, label: `Waiting on ${waiting.join(" and ")}` }
      : ATTENTION_SIGNALS[pullRequest.attention] ??
        (pullRequest.experimental_mergeability.state === "blocked"
          ? { mark: "waiting" as const, label: "Blocked by branch protection" }
          : null);
  const reasons = [...prefix, ...approved, ...(signal ? [signal.label] : [])];
  return {
    lifecycle: autoMerge ? "auto" : "open",
    mark: signal?.mark ?? null,
    label: reasons.length > 0 ? joinReasons(reasons) : null,
  };
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
    return publicSignal(pullRequest);
  }
  return {
    lifecycle: details.autoMerge || details.inMergeQueue ? "auto" : "open",
    ...detailedSignal(details),
  };
}
