import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  archiveEligibleCompletedThreads,
  autoArchiveDelayMs,
} from "./auto-archive";

const DAY = 24 * 60 * 60 * 1_000;

function thread(
  id: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    id,
    parentThreadId: null,
    visibility: "visible",
    archivedAt: null,
    pinnedAt: null,
    lastReadAt: 20,
    latestAttentionAt: 10,
    hasPendingInteraction: false,
    status: "idle",
    runtime: { displayStatus: "idle", hostReconnectGraceExpiresAt: null },
    activity: {
      activeBackgroundAgentCount: 0,
      activeBackgroundCommandCount: 0,
      activeGoalCount: 0,
      activePlanModeCount: 0,
      activeWorkflowCount: 0,
    },
    ...overrides,
  };
}

afterEach(() => vi.useRealTimers());

describe("completed auto-archive", () => {
  it("maps each retention choice and keeps Never disabled", () => {
    expect(autoArchiveDelayMs("Never")).toBeNull();
    expect(autoArchiveDelayMs("1 day")).toBe(DAY);
    expect(autoArchiveDelayMs("7 days")).toBe(7 * DAY);
    expect(autoArchiveDelayMs("30 days")).toBe(30 * DAY);
  });

  it("archives unpinned Completed hierarchies bottom-up with archiveAll", async () => {
    const now = 10 * DAY;
    const source = {
      listCompletedBefore: vi.fn(async () => [
        { threadId: "active-root", enteredAt: now - 2 * DAY },
        { threadId: "pinned-root", enteredAt: now - 2 * DAY },
        { threadId: "pinned-tree", enteredAt: now - 2 * DAY },
      ]),
    };

    const threads = [
      thread("active-root", {
        hasPendingInteraction: true,
        lastReadAt: null,
        status: "active",
      }),
      thread("active-child", {
        parentThreadId: "active-root",
        status: "active",
      }),
      thread("active-grandchild", {
        hasPendingInteraction: true,
        parentThreadId: "active-child",
      }),
      thread("pinned-root", { pinnedAt: 1 }),
      thread("pinned-tree"),
      thread("pinned-child", { parentThreadId: "pinned-tree" }),
      thread("pinned-grandchild", {
        parentThreadId: "pinned-child",
        pinnedAt: 1,
      }),
      thread("recent"),
    ];
    const archiveAll = vi.fn(async ({ threadId }: { threadId: string }) => ({
      archivedThreadIds: [threadId],
      ok: true as const,
    }));
    const bb = {
      sdk: {
        threads: {
          list: vi.fn(async () => threads),
          archiveAll,
        },
      },
      log: { warn: vi.fn(), info: vi.fn() },
    } as unknown as BbPluginApi;

    await expect(
      archiveEligibleCompletedThreads(bb, source, DAY, now),
    ).resolves.toEqual(["active-root"]);
    expect(archiveAll.mock.calls.map(([call]) => call.threadId)).toEqual([
      "active-grandchild",
      "active-child",
      "active-root",
    ]);
  });

  it("does not archive an ancestor after a descendant fails", async () => {
    const now = 10 * DAY;
    const source = {
      listCompletedBefore: vi.fn(async () => [
        { threadId: "root-a", enteredAt: now - 2 * DAY },
        { threadId: "root-b", enteredAt: now - 2 * DAY },
      ]),
    };

    const threads = [
      thread("root-a"),
      thread("child-a", { parentThreadId: "root-a" }),
      thread("root-b"),
    ];
    const archiveAll = vi.fn(async ({ threadId }: { threadId: string }) => {
      if (threadId === "child-a") throw new Error("archive failed");
      return { archivedThreadIds: [threadId], ok: true as const };
    });
    const warn = vi.fn();
    const bb = {
      sdk: {
        threads: {
          list: vi.fn(async () => threads),
          archiveAll,
        },
      },
      log: { warn, info: vi.fn() },
    } as unknown as BbPluginApi;

    await expect(
      archiveEligibleCompletedThreads(bb, source, DAY, now),
    ).resolves.toEqual(["root-b"]);
    expect(archiveAll.mock.calls.map(([call]) => call.threadId)).toEqual([
      "child-a",
      "root-b",
    ]);
    expect(warn).toHaveBeenCalledWith(
      "Could not auto-archive root-a: archive failed",
    );
  });

  it("accepts authoritative Completed candidates from Ribbon sidebar", async () => {
    const listCompletedBefore = vi.fn(async () => [
      { threadId: "root", enteredAt: 100 },
    ]);
    const archiveAll = vi.fn(async () => ({
      archivedThreadIds: ["root"],
      ok: true as const,
    }));
    const bb = {
      sdk: {
        threads: {
          list: vi.fn(async () => [thread("root")]),
          archiveAll,
        },
      },
      log: { warn: vi.fn(), info: vi.fn() },
    } as unknown as BbPluginApi;

    await expect(
      archiveEligibleCompletedThreads(
        bb,
        { listCompletedBefore },
        DAY,
        2 * DAY,
      ),
    ).resolves.toEqual(["root"]);
    expect(listCompletedBefore).toHaveBeenCalledWith(DAY);
  });
});
