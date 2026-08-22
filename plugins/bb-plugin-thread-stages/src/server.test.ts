import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import plugin from "./server";

const disposeHosts: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(disposeHosts.splice(0).map((dispose) => dispose()));
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
        label: "Show projects and sections in sidebar",
        description:
          "Show the Projects and sections filter and management controls in the sidebar.",
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
    ]);
    expect(
      harness.inspection.registrations.services.map(({ name }) => name),
    ).toEqual(["stage-automation", "thread-previews"]);
    expect(harness.inspection.registrations.schedules).toMatchObject([
      { name: "completed-auto-archive", cron: "17 * * * *" },
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

  it("renames and removes projects and sections through the bb SDK", async () => {
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
