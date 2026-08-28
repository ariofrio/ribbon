import {
  createFakePluginHost,
  makeThreadResponse,
} from "@get-bb/plugin-sdk/testing";
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { describe, expect, it, vi } from "vitest";
import plugin from "./server";

type RealtimeSubscribeArgs = Parameters<BbPluginApi["sdk"]["subscribe"]>[0];
type ThreadChangedCallback = Extract<
  RealtimeSubscribeArgs,
  { event: "thread:changed" }
>["callback"];
type ThreadGet = BbPluginApi["sdk"]["threads"]["get"];
type ThreadUpdate = BbPluginApi["sdk"]["threads"]["update"];

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
  includePersonalProject = false,
  includeThreadStages = true,
  migrationSnapshotFails = false,
  subscribe: subscribeOverride,
  threadGet,
  threadUpdate,
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
  includePersonalProject?: boolean;
  includeThreadStages?: boolean;
  migrationSnapshotFails?: boolean;
  subscribe?: BbPluginApi["sdk"]["subscribe"];
  threadGet?: ThreadGet;
  threadUpdate?: ThreadUpdate;
  threads?: ReturnType<typeof makeThreadResponse>[];
} = {}) {
  let currentThreadStagesCatalog = threadStagesCatalog;
  let currentMigrationSnapshotFails = migrationSnapshotFails;
  const timeline = vi.fn(async () => ({
    rows: [
      {
        kind: "conversation",
        role: "assistant",
        text: "Cached sidebar preview",
        sourceSeqEnd: 2,
      },
    ],
  }));
  const updateSettings = vi.fn(async () => ({ values: {} }));
  const get = vi.fn(
    threadGet ??
      (async ({ threadId }) => {
        const thread = threads.find(({ id }) => id === threadId);
        if (!thread) throw new Error(`Unknown thread: ${threadId}`);
        return thread;
      }),
  );
  const update = vi.fn(
    threadUpdate ??
      (async ({ threadId, sectionId }) =>
        makeThreadResponse({
          ...threads.find(({ id }) => id === threadId),
          id: threadId,
          sectionId: sectionId ?? null,
        })),
  );
  const subscribe = vi.fn(
    subscribeOverride ?? (() => () => undefined),
  );
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
      subscribe,
      threads: {
        get,
        list: async () => threads,
        timeline,
        search: async () =>
          ({
            active: { results: [{ thread: threads[1] }] },
            archived: { results: [] },
          }) as never,
        update,
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
          ...(includePersonalProject
            ? [
                {
                  id: "project-personal",
                  name: "Personal",
                  kind: "personal" as const,
                  createdAt: 1,
                  updatedAt: 1,
                  gitRemoteUrl: null,
                  sources: [],
                },
              ]
            : []),
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
        updateSettings,
      },
    },
  });
  return {
    ...host,
    callRpc,
    get,
    subscribe,
    update,
    timeline,
    updateSettings,
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
        label: "Show groups",
        description:
          "Show grouping, filtering, and group management controls in the sidebar.",
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
      showGroupHeaderIcons: {
        type: "boolean",
        label: "Show group header icons",
        description: "Show each group’s icon beside its sidebar heading.",
        default: true,
      },
    });
  });

  it("places a new fork in the nearest section on its fork source ancestry", async () => {
    const threads = [
      makeThreadResponse({
        id: "thr_fork_source",
        parentThreadId: "thr_parent",
        sectionId: null,
      }),
      makeThreadResponse({
        id: "thr_parent",
        parentThreadId: null,
        sectionId: "section_family",
      }),
    ];
    const fixture = setup({ threads });
    await plugin(fixture.bb);

    await fixture.harness.behavior.emitThreadEvent("thread.created", {
      thread: makeThreadResponse({
        id: "thr_fork",
        originKind: "fork",
        sectionId: null,
        sourceThreadId: "thr_fork_source",
      }),
    });

    expect(fixture.get).toHaveBeenNthCalledWith(1, {
      threadId: "thr_fork_source",
    });
    expect(fixture.get).toHaveBeenNthCalledWith(2, {
      threadId: "thr_parent",
    });
    expect(fixture.update).toHaveBeenCalledWith({
      threadId: "thr_fork",
      sectionId: "section_family",
    });
  });

  it("places a new fork in provider groups inherited from its fork source ancestry", async () => {
    const threads = [
      makeThreadResponse({
        id: "thr_parent",
        parentThreadId: null,
        visibility: "visible",
        archivedAt: null,
      }),
      makeThreadResponse({
        id: "thr_fork_source",
        parentThreadId: "thr_parent",
        visibility: "visible",
        archivedAt: null,
      }),
    ];
    const fixture = setup({ threads });
    await plugin(fixture.bb);
    await fixture.harness.behavior.callRpc("updatePlacementV1", {
      groupingKey: "plugin:thread-stages:stages",
      groupId: "Active",
      threadId: "thr_parent",
      origin: "ui",
    });
    const fork = makeThreadResponse({
      id: "thr_fork",
      originKind: "fork",
      sourceThreadId: "thr_fork_source",
      parentThreadId: null,
      visibility: "visible",
      archivedAt: null,
    });
    threads.push(fork);

    await fixture.harness.behavior.emitThreadEvent("thread.created", {
      thread: fork,
    });

    await vi.waitFor(async () => {
      await expect(
        fixture.harness.behavior.callRpc("getPlacementV1", {
          groupingKey: "plugin:thread-stages:stages",
          threadId: "thr_fork",
        }),
      ).resolves.toMatchObject({
        ok: true,
        value: { placement: { groupId: "Active" } },
      });
    });
  });

  it("preserves explicit sections and leaves non-fork spawns Unorganized", async () => {
    const fixture = setup();
    await plugin(fixture.bb);

    await fixture.harness.behavior.emitThreadEvent("thread.created", {
      thread: makeThreadResponse({
        id: "thr_explicit_fork",
        originKind: "fork",
        sectionId: "section-a",
        sourceThreadId: "thread-a",
      }),
    });
    await fixture.harness.behavior.emitThreadEvent("thread.created", {
      thread: makeThreadResponse({
        id: "thr_spawned",
        sectionId: null,
        sourceThreadId: "thread-a",
        originKind: null,
      }),
    });

    expect(fixture.update).not.toHaveBeenCalled();
  });

  it("refreshes roots before placing a newly created UI thread", async () => {
    const threads = [
      makeThreadResponse({
        id: "thread-a",
        parentThreadId: null,
        visibility: "visible",
        archivedAt: null,
      }),
    ];
    const fixture = setup({ threads });
    await plugin(fixture.bb);
    threads.push(
      makeThreadResponse({
        id: "thread-new",
        parentThreadId: null,
        visibility: "visible",
        archivedAt: null,
      }),
    );

    await expect(
      fixture.harness.behavior.callRpc("placeNewThreadV1", {
        groupingKey: "plugin:thread-stages:stages",
        groupId: "Active",
        threadId: "thread-new",
      }),
    ).resolves.toMatchObject({
      ok: true,
      value: { placement: { groupId: "Active", origin: "ui" } },
    });
  });

  it("gives an unparented thread the nearest section from its former parent hierarchy", async () => {
    let onThreadChanged: ThreadChangedCallback | undefined;
    const unsubscribe = vi.fn();
    const subscribe = vi.fn((args: RealtimeSubscribeArgs) => {
      if (args.event === "thread:changed") onThreadChanged = args.callback;
      return unsubscribe;
    });
    const threads = [
      makeThreadResponse({
        id: "thr_child",
        parentThreadId: "thr_parent",
        sectionId: null,
      }),
      makeThreadResponse({
        id: "thr_parent",
        parentThreadId: "thr_grandparent",
        sectionId: null,
      }),
      makeThreadResponse({
        id: "thr_grandparent",
        parentThreadId: null,
        sectionId: "section_family",
      }),
    ];
    const fixture = setup({
      subscribe,
      threads,
      threadGet: async ({ threadId }) => {
        if (threadId === "thr_child") {
          return makeThreadResponse({ id: threadId, parentThreadId: null });
        }
        const thread = threads.find(({ id }) => id === threadId);
        if (!thread) throw new Error(`Unknown thread: ${threadId}`);
        return thread;
      },
    });
    await plugin(fixture.bb);
    const service = fixture.harness.behavior.runService("group-inheritance");
    await vi.waitFor(() => expect(subscribe).toHaveBeenCalledOnce());

    onThreadChanged?.({
      type: "changed",
      entity: "thread",
      id: "thr_child",
      changes: ["parent-changed"],
    });

    await vi.waitFor(() =>
      expect(fixture.update).toHaveBeenCalledWith({
        threadId: "thr_child",
        sectionId: "section_family",
      }),
    );
    service.controller.abort();
    await service.done;
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it("gives an unparented thread provider groups from its former parent hierarchy", async () => {
    let onThreadChanged: ThreadChangedCallback | undefined;
    const subscribe = vi.fn((args: RealtimeSubscribeArgs) => {
      if (args.event === "thread:changed") onThreadChanged = args.callback;
      return vi.fn();
    });
    const threads = [
      makeThreadResponse({
        id: "thr_child",
        parentThreadId: "thr_parent",
        visibility: "visible",
        archivedAt: null,
      }),
      makeThreadResponse({
        id: "thr_parent",
        parentThreadId: null,
        visibility: "visible",
        archivedAt: null,
      }),
    ];
    const fixture = setup({ subscribe, threads });
    await plugin(fixture.bb);
    await fixture.harness.behavior.callRpc("updatePlacementV1", {
      groupingKey: "plugin:thread-stages:stages",
      groupId: "Active",
      threadId: "thr_parent",
      origin: "ui",
    });
    const service = fixture.harness.behavior.runService("group-inheritance");
    await vi.waitFor(() => expect(subscribe).toHaveBeenCalledOnce());
    threads[0] = makeThreadResponse({
      id: "thr_child",
      parentThreadId: null,
      visibility: "visible",
      archivedAt: null,
    });

    onThreadChanged?.({
      type: "changed",
      entity: "thread",
      id: "thr_child",
      changes: ["parent-changed"],
    });

    await vi.waitFor(async () => {
      await expect(
        fixture.harness.behavior.callRpc("getPlacementV1", {
          groupingKey: "plugin:thread-stages:stages",
          threadId: "thr_child",
        }),
      ).resolves.toMatchObject({
        ok: true,
        value: { placement: { groupId: "Active" } },
      });
    });
    service.controller.abort();
    await service.done;
  });

  it("tracks a reparented thread without changing it, then inherits from that parent when unparented", async () => {
    let onThreadChanged: ThreadChangedCallback | undefined;
    const subscribe = vi.fn((args: RealtimeSubscribeArgs) => {
      if (args.event === "thread:changed") onThreadChanged = args.callback;
      return vi.fn();
    });
    let currentParentThreadId: string | null = "thr_old_parent";
    const fixture = setup({
      subscribe,
      threads: [
        makeThreadResponse({
          id: "thr_child",
          parentThreadId: "thr_old_parent",
        }),
      ],
      threadGet: async ({ threadId }) => {
        if (threadId === "thr_child") {
          return makeThreadResponse({
            id: threadId,
            parentThreadId: currentParentThreadId,
          });
        }
        return makeThreadResponse({
          id: threadId,
          parentThreadId: null,
          sectionId:
            threadId === "thr_new_parent" ? "section_new" : "section_old",
        });
      },
    });
    await plugin(fixture.bb);
    const service = fixture.harness.behavior.runService("group-inheritance");
    await vi.waitFor(() => expect(subscribe).toHaveBeenCalledOnce());

    currentParentThreadId = "thr_new_parent";
    onThreadChanged?.({
      type: "changed",
      entity: "thread",
      id: "thr_child",
      changes: ["parent-changed"],
    });
    await vi.waitFor(() => expect(fixture.get).toHaveBeenCalledTimes(1));
    expect(fixture.update).not.toHaveBeenCalled();

    currentParentThreadId = null;
    onThreadChanged?.({
      type: "changed",
      entity: "thread",
      id: "thr_child",
      changes: ["parent-changed"],
    });
    await vi.waitFor(() =>
      expect(fixture.update).toHaveBeenCalledWith({
        threadId: "thr_child",
        sectionId: "section_new",
      }),
    );
    service.controller.abort();
    await service.done;
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

  it("serves canonical built-in names in the standard grouping order", async () => {
    const { bb, harness } = setup({ includePersonalProject: true });
    await plugin(bb);

    const result = (await harness.behavior.callRpc(
      "sidebarSnapshotV1",
      null,
    )) as {
      groupings: {
        groupingKey: string;
        defaultGroupId: string;
        groups: { id: string; label: string }[];
      }[];
    };
    expect(result.groupings.map(({ groupingKey }) => groupingKey)).toEqual([
      "builtin:sections",
      "builtin:projects",
      "plugin:thread-stages:stages",
    ]);
    expect(
      result.groupings
        .find(({ groupingKey }) => groupingKey === "builtin:sections")
        ?.groups.find(({ id }) => id === "unsectioned")?.label,
    ).toBe("Unorganized");
    expect(
      result.groupings
        .find(({ groupingKey }) => groupingKey === "builtin:projects")
        ?.groups.find(({ id }) => id === "project-personal")?.label,
    ).toBe("Chats");
    expect(
      result.groupings
        .find(({ groupingKey }) => groupingKey === "builtin:projects")
        ?.groups.map(({ label }) => label),
    ).toEqual(["Storefront", "Back office", "Chats"]);
    expect(
      result.groupings.find(
        ({ groupingKey }) => groupingKey === "builtin:projects",
      )?.defaultGroupId,
    ).toBe("project-personal");
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
      "placeNewThreadV1",
      "listEntityIconsV1",
      "searchThreadIdsV1",
      "renameEntityV1",
      "reorderPinnedV1",
      "sidebarSnapshotV1",
      "synchronizeV1",
      "updatePlacementV1",
      "updateSettingsV1",
    ]);
    expect(harness.inspection.registrations.cli).toMatchObject({
      name: "ribbon-sidebar",
    });
    await expect(
      harness.behavior.runCli(["groupings", "--json"]),
    ).resolves.toMatchObject({ exitCode: 0 });
  });

  it("serves previews from the durable background cache", async () => {
    const { bb, harness, timeline } = setup();
    await plugin(bb);
    const running = harness.behavior.runService("thread-previews");

    await vi.waitFor(async () => {
      await expect(
        harness.behavior.callRpc("listPreviewsV1", {
          threadIds: ["thread-a"],
        }),
      ).resolves.toEqual({
        previews: [
          { threadId: "thread-a", preview: "Cached sidebar preview" },
        ],
      });
    });
    const callsBeforeRead = timeline.mock.calls.length;
    await harness.behavior.callRpc("listPreviewsV1", {
      threadIds: ["thread-a"],
    });
    expect(timeline).toHaveBeenCalledTimes(callsBeforeRead);

    running.controller.abort();
    await running.done;
  });

  it("saves every Ribbon setting through the bb SDK", async () => {
    const { bb, harness, updateSettings } = setup();
    await plugin(bb);

    await expect(
      harness.behavior.callRpc("updateSettingsV1", {
        showProjectsAndSections: false,
        showMessagePreviews: false,
        showCollapsedGroupIndicators: true,
        showGroupHeaderIcons: false,
      }),
    ).resolves.toEqual({ ok: true });
    expect(updateSettings).toHaveBeenCalledWith({
      pluginId: "ribbon-sidebar",
      values: {
        showProjectsAndSections: false,
        showMessagePreviews: false,
        showCollapsedGroupIndicators: true,
        showGroupHeaderIcons: false,
      },
    });
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
        { groupingKey: "builtin:sections" },
        { groupingKey: "builtin:projects" },
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
        { groupingKey: "builtin:sections" },
        { groupingKey: "builtin:projects" },
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
