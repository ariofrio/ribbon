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
  it("turns the stage ring for a running agent instead of showing a spinner", () => {
    const status = ribbonThreadStatus({ ...idle, isRuntimeActive: true }, null, null);
    expect(status.indicator).toBe("none");
    expect(status.spinsStageRing).toBe(true);
    expect(status.isWorking).toBe(true);
  });

  it("stops the ring for a question and keeps the question's indicator", () => {
    const status = ribbonThreadStatus(
      { ...idle, isRuntimeActive: true, hasPendingInteraction: true },
      null,
      null,
    );
    expect(status.indicator).toBe("waiting-for-input");
    expect(status.spinsStageRing).toBe(false);
  });

  it.each([
    ["isBackgroundAgentActive", "background-agent"],
    ["isBackgroundCommandActive", "background-command"],
    ["isWorkflowActive", "workflow"],
  ] as const)("leaves an idle agent's ring still while %s, showing its icon", (key, indicator) => {
    const status = ribbonThreadStatus({ ...idle, [key]: true }, null, null);
    expect(status).toMatchObject({ indicator, spinsStageRing: false, isWorking: false });
  });

  it("turns the ring for a working agent and shows its background work", () => {
    const status = ribbonThreadStatus(
      { ...idle, isRuntimeActive: true, isBackgroundCommandActive: true },
      null,
      null,
    );
    expect(status).toMatchObject({
      indicator: "background-command",
      spinsStageRing: true,
      isWorking: true,
    });
  });

  it("lets a failing pull request outrank an unread completion, and a ready one wait", () => {
    const unread = { ...idle, hasUnreadSuccess: true };
    expect(
      ribbonThreadStatus(unread, null, { lifecycle: "open", mark: "failing", label: "CI failing" }),
    ).toMatchObject({ pullRequestMark: "failing", indicatorLabel: "CI failing" });
    expect(
      ribbonThreadStatus(unread, null, { lifecycle: "open", mark: "ready", label: "Ready" }),
    ).toMatchObject({ pullRequestMark: null, indicator: "unread-success" });
    expect(
      ribbonThreadStatus(idle, null, { lifecycle: "open", mark: "ready", label: "Ready" }),
    ).toMatchObject({ pullRequestMark: "ready" });
  });
});
