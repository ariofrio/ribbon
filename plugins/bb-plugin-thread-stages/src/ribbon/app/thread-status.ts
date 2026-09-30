import type {
  PluginSidebarThreadIndicator,
  PluginSidebarThreadRowStatus,
} from "@get-bb/plugin-sdk/app";
import type { PullRequestMark, PullRequestSignal } from "../pull-request-status";

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
