import { describe, expect, it } from "vitest";
import type { ThreadListIndicatorState } from "../../app/model/thread-activity.js";
import { ribbonThreadStatus } from "./status";

const idle: ThreadListIndicatorState = {
  hasPendingInteraction: false,
  hasUnsubmittedDraft: false,
  hasUnreadError: false,
  hasUnreadSuccess: false,
  isBackgroundAgentActive: false,
  isBackgroundCommandActive: false,
  isGoalActive: false,
  isPlanModeActive: false,
  isRuntimeActive: false,
  isWorkflowActive: false,
  queuedWork: "none",
};

describe("Ribbon row status", () => {
  it("shows the upstream runtime indicator for a running agent", () => {
    const status = ribbonThreadStatus({ ...idle, isRuntimeActive: true }, null, null);
    expect(status.indicator).toBe("runtime");
    expect(status.isAgentWorking).toBe(true);
    expect(status.isWorking).toBe(true);
  });

  it("lets a question outrank runtime activity", () => {
    const status = ribbonThreadStatus(
      { ...idle, isRuntimeActive: true, hasPendingInteraction: true },
      null,
      null,
    );
    expect(status.indicator).toBe("waiting-for-input");
    expect(status.isAgentWorking).toBe(false);
  });

  it.each([
    ["isBackgroundAgentActive", "background-agent"],
    ["isBackgroundCommandActive", "background-command"],
    ["isWorkflowActive", "workflow"],
  ] as const)("shows %s without treating the agent as working", (key, indicator) => {
    const status = ribbonThreadStatus({ ...idle, [key]: true }, null, null);
    expect(status).toMatchObject({ indicator, isAgentWorking: false, isWorking: false });
  });

  it("keeps runtime activity ahead of background work", () => {
    const status = ribbonThreadStatus(
      { ...idle, isRuntimeActive: true, isBackgroundCommandActive: true },
      null,
      null,
    );
    expect(status).toMatchObject({
      indicator: "runtime",
      isAgentWorking: true,
      isWorking: true,
    });
  });

  it("keeps runtime ahead of plugin status and pull request marks", () => {
    const status = ribbonThreadStatus(
      { ...idle, isRuntimeActive: true },
      { icon: "Save", label: "Saving", tone: "running" },
      { lifecycle: "open", mark: "failing", label: "CI failing" },
    );
    expect(status).toMatchObject({
      indicator: "runtime", indicatorLabel: "Thread working",
      pluginStatus: null, pullRequestMark: null,
    });
  });

  it("lets a failing pull request outrank an unread completion, and a ready one wait", () => {
    const unread = { ...idle, hasUnreadSuccess: true };
    expect(
      ribbonThreadStatus(unread, null, { lifecycle: "open", mark: "failing", label: "CI failing" }, true),
    ).toMatchObject({ pullRequestMark: "failing", indicatorLabel: "CI failing" });
    expect(
      ribbonThreadStatus(unread, null, { lifecycle: "open", mark: "ready", label: "Ready" }, true),
    ).toMatchObject({ pullRequestMark: null, indicator: "unread-success" });
    expect(
      ribbonThreadStatus(idle, null, { lifecycle: "open", mark: "ready", label: "Ready" }, true),
    ).toMatchObject({ pullRequestMark: "ready" });
  });
});

it("hides only the unread success marker by default and can restore it", () => {
  const unread = { ...idle, hasUnreadSuccess: true };
  expect(ribbonThreadStatus(unread, null, null).indicator).toBe("none");
  expect(ribbonThreadStatus(unread, null, null, true).indicator).toBe("unread-success");
  expect(ribbonThreadStatus({ ...unread, hasUnreadError: true }, null, null).indicator).toBe("unread-error");
  expect(ribbonThreadStatus({ ...unread, isRuntimeActive: true }, null, null).indicator).toBe("runtime");
});
