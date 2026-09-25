import type { PluginSidebarThreadIndicator } from "@get-bb/plugin-sdk/app";
import { describe, expect, it } from "vitest";
import type { PullRequestMark } from "./pull-request-status";
import { withPullRequestSignal, type ThreadStatus } from "./thread-status";

function status(
  indicator: PluginSidebarThreadIndicator,
  overrides: Partial<ThreadStatus> = {},
): ThreadStatus {
  return {
    indicator,
    indicatorLabel: indicator === "none" ? null : indicator,
    isWorking: false,
    spinsStageRing: false,
    pluginStatus: null,
    pullRequestMark: null,
    ...overrides,
  };
}

function shown(indicator: PluginSidebarThreadIndicator, mark: PullRequestMark) {
  const result = withPullRequestSignal(status(indicator), {
    lifecycle: "open",
    mark,
    label: `PR ${mark}`,
  });
  return result.pullRequestMark ?? result.indicator;
}

describe("withPullRequestSignal", () => {
  it("never hides the agent's errors, questions, or work", () => {
    for (const indicator of ["unread-error", "waiting-for-input", "runtime", "plan-mode", "working-draft"] as const) {
      expect(shown(indicator, "failing")).toBe(indicator);
    }
  });

  it("ranks a failing pull request above everything the agent has finished", () => {
    expect(shown("queued-failed", "failing")).toBe("queued-failed");
    expect(shown("unread-success", "failing")).toBe("failing");
    expect(shown("draft", "failing")).toBe("failing");
  });

  it("shows a ready pull request only once the thread is read", () => {
    expect(shown("unread-success", "ready")).toBe("unread-success");
    expect(shown("queued-waiting", "ready")).toBe("ready");
    expect(shown("none", "ready")).toBe("ready");
  });

  it("shows a waiting pull request only when nothing else needs the row", () => {
    expect(shown("draft", "waiting")).toBe("draft");
    expect(shown("none", "waiting")).toBe("waiting");
  });

  it("labels the row with what the pull request is waiting on", () => {
    expect(
      withPullRequestSignal(status("none"), {
        lifecycle: "auto",
        mark: "waiting",
        label: "Auto-merge on · waiting on CI (30/35)",
      }),
    ).toMatchObject({
      pullRequestMark: "waiting",
      indicatorLabel: "Auto-merge on · waiting on CI (30/35)",
    });
  });

  it("leaves another plugin's row status in place", () => {
    const pluginStatus = { icon: "Workflow", label: "Workflow running" } as const;
    expect(
      withPullRequestSignal(status("none", { pluginStatus }), {
        lifecycle: "open",
        mark: "failing",
        label: "CI failing",
      }).pullRequestMark,
    ).toBeNull();
  });
});
