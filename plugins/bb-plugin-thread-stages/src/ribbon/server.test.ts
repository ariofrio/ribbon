import type { BbPluginApi } from "@get-bb/plugin-sdk";
import {
  createFakePluginHost,
  makeThreadResponse,
} from "@get-bb/plugin-sdk/testing";
import { describe, expect, it, vi } from "vitest";
import plugin from "./server";


type RealtimeSubscribeArgs = Parameters<BbPluginApi["sdk"]["subscribe"]>[0];
type ThreadChangedCallback = Extract<
  RealtimeSubscribeArgs,
  { event: "thread:changed" }
>["callback"];
type ThreadGet = BbPluginApi["sdk"]["threads"]["get"];
type ThreadSend = BbPluginApi["sdk"]["threads"]["send"];
type ThreadUpdate = BbPluginApi["sdk"]["threads"]["update"];

const threadStagesCatalog = {
  protocolVersion: 1 as const,
  groupings: [
    {
      id: "stages",
      singularLabel: "Stage",
      pluralLabel: "Stages",
      defaultGroupId: "Active",
      groups: [
        {
          id: "Active",
          label: "Active",
          visibleWhenEmpty: true,
          acceptsAssignments: true,
          defaultCollapsed: false,
        },
        {
          id: "BlockedOnThirdParty",
          label: "Blocked on third party",
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
  settings,
  threadGet,
  threadSend,
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
  settings?: Record<string, boolean | string>;
  subscribe?: BbPluginApi["sdk"]["subscribe"];
  threadGet?: ThreadGet;
  threadSend?: ThreadSend;
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
  const getSettings = vi.fn(async () => ({ ok: true, schema: {}, values: {} }));
  const pluginsList = vi.fn(async () => ({
    plugins: [
      { id: "ribbon-sidebar", status: "running" },
      ...(includeThreadStages
        ? [{ id: "thread-stages", status: "running" }]
        : []),
    ],
  }));
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
  const send = vi.fn(
    threadSend ?? (async () => ({ status: "sent" as const }) as never),
  );
  const subscribe = vi.fn(subscribeOverride ?? (() => () => undefined));
  const list = vi.fn(
    async ({
      archived = false,
      includeHidden = false,
      limit = 100,
      offset = 0,
    }: {
      archived?: boolean;
      includeHidden?: boolean;
      limit?: number;
      offset?: number;
    } = {}) =>
      threads
        .filter(
          (thread) =>
            (thread.archivedAt !== null) === archived &&
            (includeHidden || thread.visibility !== "hidden"),
        )
        .slice(offset, offset + limit),
  );
  const callRpc = vi.fn(
    async ({ pluginId, method }: { pluginId: string; method: string }) => {
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
        if (currentMigrationSnapshotFails)
          throw new Error("provider is still starting");
        return {
          sourcePluginId: "thread-stages" as const,
          sourceSchema: 1 as const,
          installationId: "a".repeat(32),
          revision: 7,
          placements: [
            {
              groupingId: "stages",
              threadId: "thread-a",
              groupId: "BlockedOnThirdParty",
              enteredAtMs: 200,
              updatedAtMs: 300,
              previousGroupId: "Active",
              origin: "ui" as const,
              orders: [
                { groupId: "Active", sortKey: "A", updatedAtMs: 100 },
                { groupId: "BlockedOnThirdParty", sortKey: "B", updatedAtMs: 300 },
              ],
            },
          ],
        };
      }
      if (method === "acknowledgePlacementMigrationV1") {
        return { transferred: true };
      }
      throw new Error(`unexpected method: ${method}`);
    },
  );
  const host = createFakePluginHost({
    pluginId: "thread-stages",
    ...(settings ? { settings } : {}),
    sdk: {
      subscribe,
      system: {
        config: async () => ({ keybindingOverrides: [] }) as never,
        updateKeyboardSettings: async (input) => input,
      },
      threads: {
        get,
        list,
        timeline,
        search: async () =>
          ({
            active: { results: [{ thread: threads[1] }] },
            archived: { results: [] },
          }) as never,
        send,
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
        getSettings,
        list: pluginsList,
        callRpc,
        updateSettings,
      },
    },
  });
  return {
    ...host,
    callRpc,
    get,
    list,
    send,
    subscribe,
    update,
    timeline,
    updateSettings,
    getSettings,
    pluginsList,
    setThreadStagesCatalog(catalog: typeof threadStagesCatalog) {
      currentThreadStagesCatalog = catalog;
    },
    setMigrationSnapshotFails(value: boolean) {
      currentMigrationSnapshotFails = value;
    },
  };
}

describe("Ribbon sidebar server", () => {
  it("saves prompt actions and sends the selected prompt to its thread", async () => {
    const { bb, harness, send } = setup();
    await plugin(bb);
    try {
      const actions = ["Review", "Test", "Explain", "Summarize"].map((label) => ({
        id: label.toLowerCase(), label, prompt: `${label} this change.`,
      }));
      await harness.behavior.callRpc("saveThreadActionsV1", { threadId: "thread-a", actions, hideTitle: true });
      expect(await harness.behavior.callRpc("listThreadActionsV1", null)).toEqual({
        threads: [{ threadId: "thread-a", actions, hideTitle: true }],
      });
      await harness.behavior.callRpc("runThreadActionV1", {
        threadId: "thread-a", actionId: "review",
      });
      expect(send).toHaveBeenCalledWith({
        threadId: "thread-a",
        input: [{ type: "text", text: "Review this change.", mentions: [] }],
        mode: "auto",
      });
      await expect(harness.behavior.callRpc("runThreadActionV1", {
        threadId: "thread-a", actionId: "missing",
      })).rejects.toThrow();
      await harness.behavior.callRpc("saveThreadActionsV1", { threadId: "thread-a", actions: [], hideTitle: true });
      expect(await harness.behavior.callRpc("listThreadActionsV1", null)).toEqual({ threads: [] });
    } finally {
      await harness.dispose();
    }
  });

  it.each(["builtin:sections", "builtin:projects"] as const)(
    "reorders and completes the mixed main list in %s order",
    async (groupingKey) => {
      const threads = ["first", "second", "third"].map((id, index) =>
        makeThreadResponse({
          id,
          projectId: "project-a",
          sectionId:
            groupingKey === "builtin:projects"
              ? `section-${index}`
              : "section-a",
          createdAt: 3 - index,
        }),
      );
      const { bb, harness, callRpc } = setup({
        threads,
        includeThreadStages: false,
      });
      await plugin(bb);
      try {
        for (const [threadId, groupId] of [
          ["first", "BlockedOnThirdParty"],
          ["second", "BlockedOnThirdParty"],
        ]) {
          await harness.behavior.callRpc("updatePlacementV1", {
            groupingKey: "plugin:thread-stages:stages",
            threadId,
            groupId,
            origin: "ui",
          });
        }
        const ids = async () =>
          (
            (await harness.behavior.callRpc("listPlacementsV1", {
              groupingKey,
            })) as { value: { items: { threadId: string }[] } }
          ).value.items.map((item) => item.threadId);
        expect(await ids()).toEqual(["first", "second", "third"]);
        await harness.behavior.callRpc("reorderThread", {
          threadId: "second",
          groupingKey,
          scope: "step",
          direction: -1,
        });
        expect(await ids()).toEqual(["second", "first", "third"]);
        expect(
          await harness.behavior.callRpc("setWorkflowStage", {
            threadId: "second",
            groupingKey,
            workflowStage: "Completed",
          }),
        ).toEqual({
          destination: {
            kind: "thread",
            threadId: "first",
            projectId: threads[0]!.projectId,
          },
        });
        await harness.behavior.callRpc("setWorkflowStage", {
          threadId: "second",
          workflowStage: "Active",
        });
        expect(await ids()).toEqual(["second", "first", "third"]);
        expect(callRpc).not.toHaveBeenCalled();
      } finally {
        await harness.lifecycle.dispose();
      }
    },
  );

  it("places a newly Completed thread first, as the stage catalog says", async () => {
    const { bb, harness } = setup({
      threads: ["thread-a", "thread-b"].map((id) => makeThreadResponse({ id })),
    });
    const completed = {
      id: "Completed",
      label: "Completed",
      visibleWhenEmpty: true,
      acceptsAssignments: true,
      defaultCollapsed: true,
      defaultPlacement: "start" as const,
    };
    await plugin(bb);
    const snapshot = await harness.behavior.callRpc("synchronizeV1", null);
    expect(snapshot).toMatchObject({
      groupings: expect.arrayContaining([
        expect.objectContaining({
          groupingKey: "plugin:thread-stages:stages",
          groups: expect.arrayContaining([expect.objectContaining(completed)]),
        }),
      ]),
    });
    for (const threadId of ["thread-a", "thread-b"]) {
      expect(
        await harness.behavior.callRpc("updatePlacementV1", {
          groupingKey: "plugin:thread-stages:stages",
          groupId: "Completed",
          threadId,
          origin: "cli",
        }),
      ).toMatchObject({ ok: true });
    }
    expect(
      await harness.behavior.callRpc("listPlacementsV1", {
        groupingKey: "plugin:thread-stages:stages",
        groupIds: ["Completed"],
      }),
    ).toMatchObject({
      ok: true,
      value: { items: [{ threadId: "thread-b" }, { threadId: "thread-a" }] },
    });
    await harness.behavior.callRpc("updatePlacementV1", {
      groupingKey: "plugin:thread-stages:stages",
      groupId: "Active",
      threadId: "thread-a",
      origin: "cli",
    });
    expect(
      await harness.behavior.callRpc("placeNewThreadV1", {
        groupingKey: "plugin:thread-stages:stages",
        groupId: "Completed",
        threadId: "thread-a",
      }),
    ).toMatchObject({ ok: true });
    expect(
      await harness.behavior.callRpc("listPlacementsV1", {
        groupingKey: "plugin:thread-stages:stages",
        groupIds: ["Completed"],
      }),
    ).toMatchObject({
      ok: true,
      value: { items: [{ threadId: "thread-a" }, { threadId: "thread-b" }] },
    });
    await harness.lifecycle.dispose();
  });




  it("defines only the settings still in flux; the rest are decided", async () => {
    const { bb, harness } = setup();
    await plugin(bb);

    expect(
      Object.keys(harness.inspection.registrations.settingsDescriptors),
    ).toEqual([
      "childThreadLines",
      "groupHeaderIcons",
      "shimmerWorkingRows",
      "messageOnStageChange",
    ]);
    expect(harness.inspection.registrations.settingsDescriptors).toMatchObject({
      childThreadLines: { type: "select", options: ["Bar", "Tree"], default: "Bar" },
      groupHeaderIcons: {
        type: "select",
        options: ["On", "Off", "Standardized"],
        default: "On",
      },
      shimmerWorkingRows: { type: "boolean", default: true },
      messageOnStageChange: { type: "boolean", default: true },
    });
    await harness.lifecycle.dispose();
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
      groupId: "BlockedOnThirdParty",
      threadId: "thr_fork_source",
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
        value: { placement: { groupId: "BlockedOnThirdParty" } },
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

  it("places a newly created UI thread without rescanning all threads", async () => {
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
    fixture.list.mockClear();
    threads.push(
      makeThreadResponse({
        id: "thread-new",
        projectId: "project-a",
        sectionId: "section-a",
        parentThreadId: null,
        visibility: "visible",
        archivedAt: null,
      }),
    );

    await expect(
      fixture.harness.behavior.callRpc("placeNewThreadV1", {
        groupingKey: "plugin:thread-stages:stages",
        groupId: "BlockedOnThirdParty",
        threadId: "thread-new",
      }),
    ).resolves.toMatchObject({
      ok: true,
      value: { placement: { groupId: "BlockedOnThirdParty", origin: "ui" } },
    });
    expect(fixture.list).not.toHaveBeenCalled();
    expect(fixture.get).toHaveBeenCalledWith({ threadId: "thread-new" });
    await expect(
      fixture.harness.behavior.callRpc("getPlacementV1", {
        groupingKey: "builtin:projects",
        threadId: "thread-new",
      }),
    ).resolves.toMatchObject({
      ok: true,
      value: { placement: { groupId: "project-a" } },
    });
    await expect(
      fixture.harness.behavior.callRpc("getPlacementV1", {
        groupingKey: "builtin:sections",
        threadId: "thread-new",
      }),
    ).resolves.toMatchObject({
      ok: true,
      value: { placement: { groupId: "section-a" } },
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
    fixture.list.mockClear();

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
    expect(fixture.list).not.toHaveBeenCalled();
    await expect(
      fixture.harness.behavior.callRpc("getPlacementV1", {
        groupingKey: "builtin:sections",
        threadId: "thr_child",
      }),
    ).resolves.toMatchObject({
      ok: true,
      value: { placement: { groupId: "section_family" } },
    });
    service.controller.abort();
    await service.done;
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it("preserves an unparented child's stage independently of its former parent", async () => {
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
      groupId: "BlockedOnThirdParty",
      threadId: "thr_parent",
      origin: "ui",
    });
    const service = fixture.harness.behavior.runService("group-inheritance");
    await vi.waitFor(() => expect(subscribe).toHaveBeenCalledOnce());
    fixture.list.mockClear();
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
    fixture.list.mockClear();

    currentParentThreadId = "thr_new_parent";
    onThreadChanged?.({
      type: "changed",
      entity: "thread",
      id: "thr_child",
      changes: ["parent-changed"],
    });
    await vi.waitFor(() => expect(fixture.get).toHaveBeenCalledTimes(2));
    expect(fixture.update).not.toHaveBeenCalled();
    expect(fixture.list).not.toHaveBeenCalled();

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
    expect(fixture.list).not.toHaveBeenCalled();
    service.controller.abort();
    await service.done;
  });

  it("keeps a reparented thread as a root when its new parent is not live", async () => {
    let onThreadChanged: ThreadChangedCallback | undefined;
    const subscribe = vi.fn((args: RealtimeSubscribeArgs) => {
      if (args.event === "thread:changed") onThreadChanged = args.callback;
      return vi.fn();
    });
    let currentParentThreadId: string | null = null;
    const fixture = setup({
      subscribe,
      threads: [
        makeThreadResponse({
          id: "thr_root",
          parentThreadId: null,
          visibility: "visible",
          archivedAt: null,
        }),
      ],
      threadGet: async ({ threadId }) => {
        if (threadId === "thr_root") {
          return makeThreadResponse({
            id: threadId,
            parentThreadId: currentParentThreadId,
            visibility: "visible",
            archivedAt: null,
          });
        }
        return makeThreadResponse({
          id: threadId,
          parentThreadId: null,
          visibility: "hidden",
          archivedAt: null,
        });
      },
    });
    await plugin(fixture.bb);
    await fixture.harness.behavior.callRpc("updatePlacementV1", {
      groupingKey: "plugin:thread-stages:stages",
      groupId: "BlockedOnThirdParty",
      threadId: "thr_root",
      origin: "ui",
    });
    const service = fixture.harness.behavior.runService("group-inheritance");
    await vi.waitFor(() => expect(subscribe).toHaveBeenCalledOnce());
    fixture.get.mockClear();
    fixture.list.mockClear();

    currentParentThreadId = "thr_hidden_parent";
    onThreadChanged?.({
      type: "changed",
      entity: "thread",
      id: "thr_root",
      changes: ["parent-changed"],
    });

    await vi.waitFor(() => expect(fixture.get).toHaveBeenCalledTimes(2));
    await expect(
      fixture.harness.behavior.callRpc("getPlacementV1", {
        groupingKey: "plugin:thread-stages:stages",
        threadId: "thr_root",
      }),
    ).resolves.toMatchObject({
      ok: true,
      value: { placement: { groupId: "BlockedOnThirdParty" } },
    });
    expect(fixture.list).not.toHaveBeenCalled();
    service.controller.abort();
    await service.done;
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

  it("sets and lists a child's stage without changing its parent", async () => {
    const { bb, harness } = setup();
    await plugin(bb);
    await harness.behavior.callRpc("updatePlacementV1", {
      groupingKey: "plugin:thread-stages:stages",
      groupId: "Active",
      threadId: "thread-a",
      origin: "cli",
    });
    expect(await harness.behavior.callRpc("updatePlacementV1", {
      groupingKey: "plugin:thread-stages:stages",
      groupId: "BlockedOnThirdParty",
      threadId: "thread-child",
      origin: "cli",
    })).toMatchObject({ ok: true });
    expect(await harness.behavior.callRpc("getPlacementV1", {
      groupingKey: "plugin:thread-stages:stages",
      threadId: "thread-a",
    })).toMatchObject({ ok: true, value: { placement: { groupId: "Active" } } });
    const listed = await harness.behavior.runCli([
      "list", "--include-children", "--scope",
      "plugin:thread-stages:stages/BlockedOnThirdParty", "--json",
    ]);
    expect(JSON.parse(listed.stdout ?? "")).toEqual([
      expect.objectContaining({
        id: "thread-child",
        parentThreadId: "thread-a",
        section: { id: "section-a", name: "Release" },
      }),
    ]);
    const shown = await harness.behavior.runCli([
      "show", "thread-child", "--json",
    ]);
    expect(JSON.parse(shown.stdout ?? "")).toMatchObject({
      threadId: "thread-child",
      parentThreadId: "thread-a",
      stage: "BlockedOnThirdParty",
    });
    expect(await harness.behavior.callRpc("setWorkflowStage", {
      threadId: "thread-child", workflowStage: "Active",
    })).toEqual({ destination: { kind: "stay" } });
    await harness.behavior.callRpc("reorderThread", {
      threadId: "thread-child", scope: "stage", direction: 1,
    });
    await harness.behavior.callRpc("synchronizeV1", null);
    expect(await harness.behavior.callRpc("getPlacementV1", {
      groupingKey: "plugin:thread-stages:stages",
      threadId: "thread-child",
    })).toMatchObject({ ok: true, value: { placement: { groupId: "BlockedOnOtherAgent" } } });
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
    ).toBe("Personal");
    expect(
      result.groupings
        .find(({ groupingKey }) => groupingKey === "builtin:projects")
        ?.groups.map(({ label }) => label),
    ).toEqual(["Storefront", "Back office", "Personal"]);
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
      "listIconCatalog",
      "listIcons",
      "setIcon",
      "clearIcon",
      "setWorkflowStage",
      "reorderThread",
      "listThreadActionsV1",
      "saveThreadActionsV1",
      "runThreadActionV1",
      "createSectionV1",
      "deleteEntityV1",
      "getPlacementV1",
      "listChildOrderV1",
      "listPlacementsV1",
      "listThreadsV1",
      "placeNewThreadV1",
      "pullRequestDetailsV1",
      "searchThreadIdsV1",
      "renameEntityV1",
      "reorderChildrenV1",
      "sidebarSnapshotV1",
      "synchronizeV1",
      "updatePlacementV1",
      "updateSettingsV1",
    ]);
    expect(harness.inspection.registrations.cli).toMatchObject({
      name: "sidebar",
      rendersHelp: true,
      commands: expect.arrayContaining([
        expect.objectContaining({ name: "groupings" }),
        expect.objectContaining({ name: "place" }),
        expect.objectContaining({ name: "rekey" }),
      ]),
    });
    await expect(
      harness.behavior.runCli(["groupings", "--json"]),
    ).resolves.toMatchObject({ exitCode: 0 });
    const listed = await harness.behavior.runCli(["list", "--json"]);
    expect(listed.exitCode).toBe(0);
    expect(JSON.parse(listed.stdout ?? "")).toEqual([
      expect.objectContaining({
        id: "thread-a",
        status: expect.any(String),
        project: { id: "project-a", name: "Storefront" },
        section: { id: "section-a", name: "Release" },
        pluginGroups: [
          expect.objectContaining({
            pluginId: "thread-stages",
            groupingId: "stages",
            groupId: expect.any(String),
            groupName: expect.any(String),
          }),
        ],
      }),
    ]);
  });

  it("leaves working state to the row instead of automating an Active stage", async () => {
    const { bb, harness } = setup();
    await plugin(bb);

    expect(
      harness.inspection.registrations.services.map(({ name }) => name),
    ).not.toContain("stage-automation");
    expect(
      harness.inspection.registrations.schedules.map(({ name }) => name),
    ).not.toContain("stage-automation-reconciliation");
    const listed = await harness.behavior.runCli(["groupings", "--json"]);
    expect(listed.stdout).not.toContain('"Active"');
  });

  it("keeps archived and hidden roots out of CLI lists unless included", async () => {
    const visible = makeThreadResponse({
      id: "visible-root",
      projectId: "project-a",
      sectionId: "section-a",
      parentThreadId: null,
      visibility: "visible",
      archivedAt: null,
    });
    const hidden = makeThreadResponse({
      id: "hidden-root",
      projectId: "project-a",
      sectionId: "section-a",
      parentThreadId: null,
      visibility: "hidden",
      archivedAt: null,
    });
    const archived = makeThreadResponse({
      id: "archived-root",
      projectId: "project-a",
      sectionId: "section-a",
      parentThreadId: null,
      visibility: "visible",
      archivedAt: 100,
    });
    const { bb, harness } = setup({ threads: [visible, hidden, archived] });
    await plugin(bb);

    const listed = await harness.behavior.runCli(["list", "--json"]);
    expect(
      JSON.parse(listed.stdout ?? "").map(({ id }: { id: string }) => id),
    ).toEqual(["visible-root"]);

    const included = await harness.behavior.runCli([
      "list",
      "--include-archived",
      "--include-hidden",
      "--json",
    ]);
    expect(
      JSON.parse(included.stdout ?? "").map(({ id }: { id: string }) => id),
    ).toEqual(["visible-root", "hidden-root", "archived-root"]);
  });

  it("lists hidden and visible threads across both archival states", async () => {
    const activeHidden = makeThreadResponse({
      id: "active-hidden",
      visibility: "hidden",
      archivedAt: null,
    });
    const archivedVisible = makeThreadResponse({
      id: "archived-visible",
      visibility: "visible",
      archivedAt: 100,
    });
    const { bb, harness, list } = setup({
      threads: [activeHidden, archivedVisible],
    });
    await plugin(bb);

    await expect(
      harness.behavior.callRpc("listThreadsV1", null),
    ).resolves.toMatchObject({
      threads: [
        { id: "active-hidden", visibility: "hidden", isArchived: false },
        { id: "archived-visible", visibility: "visible", isArchived: true },
      ],
    });
    expect(list).toHaveBeenCalledWith({
      archived: false,
      includeHidden: true,
      limit: 100,
      offset: 0,
    });
    expect(list).toHaveBeenCalledWith({
      archived: true,
      includeHidden: true,
      limit: 100,
      offset: 0,
    });
  });


  it("saves the heading icon setting through the bb SDK", async () => {
    const { bb, harness, updateSettings } = setup();
    await plugin(bb);

    await expect(
      harness.behavior.callRpc("updateSettingsV1", { groupHeaderIcons: "Off" }),
    ).resolves.toEqual({ ok: true });
    expect(updateSettings).toHaveBeenCalledWith({
      pluginId: "thread-stages",
      values: { groupHeaderIcons: "Off" },
    });
  });



  it("keeps each parent's child order and forgets deleted threads", async () => {
    const { bb, harness } = setup();
    await plugin(bb);

    await expect(
      harness.behavior.callRpc("reorderChildrenV1", {
        parentThreadId: "thread-a",
        threadIds: ["thread-child-b", "thread-child"],
      }),
    ).resolves.toEqual({ ok: true });
    expect(harness.inspection.realtimeSignals).toContainEqual({
      channel: "child-order-changed",
      payload: null,
    });
    await expect(
      harness.behavior.callRpc("listChildOrderV1", null),
    ).resolves.toEqual({
      items: [
        { parentThreadId: "thread-a", threadId: "thread-child-b" },
        { parentThreadId: "thread-a", threadId: "thread-child" },
      ],
    });

    await harness.behavior.emitThreadEvent("thread.deleted", {
      thread: makeThreadResponse({ id: "thread-child-b" }),
    });
    await expect(
      harness.behavior.callRpc("listChildOrderV1", null),
    ).resolves.toEqual({
      items: [{ parentThreadId: "thread-a", threadId: "thread-child" }],
    });
  });

  it("moves a child among its siblings with the reorder shortcut", async () => {
    const threads = [
      makeThreadResponse({ id: "root", projectId: "project-a", createdAt: 1 }),
      ...["older", "middle", "newer"].map((id, index) =>
        makeThreadResponse({
          id,
          projectId: "project-a",
          parentThreadId: "root",
          createdAt: 2 + index,
        }),
      ),
    ];
    const { bb, harness } = setup({ threads, includeThreadStages: false });
    await plugin(bb);
    const order = async () =>
      (
        (await harness.behavior.callRpc("listChildOrderV1", null)) as {
          items: { threadId: string }[];
        }
      ).items.map(({ threadId }) => threadId);

    await harness.behavior.callRpc("reorderThread", {
      threadId: "older",
      scope: "step",
      direction: -1,
    });
    expect(await order()).toEqual(["newer", "older", "middle"]);
    await harness.behavior.callRpc("reorderThread", {
      threadId: "newer",
      scope: "edge",
      direction: 1,
    });
    expect(await order()).toEqual(["older", "middle", "newer"]);
    await harness.behavior.callRpc("reorderThread", {
      threadId: "older",
      scope: "stage",
      direction: 1,
    });
    await expect(
      harness.behavior.callRpc("getPlacementV1", {
        groupingKey: "plugin:thread-stages:stages",
        threadId: "older",
      }),
    ).resolves.toMatchObject({
      ok: true,
      value: { placement: { groupId: "BlockedOnOtherAgent" } },
    });
    expect(await order()).toEqual(["older", "middle", "newer"]);
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
    await harness.behavior.callRpc("synchronizeV1", null);

    expect(
      await harness.behavior.callRpc("getPlacementV1", {
        groupingKey: "plugin:thread-stages:stages",
        threadId: "thread-orphan",
      }),
    ).toMatchObject({
      ok: true,
      value: { placement: { groupId: "Active", origin: "auto" } },
    });
  });




  it("keeps project membership read-only and moves Section membership", async () => {
    const { bb, harness } = setup();
    await plugin(bb);
    await harness.behavior.callRpc("synchronizeV1", null);

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
    await harness.behavior.callRpc("synchronizeV1", null);
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
    await harness.behavior.callRpc("synchronizeV1", null);

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


  describe("stage change messages", () => {
    const stageThreads = () =>
      ["first", "second"].map((id) =>
        makeThreadResponse({
          id,
          projectId: "project-a",
          sectionId: "section-a",
          parentThreadId: null,
          visibility: "visible",
          archivedAt: null,
        }),
      );
    const moveToStage = (
      harness: ReturnType<typeof setup>["harness"],
      threadId: string,
      groupId: string,
      origin: "ui" | "cli" | "auto" = "ui",
    ) =>
      harness.behavior.callRpc("updatePlacementV1", {
        groupingKey: "plugin:thread-stages:stages",
        threadId,
        groupId,
        origin,
      });

    it("messages a root with stage mentions when its stage changes", async () => {
      const { bb, harness, send } = setup({ threads: stageThreads() });
      await plugin(bb);

      await expect(moveToStage(harness, "first", "BlockedOnThirdParty")).resolves.toMatchObject(
        { ok: true },
      );

      await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
      const request = send.mock.calls[0]![0];
      expect(request).toMatchObject({
        threadId: "first",
        mode: "steer-if-active",
      });
      const text = "Thread stage updated: @Active → @Blocked on third party";
      const mention = (label: string, itemId: string) => ({
        start: text.indexOf(`@${label}`),
        end: text.indexOf(`@${label}`) + label.length + 1,
        resource: {
          kind: "plugin",
          pluginId: "thread-stages",
          itemId,
          label,
        },
      });
      expect(request.input).toEqual([
        {
          type: "text",
          text,
          mentions: [
            mention("Active", "stage:active"),
            mention("Blocked on third party", "stage:blockedonthirdparty"),
          ],
        },
        {
          type: "text",
          text: expect.stringContaining("from Active to Blocked on third party"),
          mentions: [],
          visibility: "agent-only",
        },
      ]);
      expect(JSON.stringify(request.input[1])).toContain("the user");
      expect(harness.inspection.registrations.mentionProviders).toEqual([
        expect.objectContaining({ id: "stage", label: "Thread stages" }),
      ]);
    });

    it("messages a child when its own stage changes", async () => {
      const threads = stageThreads();
      const root = threads[0]!;
      const child = threads[1]!;
      const { bb, harness, send } = setup({
        threads: [root, { ...child, parentThreadId: root.id }],
      });
      await plugin(bb);

      await expect(moveToStage(harness, child.id, "BlockedOnThirdParty")).resolves.toMatchObject(
        { ok: true },
      );

      await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
      expect(send.mock.calls[0]![0]).toMatchObject({
        threadId: child.id,
        mode: "steer-if-active",
      });
      await expect(
        harness.behavior.callRpc("getPlacementV1", {
          groupingKey: "plugin:thread-stages:stages",
          threadId: root.id,
        }),
      ).resolves.toMatchObject({
        ok: true,
        value: { placement: { groupId: "Active" } },
      });
    });


    it("messages only for an actual stage change a person or agent made", async () => {
      const { bb, harness, send } = setup({
        threads: stageThreads(),
        includeThreadStages: false,
      });
      await plugin(bb);

      await moveToStage(harness, "first", "Active");
      await moveToStage(harness, "first", "BlockedOnThirdParty", "auto");
      await harness.behavior.callRpc("placeNewThreadV1", {
        groupingKey: "plugin:thread-stages:stages",
        groupId: "Deferred",
        threadId: "second",
      });
      await harness.behavior.runCli(
        ["place", "first", "--to", "plugin:thread-stages:stages/Completed"],
        { threadId: "first" },
      );
      await harness.behavior.runCli([
        "place",
        "second",
        "--to",
        "plugin:thread-stages:stages/Completed",
      ]);

      await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
      expect(send.mock.calls[0]![0]).toMatchObject({
        threadId: "second",
        input: [
          expect.objectContaining({
            text: "Thread stage updated: @Deferred → @Completed",
          }),
          expect.objectContaining({ text: expect.stringContaining("bb CLI") }),
        ],
      });
    });

    it("messages when a stage shortcut moves a root", async () => {
      const { bb, harness, send } = setup({
        threads: stageThreads(),
        includeThreadStages: false,
      });
      await plugin(bb);

      await harness.behavior.callRpc("setWorkflowStage", {
        threadId: "first",
        workflowStage: "Completed",
      });

      await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
      expect(send.mock.calls[0]![0]).toMatchObject({
        threadId: "first",
        input: [
          expect.objectContaining({
            text: "Thread stage updated: @Active → @Completed",
          }),
          expect.anything(),
        ],
      });
    });

    it("stays quiet when the setting is off", async () => {
      const { bb, harness, send } = setup({
        threads: stageThreads(),
        includeThreadStages: false,
        settings: { messageOnStageChange: false },
      });
      await plugin(bb);

      await moveToStage(harness, "first", "BlockedOnThirdParty");
      await harness.behavior.setSettings({ messageOnStageChange: true });
      await moveToStage(harness, "second", "BlockedOnThirdParty");

      await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
      expect(send.mock.calls[0]![0]).toMatchObject({ threadId: "second" });
    });

    it("keeps the stage change when the message cannot be delivered", async () => {
      const { bb, harness, send } = setup({
        threads: stageThreads(),
        includeThreadStages: false,
        threadSend: async () => {
          throw new Error("workspace destroyed");
        },
      });
      await plugin(bb);

      await expect(moveToStage(harness, "first", "BlockedOnThirdParty")).resolves.toMatchObject(
        { ok: true, value: { placement: { groupId: "BlockedOnThirdParty" } } },
      );
      await vi.waitFor(() =>
        expect(harness.inspection.logEntries).toContainEqual(
          expect.objectContaining({
            level: "warn",
            message: expect.stringContaining("workspace destroyed"),
          }),
        ),
      );
      expect(send).toHaveBeenCalledTimes(1);
    });
  });
});
