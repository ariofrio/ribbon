import { THREAD_STAGE_SOURCE_MIGRATIONS } from "./migration-source";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import plugin from "./server";

const disposers: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(disposers.splice(0).map((dispose) => dispose()));
  vi.unstubAllGlobals();
});

async function createHarness(
  options: Parameters<typeof createFakePluginHost>[0] = {},
) {
  const host = createFakePluginHost({
    pluginId: "thread-stages",
    ...options,
    sdk: { plugins: { callRpc: async () => null }, ...options.sdk },
  });
  await plugin(host.bb);
  disposers.push(() => host.harness.lifecycle.dispose());
  return host.harness;
}

describe("thread stages provider", () => {
  it("announces its grouping catalog to Ribbon during startup", async () => {
    const callRpc = vi.fn(async () => null);
    const host = createFakePluginHost({
      pluginId: "thread-stages",
      sdk: { plugins: { callRpc } },
    });
    await plugin(host.bb);
    disposers.push(() => host.harness.lifecycle.dispose());
    expect(callRpc).toHaveBeenCalledWith(
      expect.objectContaining({
        pluginId: "ribbon-sidebar",
        method: "invalidateGroupingCatalogV1",
        input: { providerPluginId: "thread-stages" },
      }),
    );
  });

  it("registers only provider, shortcut, automation, and retention surfaces", async () => {
    const harness = await createHarness();

    expect(harness.inspection.registrations.settingsDescriptors).toEqual({
      showDeferredStage: expect.objectContaining({ default: true }),
      showBlockedStage: expect.objectContaining({ default: true }),
      autoArchiveCompletedAfter: expect.objectContaining({
        default: "7 days",
        description:
          "Archive unpinned Completed thread hierarchies after the selected time without a root or descendant thread update.",
      }),
    });
    expect(harness.inspection.registrations.rpcMethods).toEqual([
      "setWorkflowStage",
      "reorderThread",
      "listAppKeybindings",
      "getGroupingCatalogV1",
      "getPlacementMigrationSnapshotV1",
      "acknowledgePlacementMigrationV1",
    ]);
    expect(
      harness.inspection.registrations.services.map(({ name }) => name),
    ).toEqual(["stage-automation"]);
    expect(harness.inspection.registrations.schedules).toMatchObject([
      { name: "stage-automation-reconciliation", cron: "* * * * *" },
      { name: "completed-auto-archive", cron: "17 * * * *" },
    ]);
    expect(harness.inspection.registrations.cli).toBeNull();
  });

  it("keeps legacy placement readable until Ribbon acknowledges a durable import", async () => {
    const host = createFakePluginHost({
      pluginId: "thread-stages",
      sdk: { plugins: { callRpc: async () => null } },
    });
    const database = host.bb.storage.database();
    host.bb.storage.migrate(database, THREAD_STAGE_SOURCE_MIGRATIONS);
    database.exec(`
      INSERT OR REPLACE INTO thread_stage_migration_meta(
        singleton, source_schema, installation_id, revision, placement_owner
      ) VALUES (1, 1, '${"a".repeat(32)}', 7, 'thread-stages');
      INSERT INTO thread_organization(
        thread_id, status, position, updated_at, sort_key,
        moved_by, previous_status, previous_sort_key
      ) VALUES
        ('thread-a', 'Active', 0, 300, 'B', 'app', 'Idle', 'A'),
        ('thread-b', 'Idle', 1, 100, 'B', 'auto', NULL, NULL);
      INSERT INTO thread_stage_entry(thread_id, entered_at) VALUES
        ('thread-a', 200), ('thread-b', 100);
      INSERT INTO thread_stage_order(thread_id, status, sort_key, updated_at) VALUES
        ('thread-a', 'Idle', 'A', 100),
        ('thread-a', 'Active', 'B', 300),
        ('thread-b', 'Idle', 'B', 100);
    `);
    await plugin(host.bb);
    disposers.push(() => host.harness.lifecycle.dispose());
    const { harness } = host;

    const snapshot = await harness.behavior.callRpc(
      "getPlacementMigrationSnapshotV1",
      null,
    );
    expect(snapshot).toEqual({
      sourcePluginId: "thread-stages",
      sourceSchema: 1,
      installationId: "a".repeat(32),
      revision: 7,
      placements: [
        {
          groupingId: "stages",
          threadId: "thread-b",
          groupId: "Idle",
          enteredAtMs: 100,
          updatedAtMs: 100,
          origin: "auto",
          orders: [{ groupId: "Idle", sortKey: "B", updatedAtMs: 100 }],
        },
        {
          groupingId: "stages",
          threadId: "thread-a",
          groupId: "Active",
          enteredAtMs: 200,
          updatedAtMs: 300,
          previousGroupId: "Idle",
          origin: "ui",
          orders: [
            { groupId: "Idle", sortKey: "A", updatedAtMs: 100 },
            { groupId: "Active", sortKey: "B", updatedAtMs: 300 },
          ],
        },
      ],
    });

    await expect(
      harness.behavior.callRpc("acknowledgePlacementMigrationV1", {
        installationId: "a".repeat(32),
        revision: 6,
      }),
    ).resolves.toEqual({ transferred: false });
    await expect(
      harness.behavior.callRpc("acknowledgePlacementMigrationV1", {
        installationId: "a".repeat(32),
        revision: 7,
      }),
    ).resolves.toEqual({ transferred: true });
    await expect(
      harness.behavior.callRpc("getPlacementMigrationSnapshotV1", null),
    ).resolves.toEqual(snapshot);
  });

  it("writes shortcut stage changes directly to Ribbon without a handoff", async () => {
    const callRpc = vi.fn(
      async ({ method, input }: { method: string; input?: unknown }) => {
        if (method === "invalidateGroupingCatalogV1") return null;
        if (method === "listPlacementsV1") {
          const request = input as {
            groupingKey: string;
          };
          if (request.groupingKey === "builtin:projects") {
            return {
              ok: true,
              value: {
                groupingKey: "builtin:projects",
                revision: 9,
                items: ["thread-a", "thread-c"].map((threadId) => ({
                  groupingKey: "builtin:projects",
                  groupId: "project-a",
                  threadId,
                  enteredAtMs: 1,
                })),
              },
            };
          }
          return {
            ok: true,
            value: {
              groupingKey: "plugin:thread-stages:stages",
              revision: 4,
              items: ["thread-a", "thread-b", "thread-c"].map((threadId) => ({
                groupingKey: "plugin:thread-stages:stages",
                groupId: "Idle",
                threadId,
                enteredAtMs: 1,
                origin: "auto",
              })),
            },
          };
        }
        if (method === "updatePlacementV1") {
          return {
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
          };
        }
        throw new Error(`Unexpected request: ${method}`);
      },
    );
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
    const threads = [
      thread,
      { ...thread, id: "thread-b", projectId: "project-b" },
      { ...thread, id: "thread-c" },
    ];
    const harness = await createHarness({
      sdk: {
        threads: { list: vi.fn(async () => threads as never) },
        plugins: { callRpc },
      },
    });

    await expect(
      harness.behavior.callRpc("setWorkflowStage", {
        threadId: "thread-a",
        workflowStage: "Completed",
        scope: {
          groupingKey: "builtin:projects",
          groupId: "project-a",
        },
      }),
    ).resolves.toEqual({
      destination: {
        kind: "thread",
        threadId: "thread-c",
        projectId: "project-a",
      },
    });
    expect(callRpc).toHaveBeenCalledWith(
      expect.objectContaining({
        pluginId: "ribbon-sidebar",
        method: "updatePlacementV1",
        input: {
          groupingKey: "plugin:thread-stages:stages",
          groupId: "Completed",
          threadId: "thread-a",
          anchor: { kind: "end" },
          expectedRevision: 4,
          origin: "ui",
        },
      }),
    );
  });
});
