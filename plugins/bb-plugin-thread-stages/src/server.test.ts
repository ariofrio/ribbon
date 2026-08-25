import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import plugin from "./server";

const disposers: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(disposers.splice(0).map((dispose) => dispose()));
  vi.unstubAllGlobals();
});

function jsonResponse(result: unknown): Response {
  return new Response(JSON.stringify({ ok: true, result }), {
    headers: { "content-type": "application/json" },
  });
}

function createHarness(options: Parameters<typeof createFakePluginHost>[0] = {}) {
  const host = createFakePluginHost({ pluginId: "thread-stages", ...options });
  plugin(host.bb);
  disposers.push(() => host.harness.lifecycle.dispose());
  return host.harness;
}

describe("thread stages provider", () => {
  it("registers only provider, shortcut, automation, retention, and CLI surfaces", () => {
    const harness = createHarness();

    expect(harness.inspection.registrations.settingsDescriptors).toEqual({
      showDeferredStage: expect.objectContaining({ default: true }),
      showBlockedStage: expect.objectContaining({ default: true }),
      autoArchiveCompletedAfter: expect.objectContaining({ default: "7 days" }),
    });
    expect(harness.inspection.registrations.rpcMethods).toEqual([
      "setWorkflowStage",
      "reorderThread",
      "listAppKeybindings",
      "getGroupingCatalogV1",
    ]);
    expect(
      harness.inspection.registrations.services.map(({ name }) => name),
    ).toEqual(["stage-automation"]);
    expect(harness.inspection.registrations.schedules).toMatchObject([
      { name: "stage-automation-reconciliation", cron: "* * * * *" },
      { name: "completed-auto-archive", cron: "17 * * * *" },
    ]);
    expect(harness.inspection.registrations.cli?.name).toBe("thread-stages");
  });

  it("publishes the stage catalog without exposing migration RPCs", async () => {
    const harness = createHarness();

    await expect(
      harness.behavior.callRpc("getGroupingCatalogV1", null),
    ).resolves.toMatchObject({
      protocolVersion: 1,
      groupings: [{ id: "stages", defaultGroupId: "Idle" }],
    });
    expect(harness.inspection.registrations.rpcMethods).not.toContain(
      "getPlacementMigrationSnapshotV1",
    );
    expect(harness.inspection.registrations.rpcMethods).not.toContain(
      "acknowledgePlacementMigrationV1",
    );
  });

  it("writes shortcut stage changes directly to Ribbon without a handoff", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/rpc/listPlacementsV1")) {
        return jsonResponse({
          ok: true,
          value: {
            groupingKey: "plugin:thread-stages:stages",
            revision: 4,
            items: [
              {
                groupingKey: "plugin:thread-stages:stages",
                groupId: "Idle",
                threadId: "thread-a",
                enteredAtMs: 1,
                origin: "auto",
              },
            ],
          },
        });
      }
      if (url.endsWith("/rpc/updatePlacementV1")) {
        return jsonResponse({
          ok: true,
          value: {
            placement: {
              groupingKey: "plugin:thread-stages:stages",
              groupId: "Completed",
              threadId: "thread-a",
              enteredAtMs: 2,
              previousGroupId: "Idle",
              origin: "ui",
            },
            revision: 5,
          },
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetcher);
    const thread = {
      id: "thread-a",
      projectId: "project-a",
      parentThreadId: null,
      visibility: "visible" as const,
      archivedAt: null,
      pinnedAt: null,
      pinSortKey: null,
      createdAt: 1,
    };
    const harness = createHarness({
      sdk: { threads: { list: vi.fn(async () => [thread] as never) } },
    });

    await expect(
      harness.behavior.callRpc("setWorkflowStage", {
        threadId: "thread-a",
        workflowStage: "Completed",
      }),
    ).resolves.toEqual({ destination: { kind: "compose" } });
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining("/ribbon-sidebar/rpc/updatePlacementV1"),
      expect.objectContaining({
        body: JSON.stringify({
          groupingKey: "plugin:thread-stages:stages",
          groupId: "Completed",
          threadId: "thread-a",
          anchor: { kind: "end" },
          expectedRevision: 4,
          origin: "ui",
        }),
      }),
    );
  });

  it("reports the required Ribbon dependency through the existing CLI", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("connection refused");
    }));
    const harness = createHarness({
      sdk: { threads: { list: vi.fn(async () => [] as never) } },
    });

    await expect(harness.behavior.runCli(["list"])).resolves.toMatchObject({
      exitCode: 1,
      stderr: expect.stringContaining("Ribbon sidebar dependency problem"),
    });
  });
});
