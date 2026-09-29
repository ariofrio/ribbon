import type { PluginSidebarThreadRowStatus } from "@get-bb/plugin-sdk/app";
import {
  hasThreadListWorkingActivity,
  resolveThreadListIndicator,
  type ThreadListIndicatorState,
} from "../../app/model/thread-activity.js";
import type { PullRequestSignal } from "../pull-request-status";
import { withPullRequestSignal, type ThreadStatus } from "./thread-status";

const LABELS: Record<ThreadStatus["indicator"], string | null> = {
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

/**
 * Ribbon's row status from the indicator state bb's list already resolves
 * for a row, hidden children included. A running agent turns the stage ring
 * rather than showing bb's spinner, so runtime alone is no indicator here; a
 * pull request's mark then slots in by how urgently it needs the user.
 */
export function ribbonThreadStatus(
  state: ThreadListIndicatorState,
  pluginStatus: PluginSidebarThreadRowStatus | null,
  pullRequest: PullRequestSignal | null,
): ThreadStatus {
  const resolved = resolveThreadListIndicator(state);
  const hasWork = hasThreadListWorkingActivity(state);
  const indicator =
    resolved === "runtime"
      ? resolveThreadListIndicator({ ...state, isRuntimeActive: false })
      : resolved;
  const visiblePluginStatus = ["runtime", "unread-error", "waiting-for-input"].includes(
    indicator,
  )
    ? null
    : pluginStatus;
  const status: ThreadStatus = {
    indicator,
    indicatorLabel: visiblePluginStatus?.label ?? LABELS[indicator],
    isWorking: hasWork || pluginStatus?.tone === "running",
    spinsStageRing: hasWork && indicator !== "waiting-for-input",
    pluginStatus: visiblePluginStatus,
    pullRequestMark: null,
  };
  return withPullRequestSignal(status, pullRequest);
}
