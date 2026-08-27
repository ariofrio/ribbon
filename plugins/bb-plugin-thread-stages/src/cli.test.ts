import { describe, expect, it, vi } from "vitest";
import { runForwardedThreadWorkflowCli } from "./cli";
import type { RibbonSidebarClient } from "./ribbon-sidebar-client";

function placement(threadId: string, groupId = "Idle") {
  return {
    groupingKey: "plugin:thread-stages:stages" as const,
    groupId,
    threadId,
    enteredAtMs: 10,
    origin: "cli" as const,
  };
}

function client(overrides: Partial<RibbonSidebarClient> = {}): RibbonSidebarClient {
  return {
    getPlacementV1: vi.fn(async ({ threadId }) => ({
      ok: true as const,
      value: { placement: placement(threadId), revision: 2 },
    })),
    listPlacementsV1: vi.fn(async () => ({
      ok: true as const,
      value: {
        groupingKey: "plugin:thread-stages:stages" as const,
        revision: 2,
        items: [placement("thread-a")],
      },
    })),
    updatePlacementV1: vi.fn(async ({ threadId, groupId }) => ({
      ok: true as const,
      value: {
        placement: placement(threadId, groupId),
        revision: 3,
      },
    })),
    invalidateGroupingCatalogV1: vi.fn(async () => null),
    ...overrides,
  };
}

describe("Thread stages CLI through Ribbon", () => {
  it("lists and filters authoritative Ribbon placements", async () => {
    const ribbon = client();
    await expect(
      runForwardedThreadWorkflowCli(ribbon, ["list", "--stage", "idle", "--json"], {
        listThreadIds: ["thread-a"],
      }),
    ).resolves.toMatchObject({ exitCode: 0, stdout: expect.stringContaining('"id": "thread-a"') });
    expect(ribbon.listPlacementsV1).toHaveBeenCalledWith({
      groupingKey: "plugin:thread-stages:stages",
      threadIds: ["thread-a"],
      groupIds: ["Idle"],
    });
  });

  it("shows the current thread with --self", async () => {
    await expect(
      runForwardedThreadWorkflowCli(client(), ["show", "--self", "--json"], {
        threadId: "thread-a",
      }),
    ).resolves.toMatchObject({ exitCode: 0, stdout: expect.stringContaining('"workflowStage": "Idle"') });
  });

  it("updates placement with compare-and-swap and CLI provenance", async () => {
    const ribbon = client();
    await expect(
      runForwardedThreadWorkflowCli(ribbon, [
        "update",
        "thread-a",
        "--stage",
        "completed",
      ]),
    ).resolves.toMatchObject({ exitCode: 0 });
    expect(ribbon.updatePlacementV1).toHaveBeenCalledWith({
      groupingKey: "plugin:thread-stages:stages",
      groupId: "Completed",
      threadId: "thread-a",
      anchor: { kind: "end" },
      expectedRevision: 2,
      origin: "cli",
    });
  });

  it("rejects child thread IDs before calling Ribbon", async () => {
    const ribbon = client();
    await expect(
      runForwardedThreadWorkflowCli(ribbon, ["show", "child"], {
        rootIdsByThreadId: new Map([
          ["root", "root"],
          ["child", "root"],
        ]),
      }),
    ).resolves.toMatchObject({
      exitCode: 1,
      stderr: expect.stringContaining("stage belongs to root thread root"),
    });
    expect(ribbon.getPlacementV1).not.toHaveBeenCalled();
  });

  it("explains that Ribbon is required when it cannot be reached", async () => {
    const ribbon = client({
      listPlacementsV1: vi.fn(async () => {
        throw new Error("Ribbon sidebar dependency problem: connection refused");
      }),
    });
    await expect(
      runForwardedThreadWorkflowCli(ribbon, ["list"]),
    ).resolves.toMatchObject({
      exitCode: 1,
      stderr: expect.stringContaining("Ribbon sidebar dependency problem"),
    });
  });
});
