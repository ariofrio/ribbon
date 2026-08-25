import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import plugin, { rpcContract } from "./server";

const disposeHosts: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(disposeHosts.splice(0).map((dispose) => dispose()));
  vi.unstubAllGlobals();
});

function createPluginHarness() {
  const host = createFakePluginHost({ pluginId: "thread-stages" });
  plugin(host.bb);
  disposeHosts.push(() => host.harness.lifecycle.dispose());
  return host.harness;
}

describe("thread stages plugin API", () => {
  it("registers its complete host-facing contract", () => {
    const harness = createPluginHarness();

    expect(harness.inspection.registrations.settingsDescriptors).toEqual({
      showSidebarFilter: {
        type: "boolean",
        label: "Show sections and projects in sidebar",
        description:
          "Show the Sections and projects filter and management controls in the sidebar.",
        default: true,
      },
      showCollapsedStageIndicators: {
        type: "boolean",
        label: "Show collapsed stage indicators (experimental)",
        description:
          "Show the highest-priority thread activity indicator in collapsed stage headers.",
        default: false,
      },
      showThreadPreviews: {
        type: "boolean",
        label: "Show thread message previews",
        description: "Show the latest message preview below each thread title.",
        default: true,
      },
      showDeferredStage: {
        type: "boolean",
        label: "Show Deferred stage",
        description:
          "Allow threads to move into Deferred. A nonempty Deferred stage remains visible until it is emptied.",
        default: true,
      },
      showBlockedStage: {
        type: "boolean",
        label: "Show Blocked stage",
        description:
          "Allow threads to move into Blocked. A nonempty Blocked stage remains visible until it is emptied.",
        default: true,
      },
      autoArchiveCompletedAfter: {
        type: "select",
        label: "Auto-archive completed threads",
        description:
          "Archive unpinned Completed thread hierarchies after they have stayed in that stage for the selected time.",
        options: ["Never", "1 day", "7 days", "30 days"],
        default: "7 days",
      },
    });
    expect(harness.inspection.registrations.rpcMethods).toEqual([
      "createProjectFromFolder",
      "addProjectLocalPath",
      "createSection",
      "createSectionForThread",
      "deleteProject",
      "deleteSection",
      "listProjectActionStates",
      "listSections",
      "listState",
      "listPreviews",
      "listPinnedThreadIds",
      "reorderPinnedThread",
      "searchThreads",
      "setThreadSection",
      "syncThreads",
      "moveThread",
      "setWorkflowStage",
      "reorderThread",
      "renameProject",
      "renameSection",
      "updateSettings",
      "listProjectIcons",
      "listAppKeybindings",
      "getGroupingCatalogV1",
      "getPlacementMigrationSnapshotV1",
      "acknowledgePlacementMigrationV1",
    ]);
    expect(
      harness.inspection.registrations.services.map(({ name }) => name),
    ).toEqual(["stage-automation", "thread-previews"]);
    expect(harness.inspection.registrations.schedules).toMatchObject([
      { name: "completed-auto-archive", cron: "17 * * * *" },
      { name: "placement-forward-reconciliation", cron: "* * * * *" },
    ]);
    expect(harness.inspection.registrations.cli?.name).toBe("thread-stages");
    expect(harness.inspection.registrations.threadEventHandlers).toMatchObject({
      "thread.active": 1,
      "thread.created": 1,
      "thread.deleted": 1,
      "thread.failed": 1,
      "thread.idle": 1,
    });
  });

  it("lists the sections available to thread actions", async () => {
    const list = vi.fn(async () => [
      { id: "section_1", name: "Now", createdAt: 1, updatedAt: 2 },
      { id: "section_2", name: "Later", createdAt: 3, updatedAt: 4 },
    ]);
    const host = createFakePluginHost({
      pluginId: "thread-stages",
      sdk: { threadSections: { list } },
    });
    plugin(host.bb);
    disposeHosts.push(() => host.harness.lifecycle.dispose());

    await expect(
      host.harness.behavior.callRpc("listSections", null),
    ).resolves.toEqual({
      sections: [
        { id: "section_1", name: "Now" },
        { id: "section_2", name: "Later" },
      ],
    });
    expect(list).toHaveBeenCalledWith();
  });

  it("assigns and clears a thread section through the bb SDK", async () => {
    const update = vi.fn(async () => ({}));
    const host = createFakePluginHost({
      pluginId: "thread-stages",
      sdk: { threads: { update } },
    });
    plugin(host.bb);
    disposeHosts.push(() => host.harness.lifecycle.dispose());

    await expect(
      host.harness.behavior.callRpc("setThreadSection", {
        threadId: "thr_1",
        sectionId: "section_1",
      }),
    ).resolves.toEqual({ sectionId: "section_1" });
    await expect(
      host.harness.behavior.callRpc("setThreadSection", {
        threadId: "thr_1",
        sectionId: null,
      }),
    ).resolves.toEqual({ sectionId: null });
    expect(update).toHaveBeenNthCalledWith(1, {
      threadId: "thr_1",
      sectionId: "section_1",
    });
    expect(update).toHaveBeenNthCalledWith(2, {
      threadId: "thr_1",
      sectionId: null,
    });
  });

  it("creates a section and assigns the requesting thread", async () => {
    const create = vi.fn(async () => ({
      id: "section_new",
      name: "Waiting",
      createdAt: 1,
      updatedAt: 1,
    }));
    const update = vi.fn(async () => ({}));
    const host = createFakePluginHost({
      pluginId: "thread-stages",
      sdk: {
        threadSections: { create },
        threads: { update },
      },
    });
    plugin(host.bb);
    disposeHosts.push(() => host.harness.lifecycle.dispose());

    await expect(
      host.harness.behavior.callRpc("createSectionForThread", {
        threadId: "thr_1",
        name: "  Waiting  ",
      }),
    ).resolves.toEqual({
      section: { id: "section_new", name: "Waiting" },
    });
    expect(create).toHaveBeenCalledWith({ name: "Waiting" });
    expect(update).toHaveBeenCalledWith({
      threadId: "thr_1",
      sectionId: "section_new",
    });
  });

  it("creates a standalone section for the filter action", async () => {
    const create = vi.fn(async () => ({
      id: "section_new",
      name: "Waiting",
      createdAt: 1,
      updatedAt: 1,
    }));
    const host = createFakePluginHost({
      pluginId: "thread-stages",
      sdk: { threadSections: { create } },
    });
    plugin(host.bb);
    disposeHosts.push(() => host.harness.lifecycle.dispose());

    await expect(
      host.harness.behavior.callRpc("createSection", { name: "  Waiting  " }),
    ).resolves.toEqual({
      section: { id: "section_new", name: "Waiting" },
    });
    expect(create).toHaveBeenCalledWith({ name: "Waiting" });
  });

  it("uses bb's primary-host folder picker to create a project", async () => {
    const config = vi.fn(async () => ({ primaryHostId: "host_primary" }));
    const pickFolder = vi.fn(async () => ({ path: "/work/Alpha" }));
    const create = vi.fn(async () => ({ id: "proj_alpha", name: "Alpha" }));
    const host = createFakePluginHost({
      pluginId: "thread-stages",
      sdk: {
        hosts: { pickFolder },
        projects: { create },
        system: { config },
      },
    });
    plugin(host.bb);
    disposeHosts.push(() => host.harness.lifecycle.dispose());

    await expect(
      host.harness.behavior.callRpc("createProjectFromFolder", null),
    ).resolves.toEqual({ project: { id: "proj_alpha", name: "Alpha" } });
    expect(pickFolder).toHaveBeenCalledWith({
      hostId: "host_primary",
      clientHostId: "host_primary",
    });
    expect(create).toHaveBeenCalledWith({
      name: "Alpha",
      source: {
        type: "local_path",
        hostId: "host_primary",
        path: "/work/Alpha",
      },
    });
  });

  it("does nothing when the New project folder picker is canceled", async () => {
    const create = vi.fn();
    const host = createFakePluginHost({
      pluginId: "thread-stages",
      sdk: {
        hosts: { pickFolder: vi.fn(async () => ({ path: null })) },
        projects: { create },
        system: {
          config: vi.fn(async () => ({ primaryHostId: "host_primary" })),
        },
      },
    });
    plugin(host.bb);
    disposeHosts.push(() => host.harness.lifecycle.dispose());

    await expect(
      host.harness.behavior.callRpc("createProjectFromFolder", null),
    ).resolves.toEqual({ project: null });
    expect(create).not.toHaveBeenCalled();
  });

  it("reports whether each standard project can add a path on the primary host", async () => {
    const list = vi.fn(async () => [
      {
        id: "proj_alpha",
        name: "Alpha",
        kind: "standard",
        sources: [{ type: "local_path", hostId: "host_primary" }],
      },
      {
        id: "proj_beta",
        name: "Beta",
        kind: "standard",
        sources: [{ type: "local_path", hostId: "host_other" }],
      },
      { id: "proj_personal", name: "Personal", kind: "personal", sources: [] },
    ]);
    const host = createFakePluginHost({
      pluginId: "thread-stages",
      sdk: {
        projects: { list },
        system: {
          config: vi.fn(async () => ({ primaryHostId: "host_primary" })),
        },
      },
    });
    plugin(host.bb);
    disposeHosts.push(() => host.harness.lifecycle.dispose());

    await expect(
      host.harness.behavior.callRpc("listProjectActionStates", null),
    ).resolves.toEqual({
      projects: [
        { id: "proj_alpha", canAddLocalPath: false },
        { id: "proj_beta", canAddLocalPath: true },
      ],
    });
  });

  it("renames and removes sections and projects through the bb SDK", async () => {
    const projectUpdate = vi.fn(async () => ({}));
    const projectDelete = vi.fn(async () => ({ ok: true as const }));
    const sectionUpdate = vi.fn(async () => ({}));
    const sectionDelete = vi.fn(async () => ({ ok: true as const }));
    const host = createFakePluginHost({
      pluginId: "thread-stages",
      sdk: {
        projects: { update: projectUpdate, delete: projectDelete },
        threadSections: { update: sectionUpdate, delete: sectionDelete },
      },
    });
    plugin(host.bb);
    disposeHosts.push(() => host.harness.lifecycle.dispose());

    await host.harness.behavior.callRpc("renameProject", {
      projectId: "proj_alpha",
      name: "  Alpha two  ",
    });
    await host.harness.behavior.callRpc("renameSection", {
      sectionId: "section_1",
      name: "  Later  ",
    });
    await host.harness.behavior.callRpc("deleteProject", {
      projectId: "proj_alpha",
    });
    await host.harness.behavior.callRpc("deleteSection", {
      sectionId: "section_1",
    });

    expect(projectUpdate).toHaveBeenCalledWith({
      projectId: "proj_alpha",
      name: "Alpha two",
    });
    expect(sectionUpdate).toHaveBeenCalledWith({
      id: "section_1",
      name: "Later",
    });
    expect(projectDelete).toHaveBeenCalledWith({ projectId: "proj_alpha" });
    expect(sectionDelete).toHaveBeenCalledWith({ id: "section_1" });
  });

  it("adds a picked local path to an existing project", async () => {
    const add = vi.fn(async () => ({}));
    const pickFolder = vi.fn(async () => ({ path: "/work/Alpha" }));
    const host = createFakePluginHost({
      pluginId: "thread-stages",
      sdk: {
        hosts: { pickFolder },
        projects: {
          get: vi.fn(async () => ({ id: "proj_alpha", sources: [] })),
          sources: { add },
        },
        system: {
          config: vi.fn(async () => ({ primaryHostId: "host_primary" })),
        },
      },
    });
    plugin(host.bb);
    disposeHosts.push(() => host.harness.lifecycle.dispose());

    await expect(
      host.harness.behavior.callRpc("addProjectLocalPath", {
        projectId: "proj_alpha",
      }),
    ).resolves.toEqual({ added: true });
    expect(add).toHaveBeenCalledWith({
      projectId: "proj_alpha",
      type: "local_path",
      hostId: "host_primary",
      path: "/work/Alpha",
    });
  });

  it("serves persisted state through the schema-validated RPC boundary", async () => {
    const harness = createPluginHarness();

    await expect(harness.behavior.callRpc("listState", null)).resolves.toEqual({
      assignments: [],
    });
    await expect(
      harness.behavior.callRpc("moveThread", {
        threadId: "",
        workflowStage: "Active",
        previousThreadId: null,
        nextThreadId: null,
      }),
    ).rejects.toMatchObject({ code: "invalid_input" });
  });

  it("serves the provider catalog through its strict versioned RPC", async () => {
    const harness = createPluginHarness();

    await expect(
      harness.behavior.callRpc("getGroupingCatalogV1", null),
    ).resolves.toMatchObject({
      protocolVersion: 1,
      groupings: [
        {
          id: "stages",
          defaultGroupId: "Idle",
          groups: [
            { id: "Deferred" },
            { id: "Idle" },
            { id: "Active" },
            { id: "Blocked" },
            { id: "Completed" },
          ],
        },
      ],
    });
    await expect(
      harness.behavior.callRpc("getGroupingCatalogV1", {}),
    ).rejects.toMatchObject({ code: "invalid_input" });
  });

  it("snapshots and acknowledges placement migration through strict RPCs", async () => {
    const harness = createPluginHarness();
    await harness.behavior.callRpc("syncThreads", {
      rootThreadIds: ["thr_a"],
      childThreadIds: [],
    });

    const snapshot = (await harness.behavior.callRpc(
      "getPlacementMigrationSnapshotV1",
      null,
    )) as { installationId: string; revision: number };
    await expect(
      harness.behavior.callRpc("acknowledgePlacementMigrationV1", {
        installationId: snapshot.installationId,
        revision: snapshot.revision,
        unexpected: true,
      }),
    ).rejects.toMatchObject({ code: "invalid_input" });
    await expect(
      harness.behavior.callRpc("acknowledgePlacementMigrationV1", {
        installationId: snapshot.installationId,
        revision: snapshot.revision,
      }),
    ).resolves.toEqual({ transferred: true });
    await expect(harness.behavior.callRpc("listState", null)).rejects.toThrow(
      "ownership has transferred",
    );
  });

  it("forwards UI placement after handoff without changing the frozen source", async () => {
    const fetcher = vi.fn(async () =>
      new Response(
        JSON.stringify({
          ok: true,
          result: {
            ok: true,
            value: {
              placement: {
                groupingKey: "plugin:thread-stages:stages",
                groupId: "Completed",
                threadId: "thr_a",
                enteredAtMs: 2,
                previousGroupId: "Idle",
                origin: "ui",
              },
              revision: 2,
            },
          },
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetcher);
    const host = createFakePluginHost({
      pluginId: "thread-stages",
      sdk: {
        threads: {
          list: vi.fn(async () => [
            { id: "thr_a", parentThreadId: null, projectId: "proj_a" },
          ]),
        },
      },
    });
    plugin(host.bb);
    disposeHosts.push(() => host.harness.lifecycle.dispose());
    await host.harness.behavior.callRpc("syncThreads", {
      rootThreadIds: ["thr_a"],
      childThreadIds: [],
    });
    const before = (await host.harness.behavior.callRpc(
      "getPlacementMigrationSnapshotV1",
      null,
    )) as { installationId: string; revision: number };
    await host.harness.behavior.callRpc("acknowledgePlacementMigrationV1", {
      installationId: before.installationId,
      revision: before.revision,
    });

    await expect(
      host.harness.behavior.callRpc("moveThread", {
        threadId: "thr_a",
        workflowStage: "Completed",
        previousThreadId: null,
        nextThreadId: null,
      }),
    ).resolves.toMatchObject({ assignments: [{ threadId: "thr_a" }] });
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining("/ribbon-sidebar/rpc/updatePlacementV1"),
      expect.objectContaining({
        body: JSON.stringify({
          groupingKey: "plugin:thread-stages:stages",
          groupId: "Completed",
          threadId: "thr_a",
          anchor: { kind: "end" },
          origin: "ui",
        }),
      }),
    );
    await expect(
      host.harness.behavior.callRpc("getPlacementMigrationSnapshotV1", null),
    ).resolves.toMatchObject({ revision: before.revision });
  });

  it("forwards post-handoff root reconciliation without writing the source", async () => {
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true, result: null }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetcher);
    const host = createFakePluginHost({ pluginId: "thread-stages" });
    plugin(host.bb);
    disposeHosts.push(() => host.harness.lifecycle.dispose());
    await host.harness.behavior.callRpc("syncThreads", {
      rootThreadIds: ["thr_a"],
      childThreadIds: [],
    });
    const snapshot = (await host.harness.behavior.callRpc(
      "getPlacementMigrationSnapshotV1",
      null,
    )) as { installationId: string; revision: number };
    await host.harness.behavior.callRpc("acknowledgePlacementMigrationV1", {
      installationId: snapshot.installationId,
      revision: snapshot.revision,
    });

    await expect(
      host.harness.behavior.callRpc("syncThreads", {
        rootThreadIds: ["thr_a", "thr_new"],
        childThreadIds: [],
      }),
    ).rejects.toThrow("ownership has transferred");
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining("/invalidateGroupingCatalogV1"),
      expect.objectContaining({
        body: JSON.stringify({ providerPluginId: "thread-stages" }),
      }),
    );
    await expect(
      host.harness.behavior.callRpc("getPlacementMigrationSnapshotV1", null),
    ).resolves.toMatchObject({ revision: snapshot.revision });
  });

  it("reports forwarding failure and schedules later reconciliation", async () => {
    const fetcher = vi.fn(async () => new Response("missing", { status: 404 }));
    vi.stubGlobal("fetch", fetcher);
    const host = createFakePluginHost({
      pluginId: "thread-stages",
      sdk: {
        threads: {
          list: vi.fn(async () => [
            { id: "thr_a", parentThreadId: null, projectId: "proj_a" },
          ]),
        },
      },
    });
    plugin(host.bb);
    disposeHosts.push(() => host.harness.lifecycle.dispose());
    await host.harness.behavior.callRpc("syncThreads", {
      rootThreadIds: ["thr_a"],
      childThreadIds: [],
    });
    const snapshot = (await host.harness.behavior.callRpc(
      "getPlacementMigrationSnapshotV1",
      null,
    )) as { installationId: string; revision: number };
    await host.harness.behavior.callRpc("acknowledgePlacementMigrationV1", {
      installationId: snapshot.installationId,
      revision: snapshot.revision,
    });

    await expect(
      host.harness.behavior.callRpc("moveThread", {
        threadId: "thr_a",
        workflowStage: "Completed",
        previousThreadId: null,
        nextThreadId: null,
      }),
    ).rejects.toThrow("Ribbon sidebar dependency problem");

    fetcher.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, result: null }), { status: 200 }),
    );
    await host.harness.behavior.runSchedule(
      "placement-forward-reconciliation",
    );
    expect(fetcher).toHaveBeenLastCalledWith(
      expect.stringContaining("/invalidateGroupingCatalogV1"),
      expect.objectContaining({
        body: JSON.stringify({ providerPluginId: "thread-stages" }),
      }),
    );
  });

  it("uses Ribbon placements for post-handoff undo policy", async () => {
    const rpc = (result: unknown) =>
      new Response(JSON.stringify({ ok: true, result }), { status: 200 });
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        rpc({
          ok: true,
          value: {
            groupingKey: "plugin:thread-stages:stages",
            revision: 7,
            items: [
              {
                groupingKey: "plugin:thread-stages:stages",
                groupId: "Idle",
                threadId: "thr_a",
                enteredAtMs: 100,
                origin: "auto",
              },
              {
                groupingKey: "plugin:thread-stages:stages",
                groupId: "Completed",
                threadId: "thr_b",
                enteredAtMs: 200,
                previousGroupId: "Idle",
                origin: "ui",
              },
            ],
          },
        }),
      )
      .mockResolvedValueOnce(
        rpc({
          ok: true,
          value: {
            placement: {
              groupingKey: "plugin:thread-stages:stages",
              groupId: "Idle",
              threadId: "thr_b",
              enteredAtMs: 300,
              previousGroupId: "Completed",
              origin: "ui",
            },
            revision: 8,
          },
        }),
      );
    vi.stubGlobal("fetch", fetcher);
    const listedThreads = ["thr_a", "thr_b"].map((id, index) => ({
      id,
      parentThreadId: null,
      projectId: "proj_a",
      visibility: "visible",
      archivedAt: null,
      pinnedAt: null,
      pinSortKey: null,
      createdAt: index,
    }));
    const host = createFakePluginHost({
      pluginId: "thread-stages",
      sdk: { threads: { list: vi.fn(async () => listedThreads) } },
    });
    plugin(host.bb);
    disposeHosts.push(() => host.harness.lifecycle.dispose());
    await host.harness.behavior.callRpc("syncThreads", {
      rootThreadIds: ["thr_a", "thr_b"],
      childThreadIds: [],
    });
    const snapshot = (await host.harness.behavior.callRpc(
      "getPlacementMigrationSnapshotV1",
      null,
    )) as { installationId: string; revision: number };
    await host.harness.behavior.callRpc("acknowledgePlacementMigrationV1", {
      installationId: snapshot.installationId,
      revision: snapshot.revision,
    });

    await expect(
      host.harness.behavior.callRpc("setWorkflowStage", {
        threadId: "thr_a",
        workflowStage: "Idle",
      }),
    ).resolves.toEqual({
      destination: {
        kind: "thread",
        threadId: "thr_b",
        projectId: "proj_a",
      },
    });
    expect(fetcher).toHaveBeenLastCalledWith(
      expect.stringContaining("/updatePlacementV1"),
      expect.objectContaining({
        body: JSON.stringify({
          groupingKey: "plugin:thread-stages:stages",
          groupId: "Idle",
          threadId: "thr_b",
          anchor: { kind: "preserve" },
          expectedRevision: 7,
          origin: "ui",
        }),
      }),
    );
  });

  it("rejects moves into disabled stages", async () => {
    const host = createFakePluginHost({
      pluginId: "thread-stages",
      settings: { showBlockedStage: false },
    });
    plugin(host.bb);
    disposeHosts.push(() => host.harness.lifecycle.dispose());

    await expect(
      host.harness.behavior.callRpc("moveThread", {
        threadId: "thr_1",
        workflowStage: "Blocked",
        previousThreadId: null,
        nextThreadId: null,
      }),
    ).rejects.toThrow("Stage Blocked is disabled");
  });

  it("reads project icons from the Icons plugin through the bb SDK", async () => {
    const glyph = [["path", { d: "M1" }]] as const;
    const callRpc = vi.fn(async () => ({
      icons: [
        {
          kind: "project",
          id: "proj_a",
          icon: "rocket",
          color: "teal",
          glyph,
        },
      ],
      defaults: { project: glyph, personal: glyph, section: glyph },
    }));
    const host = createFakePluginHost({
      pluginId: "thread-stages",
      sdk: { plugins: { callRpc } },
    });
    plugin(host.bb);
    disposeHosts.push(() => host.harness.lifecycle.dispose());

    await expect(
      host.harness.behavior.callRpc("listProjectIcons", null),
    ).resolves.toMatchObject({
      icons: [{ id: "proj_a", icon: "rocket" }],
    });
    expect(callRpc).toHaveBeenCalledWith(
      expect.objectContaining({
        pluginId: "icons",
        method: "listIcons",
        input: null,
      }),
    );
  });

  it("drops an icon row it cannot draw, not the whole set", async () => {
    const glyph = [["path", { d: "M1" }]] as const;
    const callRpc = vi.fn(async () => ({
      icons: [
        { kind: "project", id: "proj_a", icon: "rocket", color: null, glyph },
        // The Icons plugin owns this shape and may grow it.
        { kind: "machine", id: "host_a", icon: "server", color: null, glyph },
      ],
      defaults: { project: glyph, personal: glyph, section: glyph },
    }));
    const host = createFakePluginHost({
      pluginId: "thread-stages",
      sdk: { plugins: { callRpc } },
    });
    plugin(host.bb);
    disposeHosts.push(() => host.harness.lifecycle.dispose());

    await expect(
      host.harness.behavior.callRpc("listProjectIcons", null),
    ).resolves.toMatchObject({ icons: [{ id: "proj_a" }] });
  });

  it("answers a chord with the next thread and the project it lives in", async () => {
    const thread = (id: string, createdAt: number) => ({
      id,
      parentThreadId: null,
      projectId: "proj_personal",
      visibility: "visible",
      archivedAt: null,
      pinnedAt: null,
      pinSortKey: null,
      createdAt,
    });
    const list = vi.fn(async (args?: { offset?: number }) =>
      (args?.offset ?? 0) === 0
        ? [thread("thr_open", 1), thread("thr_next", 2)]
        : [],
    );
    const host = createFakePluginHost({
      pluginId: "thread-stages",
      sdk: { threads: { list } },
    });
    plugin(host.bb);
    disposeHosts.push(() => host.harness.lifecycle.dispose());

    await host.harness.behavior.callRpc("syncThreads", {
      rootThreadIds: ["thr_open", "thr_next"],
      childThreadIds: [],
    });

    await expect(
      host.harness.behavior.callRpc("setWorkflowStage", {
        threadId: "thr_open",
        workflowStage: "Active",
      }),
    ).resolves.toEqual({
      destination: {
        kind: "thread",
        threadId: "thr_next",
        projectId: "proj_personal",
      },
    });
  });

  it("reads bb's own keybindings through the SDK", async () => {
    const config = vi.fn(async () => ({
      keybindings: [
        {
          command: "thread.new",
          desktopOnly: false,
          shortcut: {
            alt: false,
            control: false,
            key: "o",
            meta: false,
            mod: true,
            shift: true,
          },
          when: { all: [], none: [] },
        },
      ],
    }));
    const host = createFakePluginHost({
      pluginId: "thread-stages",
      sdk: { system: { config } },
    });
    plugin(host.bb);
    disposeHosts.push(() => host.harness.lifecycle.dispose());

    await expect(
      host.harness.behavior.callRpc("listAppKeybindings", null),
    ).resolves.toEqual({
      keybindings: [
        {
          command: "thread.new",
          desktopOnly: false,
          shortcut: {
            alt: false,
            control: false,
            key: "o",
            meta: false,
            mod: true,
            shift: true,
          },
        },
      ],
    });
    expect(config).toHaveBeenCalled();
  });

  it("drops a keybinding row it cannot read, not the whole table", async () => {
    const shortcut = {
      alt: false,
      control: false,
      key: "o",
      meta: false,
      mod: true,
      shift: true,
    };
    const config = vi.fn(async () => ({
      keybindings: [
        { command: "thread.new", desktopOnly: false, shortcut },
        { command: "thread.next", shortcut: { key: 42 } },
      ],
    }));
    const host = createFakePluginHost({
      pluginId: "thread-stages",
      sdk: { system: { config } },
    });
    plugin(host.bb);
    disposeHosts.push(() => host.harness.lifecycle.dispose());

    await expect(
      host.harness.behavior.callRpc("listAppKeybindings", null),
    ).resolves.toEqual({
      keybindings: [{ command: "thread.new", desktopOnly: false, shortcut }],
    });
  });

  it("takes every setting it defines, so a new control does not fail to save", () => {
    const harness = createPluginHarness();

    expect(Object.keys(rpcContract.updateSettings.input.shape).sort()).toEqual(
      Object.keys(harness.inspection.registrations.settingsDescriptors).sort(),
    );
  });

  it("saves its own settings through the bb SDK", async () => {
    const updateSettings = vi.fn(async () => ({ values: {} }));
    const host = createFakePluginHost({
      pluginId: "thread-stages",
      sdk: { plugins: { updateSettings } },
    });
    plugin(host.bb);
    disposeHosts.push(() => host.harness.lifecycle.dispose());

    await expect(
      host.harness.behavior.callRpc("updateSettings", {
        showSidebarFilter: false,
      }),
    ).resolves.toEqual({ ok: true });
    expect(updateSettings).toHaveBeenCalledWith({
      pluginId: "thread-stages",
      values: { showSidebarFilter: false },
    });
  });

  it("rejects an unknown setting at the RPC boundary", async () => {
    const updateSettings = vi.fn(async () => ({ values: {} }));
    const host = createFakePluginHost({
      pluginId: "thread-stages",
      sdk: { plugins: { updateSettings } },
    });
    plugin(host.bb);
    disposeHosts.push(() => host.harness.lifecycle.dispose());

    await expect(
      host.harness.behavior.callRpc("updateSettings", { showTheMoon: true }),
    ).rejects.toMatchObject({ code: "invalid_input" });
    expect(updateSettings).not.toHaveBeenCalled();
  });

  it("runs its CLI through host result normalization", async () => {
    const harness = createPluginHarness();

    await expect(harness.behavior.runCli(["--help"])).resolves.toMatchObject({
      exitCode: 0,
      stderr: "",
      stdout: expect.stringContaining("bb thread-stages [options] [command]"),
    });
  });
});
