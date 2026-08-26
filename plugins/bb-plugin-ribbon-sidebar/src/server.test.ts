import {
  createFakePluginHost,
  makeThreadResponse,
} from "@get-bb/plugin-sdk/testing";
import { describe, expect, it, vi } from "vitest";
import plugin from "./server";

const threadStagesCatalog = {
  protocolVersion: 1 as const,
  groupings: [
    {
      id: "stages",
      singularLabel: "Stage",
      pluralLabel: "Stages",
      defaultGroupId: "Idle",
      groups: [
        {
          id: "Idle",
          label: "Idle",
          visibleWhenEmpty: true,
          acceptsAssignments: true,
          defaultCollapsed: false,
        },
        {
          id: "Active",
          label: "Active",
          visibleWhenEmpty: true,
          acceptsAssignments: true,
          defaultCollapsed: false,
        },
      ],
    },
  ],
};

function setup({
  includeThreadStages = true,
  migrationSnapshotFails = false,
  threads = [
    makeThreadResponse({
      id: "thread-a",
      projectId: "project-a",
      sectionId: "section-a",
      parentThreadId: null,
      visibility: "visible",
      archivedAt: null,
    }),
    makeThreadResponse({
      id: "thread-child",
      projectId: "project-a",
      parentThreadId: "thread-a",
      visibility: "visible",
      archivedAt: null,
    }),
  ],
}: {
  includeThreadStages?: boolean;
  migrationSnapshotFails?: boolean;
  threads?: ReturnType<typeof makeThreadResponse>[];
} = {}) {
  let currentThreadStagesCatalog = threadStagesCatalog;
  let currentMigrationSnapshotFails = migrationSnapshotFails;
  const callRpc = vi.fn(async ({ pluginId, method }: {
    pluginId: string;
    method: string;
  }) => {
    if (pluginId === "icons" && method === "listIcons") {
      return {
        icons: [
          {
            kind: "section",
            id: "section-a",
            icon: "custom-section",
            color: "blue",
            glyph: [["path", { d: "M1 1h14v14H1z", key: "section" }]],
          },
          { kind: "section", id: "invalid" },
        ],
        defaults: { project: [], personal: [], section: [] },
      };
    }
    if (pluginId !== "thread-stages") throw new Error("unknown provider");
    if (method === "getGroupingCatalogV1") return currentThreadStagesCatalog;
    if (method === "getPlacementMigrationSnapshotV1") {
      if (currentMigrationSnapshotFails) throw new Error("provider is still starting");
      return {
        sourcePluginId: "thread-stages" as const,
        sourceSchema: 1 as const,
        installationId: "a".repeat(32),
        revision: 7,
        placements: [
          {
            groupingId: "stages",
            threadId: "thread-a",
            groupId: "Active",
            enteredAtMs: 200,
            updatedAtMs: 300,
            previousGroupId: "Idle",
            origin: "ui" as const,
            orders: [
              { groupId: "Idle", sortKey: "A", updatedAtMs: 100 },
              { groupId: "Active", sortKey: "B", updatedAtMs: 300 },
            ],
          },
        ],
      };
    }
    if (method === "acknowledgePlacementMigrationV1") {
      return { transferred: true };
    }
    throw new Error(`unexpected method: ${method}`);
  });
  const host = createFakePluginHost({
    pluginId: "ribbon-sidebar",
    sdk: {
      threads: {
        list: async () => threads,
        search: async () =>
          ({
            active: { results: [{ thread: threads[1] }] },
            archived: { results: [] },
          }) as never,
        update: async ({ threadId, sectionId }) =>
          makeThreadResponse({
            ...threads.find(({ id }) => id === threadId),
            id: threadId,
            sectionId: sectionId ?? null,
          }),
        reorderPinned: async () => ({}) as never,
      },
      projects: {
        list: async () => [
          {
            id: "project-a",
            name: "Storefront",
            kind: "standard" as const,
            createdAt: 1,
            updatedAt: 1,
            gitRemoteUrl: null,
            sources: [],
          },
          {
            id: "project-b",
            name: "Back office",
            kind: "standard" as const,
            createdAt: 1,
            updatedAt: 1,
            gitRemoteUrl: null,
            sources: [],
          },
        ],
      },
      threadSections: {
        list: async () => [
          { id: "section-a", name: "Release", createdAt: 1, updatedAt: 1 },
        ],
      },
      plugins: {
        list: async () => ({
          plugins: [
            { id: "ribbon-sidebar", status: "running" },
            ...(includeThreadStages
              ? [{ id: "thread-stages", status: "running" as const }]
              : []),
          ],
        }),
        callRpc,
      },
    },
  });
  return {
    ...host,
    callRpc,
    setThreadStagesCatalog(catalog: typeof threadStagesCatalog) {
      currentThreadStagesCatalog = catalog;
    },
    setMigrationSnapshotFails(value: boolean) {
      currentMigrationSnapshotFails = value;
    },
  };
}

