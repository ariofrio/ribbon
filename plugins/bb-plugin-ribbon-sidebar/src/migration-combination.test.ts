import {
  createFakePluginHost,
  makeThreadResponse,
} from "@get-bb/plugin-sdk/testing";
import { afterEach, describe, expect, it } from "vitest";
import threadStagesPlugin from "../../bb-plugin-thread-stages/src/server";
import ribbonSidebarPlugin from "./server";

describe("Thread stages and Ribbon sidebar cutover", () => {
  const disposers: Array<() => Promise<void>> = [];

  afterEach(async () => {
    await Promise.all(disposers.splice(0).map((dispose) => dispose()));
  });

  it("restores retained placement after Ribbon is installed later and keeps the source readable", async () => {
    const threadStages = createFakePluginHost({ pluginId: "thread-stages" });
    threadStagesPlugin(threadStages.bb);
    disposers.push(() => threadStages.harness.lifecycle.dispose());
    const sourceDatabase = threadStages.bb.storage.database();
    sourceDatabase.exec(`
      UPDATE thread_stage_migration_meta
      SET installation_id = '${"a".repeat(32)}', revision = 7,
        placement_owner = 'thread-stages';
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

    const threads = [
      makeThreadResponse({
        id: "thread-a",
        projectId: "project-a",
        parentThreadId: null,
        visibility: "visible",
        archivedAt: null,
      }),
      makeThreadResponse({
        id: "thread-b",
        projectId: "project-a",
        parentThreadId: null,
        visibility: "visible",
        archivedAt: null,
      }),
    ];
    let threadStagesInstalled = false;
    const ribbonSidebar = createFakePluginHost({
      pluginId: "ribbon-sidebar",
      sdk: {
        threads: { list: async () => threads },
        projects: {
          list: async () => [
            {
              id: "project-a",
              name: "Project",
              kind: "standard" as const,
              createdAt: 1,
              updatedAt: 1,
              gitRemoteUrl: null,
              sources: [],
            },
          ],
        },
        threadSections: { list: async () => [] },
        plugins: {
          list: async () => ({
            plugins: [
              { id: "ribbon-sidebar", status: "running" as const },
              ...(threadStagesInstalled
                ? [{ id: "thread-stages", status: "running" as const }]
                : []),
            ],
          }),
          callRpc: async ({ pluginId, method, input }) => {
            if (pluginId === "thread-stages") {
              return threadStages.harness.behavior.callRpc(method, input);
            }
            if (pluginId === "icons" && method === "listIcons") {
              return {
                icons: [],
                defaults: { project: [], personal: [], section: [] },
              };
            }
            throw new Error(`Unexpected plugin RPC: ${pluginId}/${method}`);
          },
        },
      },
    });
    await ribbonSidebarPlugin(ribbonSidebar.bb);
    disposers.push(() => ribbonSidebar.harness.lifecycle.dispose());

    await ribbonSidebar.harness.behavior.callRpc("synchronizeV1", {
      migrateThreadStages: true,
    });
    threadStagesInstalled = true;
    await ribbonSidebar.harness.behavior.runSchedule("catalog-reconciliation");

    await expect(
      ribbonSidebar.harness.behavior.callRpc("listPlacementsV1", {
        groupingKey: "plugin:thread-stages:stages",
      }),
    ).resolves.toMatchObject({
      ok: true,
      value: {
        items: [
          { threadId: "thread-b", groupId: "Idle", enteredAtMs: 100 },
          {
            threadId: "thread-a",
            groupId: "Active",
            enteredAtMs: 200,
            previousGroupId: "Idle",
            origin: "ui",
          },
        ],
      },
    });

    const sourceAfterTransfer = await threadStages.harness.behavior.callRpc(
      "getPlacementMigrationSnapshotV1",
      null,
    );
    expect(sourceAfterTransfer).toMatchObject({
      revision: 7,
      placements: [
        { threadId: "thread-b", groupId: "Idle" },
        { threadId: "thread-a", groupId: "Active" },
      ],
    });
    await expect(
      threadStages.harness.behavior.callRpc("acknowledgePlacementMigrationV1", {
        installationId: "a".repeat(32),
        revision: 7,
      }),
    ).resolves.toEqual({ transferred: true });
  });
});
