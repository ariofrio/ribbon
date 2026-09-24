import type {
  PluginSidebarThread,
  PluginSidebarThreadIndicator,
  PluginSidebarThreadRowStatus,
} from "@get-bb/plugin-sdk/app";

export interface ThreadStatus {
  indicator: PluginSidebarThreadIndicator;
  indicatorLabel: string | null;
  isWorking: boolean;
  pluginStatus: PluginSidebarThreadRowStatus | null;
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
    : active.has("runtime") ? "runtime"
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
    pluginStatus: visiblePluginStatus,
  };
}