describe("Ribbon sidebar server", () => {
  it("retains Ribbon's opt-in for non-stage collapsed activity", async () => {
    const { bb, harness } = setup();
    await plugin(bb);

    expect(harness.inspection.registrations.settingsDescriptors).toEqual({
      showProjectsAndSections: {
        type: "boolean",
        label: "Show Projects and sections",
        description:
          "Show the Projects and sections filter and management controls in the sidebar.",
        default: true,
      },
      showMessagePreviews: {
        type: "boolean",
        label: "Show message previews",
        description: "Show the latest message preview below each thread title.",
        default: true,
      },
      showCollapsedGroupIndicators: {
        type: "boolean",
        label: "Show collapsed-group indicators (experimental)",
        description:
          "Show live activity indicators on collapsed groups outside Thread stages.",
        default: false,
      },
    });
  });

  it("filters Icons plugin rows before serving entity icons", async () => {
    const { bb, harness } = setup();
    await plugin(bb);

    await expect(
      harness.behavior.callRpc("listEntityIconsV1", null),
    ).resolves.toEqual({
      icons: [
        expect.objectContaining({
          kind: "section",
          id: "section-a",
          color: "blue",
        }),
      ],
      defaults: { project: [], personal: [], section: [] },
    });
  });

  it("hydrates built-in and provider placement state before serving RPCs", async () => {
    const { bb, harness } = setup();
    await plugin(bb);

    await expect(
      harness.behavior.callRpc("sidebarSnapshotV1", null),
    ).resolves.toEqual({
      groupings: expect.arrayContaining([
        expect.objectContaining({
          groupingKey: "builtin:projects",
          groups: expect.arrayContaining([
            expect.objectContaining({ id: "project-a" }),
          ]),
        }),
        expect.objectContaining({
          groupingKey: "builtin:sections",
          groups: expect.arrayContaining([
            expect.objectContaining({ id: "section-a" }),
          ]),
        }),
        expect.objectContaining({
          groupingKey: "plugin:thread-stages:stages",
        }),
      ]),
    });
    await expect(
      harness.behavior.callRpc("getPlacementV1", {
        groupingKey: "builtin:sections",
        threadId: "thread-a",
      }),
    ).resolves.toMatchObject({
      ok: true,
      value: { placement: { groupId: "section-a" } },
    });
  });

  it("registers the exact public placement RPC and generic CLI", async () => {
    const { bb, harness } = setup();
    await plugin(bb);

    expect(harness.inspection.registrations.rpcMethods).toEqual([
      "addProjectLocalPathV1",
      "createProjectV1",
      "createSectionV1",
      "deleteEntityV1",
      "getPlacementV1",
      "invalidateGroupingCatalogV1",
      "listPlacementsV1",
      "listPreviewsV1",
      "listProjectActionStatesV1",
      "listEntityIconsV1",
      "searchThreadIdsV1",
      "renameEntityV1",
      "reorderPinnedV1",
      "sidebarSnapshotV1",
      "synchronizeV1",
      "updatePlacementV1",
    ]);
    expect(harness.inspection.registrations.cli).toMatchObject({
      name: "ribbon-sidebar",
    });
    await expect(
      harness.behavior.runCli(["groupings", "--json"]),
    ).resolves.toMatchObject({ exitCode: 0 });
  });

  it("retains the released project local-path action", async () => {
    const { bb, harness } = setup();
    harness.sdk.stub("system.config", async () =>
      ({ primaryHostId: "host-a" }) as never,
    );
    harness.sdk.stub("projects.get", async ({ projectId }) =>
      ({
        id: projectId,
        name: "Storefront",
        kind: "standard",
        sources: [],
      }) as never,
    );
    harness.sdk.stub("hosts.pickFolder", async () => ({ path: "/work/storefront" }));
    harness.sdk.stub("projects.sources.add", async () => ({}) as never);
    await plugin(bb);

    await expect(
      harness.behavior.callRpc("listProjectActionStatesV1", null),
    ).resolves.toEqual({
      projects: [
        { id: "project-a", canAddLocalPath: true },
        { id: "project-b", canAddLocalPath: true },
      ],
    });
    await expect(
      harness.behavior.callRpc("addProjectLocalPathV1", {
        projectId: "project-a",
      }),
    ).resolves.toEqual({ added: true });
    expect(harness.inspection.sdk.callsTo("projects.sources.add")).toEqual([
      [
        {
          projectId: "project-a",
          type: "local_path",
          hostId: "host-a",
          path: "/work/storefront",
        },
      ],
    ]);
  });

  it("keeps pinned order in bb's native store", async () => {
    const { bb, harness } = setup();
    await plugin(bb);

    await expect(
      harness.behavior.callRpc("reorderPinnedV1", {
        threadId: "thread-a",
        previousThreadId: null,
        nextThreadId: "thread-b",
      }),
    ).resolves.toEqual({ reordered: true });
    expect(harness.inspection.sdk.callsTo("threads.reorderPinned")).toEqual([
      [
        {
          threadId: "thread-a",
          previousThreadId: null,
          nextThreadId: "thread-b",
        },
      ],
    ]);
  });

  it("discovers providers, reconciles roots, and serves schema-validated placements", async () => {
    const { bb, harness, callRpc } = setup();
    await plugin(bb);

    await expect(
      harness.behavior.callRpc("synchronizeV1", { migrateThreadStages: false }),
    ).resolves.toMatchObject({
      groupings: [
        { groupingKey: "builtin:projects" },
        { groupingKey: "builtin:sections" },
        { groupingKey: "plugin:thread-stages:stages" },
      ],
    });
    expect(callRpc).toHaveBeenCalledWith(
      expect.objectContaining({
        pluginId: "thread-stages",
        method: "getGroupingCatalogV1",
      }),
    );

    expect(
      await harness.behavior.callRpc("getPlacementV1", {
        groupingKey: "plugin:thread-stages:stages",
        threadId: "thread-a",
      }),
    ).toMatchObject({
      ok: true,
      value: { placement: { groupId: "Idle", origin: "auto" } },
    });
    expect(
      await harness.behavior.callRpc("getPlacementV1", {
        groupingKey: "plugin:thread-stages:stages",
        threadId: "thread-child",
      }),
    ).toMatchObject({ ok: false, error: { code: "THREAD_INELIGIBLE" } });
    expect(
      await harness.behavior.callRpc("getPlacementV1", {
        groupingKey: "plugin:missing:grouping",
        threadId: "thread-a",
      }),
    ).toMatchObject({ ok: false, error: { code: "GROUPING_NOT_FOUND" } });
  });

  it("delegates sidebar search to bb's indexed thread search", async () => {
    const { bb, harness } = setup();
    await plugin(bb);

    await expect(
      harness.behavior.callRpc("searchThreadIdsV1", { query: "message body" }),
    ).resolves.toMatchObject({
      threadIds: ["thread-child"],
      threads: [{ id: "thread-child", isArchived: false }],
    });
    expect(harness.inspection.sdk.callsTo("threads.search")).toEqual([
      [{ query: "message body", limitPerGroup: "50" }],
    ]);
  });

  it("reconciles a live child as a root when its parent is not live", async () => {
    const { bb, harness } = setup({
      threads: [
        makeThreadResponse({
          id: "thread-parent",
          projectId: "project-a",
          parentThreadId: null,
          visibility: "visible",
          archivedAt: 1,
        }),
        makeThreadResponse({
          id: "thread-orphan",
          projectId: "project-a",
          parentThreadId: "thread-parent",
          visibility: "visible",
          archivedAt: null,
        }),
      ],
    });
    await plugin(bb);
    await harness.behavior.callRpc("synchronizeV1", { migrateThreadStages: false });

    expect(
      await harness.behavior.callRpc("getPlacementV1", {
        groupingKey: "plugin:thread-stages:stages",
        threadId: "thread-orphan",
      }),
    ).toMatchObject({
      ok: true,
      value: { placement: { groupId: "Idle", origin: "auto" } },
    });
  });

  it("mounts without Thread stages installed", async () => {
    const { bb, harness, callRpc } = setup({ includeThreadStages: false });
    await plugin(bb);

    await expect(
      harness.behavior.callRpc("synchronizeV1", { migrateThreadStages: true }),
    ).resolves.toMatchObject({
      groupings: [
        { groupingKey: "builtin:projects" },
        { groupingKey: "builtin:sections" },
      ],
    });
    expect(callRpc).not.toHaveBeenCalled();
  });

  it("restores legacy placement on mount and retries a delayed Thread stages source", async () => {
    const { bb, harness, callRpc, setMigrationSnapshotFails } = setup({
      migrationSnapshotFails: true,
    });
    await plugin(bb);

    await expect(
      harness.behavior.callRpc("synchronizeV1", {
        migrateThreadStages: true,
      }),
    ).resolves.toMatchObject({
      groupings: expect.arrayContaining([
        expect.objectContaining({
          groupingKey: "plugin:thread-stages:stages",
        }),
      ]),
    });
    expect(
      callRpc.mock.calls.filter(
        ([input]) => input.method === "acknowledgePlacementMigrationV1",
      ),
    ).toHaveLength(0);

    setMigrationSnapshotFails(false);
    await harness.behavior.runSchedule("catalog-reconciliation");
    await expect(
      harness.behavior.callRpc("getPlacementV1", {
        groupingKey: "plugin:thread-stages:stages",
        threadId: "thread-a",
      }),
    ).resolves.toMatchObject({
      ok: true,
      value: {
        placement: {
          groupId: "Active",
          enteredAtMs: 200,
          previousGroupId: "Idle",
          origin: "ui",
        },
      },
    });
    expect(callRpc).toHaveBeenCalledWith(
      expect.objectContaining({
        pluginId: "thread-stages",
        method: "acknowledgePlacementMigrationV1",
        input: { installationId: "a".repeat(32), revision: 7 },
      }),
    );
  });

  it("discovers Thread stages when explicit migration runs before the sidebar mounts", async () => {
    const { bb, harness, callRpc } = setup();
    await plugin(bb);

    await expect(
      harness.behavior.runCli(["migrate", "thread-stages", "--json"]),
    ).resolves.toMatchObject({ exitCode: 0 });
    expect(callRpc).toHaveBeenCalledWith(
      expect.objectContaining({
        pluginId: "thread-stages",
        method: "acknowledgePlacementMigrationV1",
        input: { installationId: "a".repeat(32), revision: 7 },
      }),
    );
  });

  it("keeps project membership read-only and moves Section membership", async () => {
    const { bb, harness } = setup();
    await plugin(bb);
    await harness.behavior.callRpc("synchronizeV1", { migrateThreadStages: false });

    expect(
      await harness.behavior.callRpc("updatePlacementV1", {
        groupingKey: "builtin:projects",
        groupId: "project-a",
        threadId: "thread-a",
        anchor: { kind: "start" },
        origin: "ui",
      }),
    ).toMatchObject({ ok: true });
    expect(
      await harness.behavior.callRpc("updatePlacementV1", {
        groupingKey: "builtin:projects",
        groupId: "project-b",
        threadId: "thread-a",
        origin: "ui",
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "MEMBERSHIP_NOT_WRITABLE" },
    });

    expect(
      await harness.behavior.callRpc("updatePlacementV1", {
        groupingKey: "builtin:sections",
        groupId: "unsectioned",
        threadId: "thread-a",
        origin: "ui",
      }),
    ).toMatchObject({
      ok: true,
      value: { placement: { groupId: "unsectioned", enteredAtMs: null } },
    });
    expect(harness.inspection.sdk.callsTo("threads.update")).toEqual([
      [expect.objectContaining({ threadId: "thread-a", sectionId: null })],
    ]);
  });

  it("CAS-protects Section membership before writing bb and increments its revision", async () => {
    const { bb, harness } = setup();
    await plugin(bb);
    await harness.behavior.callRpc("synchronizeV1", { migrateThreadStages: false });
    const before = (await harness.behavior.callRpc("getPlacementV1", {
      groupingKey: "builtin:sections",
      threadId: "thread-a",
    })) as
      | { ok: true; value: { revision: number } }
      | { ok: false; error: { code: string } };
    expect(before).toMatchObject({ ok: true });
    if (!before.ok) throw new Error("expected an eligible Section placement");

    expect(
      await harness.behavior.callRpc("updatePlacementV1", {
        groupingKey: "builtin:sections",
        groupId: "unsectioned",
        threadId: "thread-a",
        expectedRevision: before.value.revision + 1,
        origin: "ui",
      }),
    ).toMatchObject({
      ok: false,
      error: {
        code: "REVISION_CONFLICT",
        revision: before.value.revision,
      },
    });
    expect(harness.inspection.sdk.callsTo("threads.update")).toEqual([]);

    expect(
      await harness.behavior.callRpc("updatePlacementV1", {
        groupingKey: "builtin:sections",
        groupId: "unsectioned",
        threadId: "thread-a",
        expectedRevision: before.value.revision,
        origin: "ui",
      }),
    ).toMatchObject({
      ok: true,
      value: { revision: before.value.revision + 1 },
    });
    expect(harness.inspection.sdk.callsTo("threads.update")).toEqual([
      [expect.objectContaining({ threadId: "thread-a", sectionId: null })],
    ]);
  });

  it("rejects an ineligible Section anchor before writing bb membership", async () => {
    const { bb, harness } = setup();
    await plugin(bb);
    await harness.behavior.callRpc("synchronizeV1", { migrateThreadStages: false });

    expect(
      await harness.behavior.callRpc("updatePlacementV1", {
        groupingKey: "builtin:sections",
        groupId: "unsectioned",
        threadId: "thread-a",
        anchor: { kind: "before", threadId: "thread-child" },
        origin: "ui",
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "ANCHOR_INELIGIBLE" },
    });
    expect(harness.inspection.sdk.callsTo("threads.update")).toEqual([]);
  });

  it("persists CLI Section placement through bb's membership adapter", async () => {
    const { bb, harness } = setup();
    await plugin(bb);

    await expect(
      harness.behavior.runCli([
        "place",
        "thread-a",
        "--to",
        "builtin:sections/unsectioned",
      ]),
    ).resolves.toMatchObject({ exitCode: 0 });
    expect(harness.inspection.sdk.callsTo("threads.update")).toEqual([
      [expect.objectContaining({ threadId: "thread-a", sectionId: null })],
    ]);
  });

  it("publishes refreshed catalogs after provider invalidation", async () => {
    const { bb, harness } = setup();
    await plugin(bb);
    await harness.behavior.callRpc("synchronizeV1", { migrateThreadStages: false });

    await harness.behavior.callRpc("invalidateGroupingCatalogV1", {
      providerPluginId: "thread-stages",
    });
    await vi.waitFor(() =>
      expect(harness.inspection.realtimeSignals).toContainEqual({
        channel: "catalog-changed",
        payload: null,
      }),
    );
  });

  it("publishes provider catalog changes discovered by reconciliation", async () => {
    const { bb, harness, setThreadStagesCatalog } = setup();
    await plugin(bb);
    await harness.behavior.callRpc("synchronizeV1", { migrateThreadStages: false });
    setThreadStagesCatalog({
      ...threadStagesCatalog,
      groupings: threadStagesCatalog.groupings.map((grouping) => ({
        ...grouping,
        groups: grouping.groups.map((group) =>
          group.id === "Idle" ? { ...group, label: "Waiting" } : group,
        ),
      })),
    });

    await harness.behavior.runSchedule("catalog-reconciliation");

    expect(harness.inspection.realtimeSignals).toContainEqual({
      channel: "catalog-changed",
      payload: null,
    });
  });
});
