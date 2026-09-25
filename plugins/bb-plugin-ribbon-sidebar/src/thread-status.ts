import type {
  PluginSidebarThread,
  PluginSidebarThreadIndicator,
  PluginSidebarThreadRowStatus,
} from "@get-bb/plugin-sdk/app";
import type { PullRequestMark, PullRequestSignal } from "./pull-request-status";

export interface ThreadStatus {
  indicator: PluginSidebarThreadIndicator;
  indicatorLabel: string | null;
  isWorking: boolean;
  /** An agent is working and nothing it asked for outranks that. */
  spinsStageRing: boolean;
  pluginStatus: PluginSidebarThreadRowStatus | null;
  /** Set when the row's pull request outranks the thread's own indicator. */
  pullRequestMark: PullRequestMark | null;
}

const LABELS: Record<PluginSidebarThreadIndicator, string | null> = {
  "unread-error": "Unread thread failed",
  "waiting-for-input": "Thread needs user input",
  "working-draft": "Thread working with unsubmitted draft",
  "plan-mode": "Plan mode active",
  goal: "Goal active",
  runtime: "Thread working",
  workflow: "Workflow running",
  "background-agent": "Background agent running",
  "background-command": "Background command running",
  "queued-failed": "Queued message failed to send",
  "unread-success": "Unread thread succeeded",
  "queued-waiting": "Thread has a message waiting to send",
  draft: "Thread has unsubmitted draft",
  none: null,
};

const WORK: readonly [PluginSidebarThreadIndicator, keyof PluginSidebarThread["activity"]][] = [
  ["plan-mode", "planMode"],
  ["goal", "goals"],
  ["workflow", "workflows"],
  ["background-agent", "backgroundAgents"],
  ["background-command", "backgroundCommands"],
];

// Match bb 0.43.4's resolveThreadListIndicator and ThreadRow: hidden children
// contribute attention, work and drafts, but only the row's own queue counts.
// https://github.com/get-bb/bb/blob/desktop-v0.43.4/packages/client-core/src/thread/thread-activity.ts
export function resolveThreadStatus(
  threads: readonly PluginSidebarThread[],
  draftIds: ReadonlySet<string>,
  pluginStatus: PluginSidebarThreadRowStatus | null = null,
  /** Rows leave runtime to their stage ring; headings have no ring. */
  { showRuntime = true }: { showRuntime?: boolean } = {},
): ThreadStatus {
  const has = (kind: PluginSidebarThreadIndicator) =>
    threads.some((thread) => thread.indicator === kind);
  const active = new Set<PluginSidebarThreadIndicator>();
  for (const thread of threads) {
    for (const [kind, activity] of WORK) {
      if (thread.activity[activity] > 0 || thread.indicator === kind) active.add(kind);
    }
    if (
      thread.indicator === "runtime" ||
      ["active", "host-reconnecting", "provisioning", "starting", "stopping"].includes(thread.runtimeStatus)
    ) active.add("runtime");
  }
  const hasWork = active.size > 0 || has("working-draft");
  const hasDraft = threads.some((thread) => draftIds.has(thread.id)) || has("draft") || has("working-draft");
  const root = threads[0];
  const queued = root?.queuedWork === "failed" || root?.indicator === "queued-failed"
    ? "failed"
    : root?.queuedWork === "waiting" || root?.indicator === "queued-waiting"
      ? "waiting"
      : "none";
  const indicator: PluginSidebarThreadIndicator =
    has("unread-error") ? "unread-error"
    : has("waiting-for-input") || threads.some((thread) => thread.hasPendingInteraction) ? "waiting-for-input"
    : hasDraft && hasWork ? "working-draft"
    : active.has("plan-mode") ? "plan-mode"
    : active.has("goal") ? "goal"
    : showRuntime && active.has("runtime") ? "runtime"
    : active.has("workflow") ? "workflow"
    : active.has("background-agent") ? "background-agent"
    : active.has("background-command") ? "background-command"
    : queued === "failed" ? "queued-failed"
    : has("unread-success") ? "unread-success"
    : queued === "waiting" ? "queued-waiting"
    : hasDraft ? "draft"
    : "none";
  const visiblePluginStatus = ["runtime", "unread-error", "waiting-for-input"].includes(indicator)
    ? null
    : pluginStatus;
  return {
    indicator,
    indicatorLabel: visiblePluginStatus?.label
      ?? threads.find((thread) => thread.indicator === indicator)?.indicatorLabel
      ?? LABELS[indicator],
    isWorking: hasWork || pluginStatus?.tone === "running",
    spinsStageRing: hasWork && indicator !== "waiting-for-input",
    pluginStatus: visiblePluginStatus,
    pullRequestMark: null,
  };
}

// Pull request marks slot into bb's order by whether they need the user now:
// a failing PR outranks finished agent work, a ready one waits until the
// thread is read, and a waiting one never hides anything the user can act on.
const INDICATOR_RANK: Record<PluginSidebarThreadIndicator, number> = {
  "unread-error": 0,
  "waiting-for-input": 1,
  "working-draft": 2,
  "plan-mode": 2,
  goal: 2,
  runtime: 2,
  workflow: 2,
  "background-agent": 2,
  "background-command": 2,
  "queued-failed": 3,
  "unread-success": 5,
  "queued-waiting": 7,
  draft: 8,
  none: 10,
};
const PULL_REQUEST_MARK_RANK: Record<PullRequestMark, number> = {
  failing: 4,
  ready: 6,
  waiting: 9,
};

export function withPullRequestSignal(
  status: ThreadStatus,
  signal: PullRequestSignal | null,
): ThreadStatus {
  if (
    signal?.mark == null ||
    status.pluginStatus !== null ||
    PULL_REQUEST_MARK_RANK[signal.mark] > INDICATOR_RANK[status.indicator]
  ) {
    return status;
  }
  return {
    ...status,
    indicatorLabel: signal.label,
    pullRequestMark: signal.mark,
  };
}
