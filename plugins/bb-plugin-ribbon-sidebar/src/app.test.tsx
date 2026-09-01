// @vitest-environment jsdom
import {
  loadPluginApp,
  mountPluginContentScripts,
  renderSlot,
} from "@get-bb/plugin-sdk/testing/app";
import { cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { IconDataV1 } from "./contracts";
import { ICON_ATTRIBUTE, ICON_OPTIONAL_ATTRIBUTE } from "./icon-styles";
import type { GroupingKey } from "./placement-store";
import {
  RIBBON_SIDEBAR_PREFERENCES_CHANGED_EVENT,
} from "./new-thread-section";
import { SIDEBAR_PREFERENCES_KEY } from "./view-state";

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  window.localStorage.clear();
});

function storeSectionScope(groupId: string) {
  window.localStorage.setItem(
    SIDEBAR_PREFERENCES_KEY,
    JSON.stringify({
      view: {
        scope: {
          kind: "group",
          group: { groupingKey: "builtin:sections", groupId },
        },
        groupingKey: "plugin:thread-stages:stages",
        filterGroupingKey: "builtin:sections",
      },
      collapsed: [],
    }),
  );
}

function storeGroupScope(groupingKey: GroupingKey, groupId: string) {
  window.localStorage.setItem(
    SIDEBAR_PREFERENCES_KEY,
    JSON.stringify({
      view: {
        scope: { kind: "group", group: { groupingKey, groupId } },
        groupingKey: "builtin:sections",
        filterGroupingKey: groupingKey,
      },
      collapsed: [],
    }),
  );
}

function appendNewThreadComposer() {
  const composer = document.createElement("div");
  composer.dataset.appComposer = "";
  composer.dataset.appComposerRole = "primary";
  const form = document.createElement("form");
  form.dataset.promptbox = "";
  const projectControl = document.createElement("button");
  projectControl.dataset.promptboxProjectControl = "";
  projectControl.textContent = "Project";
  form.append(projectControl);
  composer.append(form);
  document.body.append(composer);
  return { composer, form, projectControl };
}

const activity = {
  workflows: 0,
  backgroundAgents: 0,
  backgroundCommands: 0,
  planMode: 0,
  goals: 0,
};
const thread = (value: Partial<Record<string, unknown>> & { id: string }) => {
  const { id, ...overrides } = value;
  return {
  id,
  projectId: "project-a",
  title: value.id,
  titleFallback: null,
  parentThreadId: null,
  sectionId: "section-a",
  originKind: null,
  originPluginId: null,
  providerId: "codex",
  hasPendingInteraction: false,
  activity,
  indicator: "none" as const,
  indicatorLabel: null,
  isUnread: false,
  isPinned: false,
  isArchived: false,
  environment: null,
  host: null,
  createdAt: 1,
  updatedAt: 2,
  lastReadAt: 2,
  latestAttentionAt: 1,
  ...overrides,
  };
};

const snapshot: {
  groupings: Array<{
    groupingKey: GroupingKey;
    singularLabel: string;
    pluralLabel: string;
    icon?: IconDataV1;
    defaultGroupId: string;
    available: boolean;
    membershipWritable: boolean;
    groups: Array<{
      id: string;
      label: string;
      icon?: IconDataV1;
      visibleWhenEmpty: boolean;
      acceptsAssignments: boolean;
      defaultCollapsed: boolean;
    }>;
  }>;
} = {
  groupings: [
    {
      groupingKey: "builtin:projects",
      singularLabel: "Project",
      pluralLabel: "Projects",
      defaultGroupId: "project-a",
      available: true,
      membershipWritable: false,
      groups: [
        {
          id: "project-a",
          label: "Storefront",
          visibleWhenEmpty: true,
          acceptsAssignments: true,
          defaultCollapsed: false,
        },
      ],
    },
    {
      groupingKey: "builtin:sections",
      singularLabel: "Section",
      pluralLabel: "Sections",
      defaultGroupId: "unsectioned",
      available: true,
      membershipWritable: true,
      groups: [
        {
          id: "section-a",
          label: "Release",
          visibleWhenEmpty: true,
          acceptsAssignments: true,
          defaultCollapsed: false,
        },
        {
          id: "section-b",
          label: "Roadmap",
          visibleWhenEmpty: true,
          acceptsAssignments: true,
          defaultCollapsed: false,
        },
        {
          id: "unsectioned",
          label: "Unorganized",
          visibleWhenEmpty: true,
          acceptsAssignments: true,
          defaultCollapsed: false,
        },
      ],
    },
    {
      groupingKey: "plugin:thread-stages:stages",
      singularLabel: "Stage",
      pluralLabel: "Stages",
      icon: {
        tag: "svg",
        attrs: { viewBox: "0 0 24 24" },
        children: [
          { tag: "path", attrs: { d: "M8 5v14l11-7z" } },
        ],
      },
      defaultGroupId: "Idle",
      available: true,
      membershipWritable: true,
      groups: [
        {
          id: "Idle",
          label: "Idle",
          icon: {
            tag: "svg",
            attrs: { viewBox: "0 0 24 24" },
            children: [
              { tag: "circle", attrs: { cx: 12, cy: 12, r: 8 } },
            ],
          },
          visibleWhenEmpty: true,
          acceptsAssignments: true,
          defaultCollapsed: false,
        },
        {
          id: "Active",
          label: "Active",
          icon: {
            tag: "svg",
            attrs: { viewBox: "0 0 24 24" },
            children: [
              { tag: "path", attrs: { d: "M8 5v14l11-7z" } },
            ],
          },
          visibleWhenEmpty: true,
          acceptsAssignments: true,
          defaultCollapsed: false,
        },
      ],
    },
  ],
};

const props = {
  activeThreadId: null,
  activeProjectId: null,
  isCompactViewport: false,
  onNavigate: vi.fn(),
  searchQuery: "",
  experimental_Original: () => <div>BB original list</div>,
};

function options(overrides: Record<string, unknown> = {}) {
  const synchronizeV1 = vi.fn(async () => snapshot);
  const listPlacementsV1 = vi.fn(async (raw: unknown) => {
    const { groupingKey, threadIds } = raw as {
      groupingKey: string;
      threadIds?: string[];
    };
    return {
    ok: true as const,
    value: {
      groupingKey,
      revision: 1,
      items: ["thread-a", "thread-b"]
        .filter((threadId) => threadIds?.includes(threadId) ?? true)
        .map((threadId, index) => ({
          groupingKey,
          groupId:
            groupingKey === "builtin:projects"
              ? "project-a"
              : groupingKey === "builtin:sections"
                ? threadId === "thread-b"
                  ? "section-b"
                  : "section-a"
                : index === 0
                  ? "Idle"
                  : "Active",
          threadId,
          enteredAtMs: groupingKey.startsWith("plugin:") ? 1 : null,
          ...(groupingKey.startsWith("plugin:") ? { origin: "auto" } : {}),
        })),
    },
    };
  });
  const updatePlacementV1 = vi.fn(async (input: unknown) => ({
    ok: true as const,
    value: {
      placement: {
        ...(input as Record<string, unknown>),
        enteredAtMs: 1,
      },
      revision: 2,
    },
  }));
  const placeNewThreadV1 = vi.fn(async (input: unknown) => ({
    ok: true as const,
    value: {
      placement: {
        ...(input as Record<string, unknown>),
        enteredAtMs: 1,
        origin: "ui" as const,
      },
      revision: 2,
    },
  }));
  const createProjectV1 = vi.fn(async () => ({ id: "project-new" }));
  const createSectionV1 = vi.fn(async () => ({ id: "section-new" }));
  const renameEntityV1 = vi.fn(async () => null);
  const deleteEntityV1 = vi.fn(async () => null);
  const addProjectLocalPathV1 = vi.fn(async () => ({ added: true }));
  const reorderPinnedV1 = vi.fn(async () => ({ reordered: true }));
  const listProjectActionStatesV1 = vi.fn(async () => ({
    projects: [{ id: "project-a", canAddLocalPath: true }],
  }));
  const updateSettingsV1 = vi.fn(async () => ({ ok: true as const }));
  return {
    synchronizeV1,
    listPlacementsV1,
    updatePlacementV1,
    placeNewThreadV1,
    createProjectV1,
    createSectionV1,
    renameEntityV1,
    deleteEntityV1,
    addProjectLocalPathV1,
    reorderPinnedV1,
    listProjectActionStatesV1,
    updateSettingsV1,
    value: {
      settings: {
        showProjectsAndSections: true,
        showMessagePreviews: true,
        showCollapsedGroupIndicators: false,
        showGroupHeaderIcons: true,
      },
      rpc: {
        synchronizeV1,
        listPlacementsV1,
        listPreviewsV1: vi.fn(async (_input: unknown) => ({
          previews: [
            { threadId: "thread-a", preview: "A useful preview" },
          ],
        })),
        listProjectActionStatesV1,
        searchThreadIdsV1: vi.fn(async (raw: unknown) => ({
          threadIds: (raw as { query: string }).query
            .toLocaleLowerCase()
            .includes("migration")
            ? ["thread-a"]
            : [],
          threads: [],
        })),
        updatePlacementV1,
        placeNewThreadV1,
        addProjectLocalPathV1,
        reorderPinnedV1,
        createProjectV1,
        createSectionV1,
        renameEntityV1,
        deleteEntityV1,
        updateSettingsV1,
      },
      sidebarThreads: {
        projects: [
          { id: "project-a", name: "Storefront", isPersonal: false },
        ],
        threads: [
          thread({ id: "thread-pin", isPinned: true }),
          thread({ id: "thread-a", title: "Design migration" }),
          thread({ id: "thread-child", parentThreadId: "thread-a" }),
          thread({ id: "thread-b", title: "Ship UI" }),
        ],
      },
      ...overrides,
    },
  };
}

describe("Ribbon sidebar app", () => {
  it("registers the exclusive list and starts migration only when mounted", async () => {
    const app = await loadPluginApp(() => import("./app"));
    expect(app.threadLists).toHaveLength(1);
    expect(app.threadLists[0]).toMatchObject({
      id: "ribbon-sidebar",
      title: "Ribbon sidebar",
    });
    const fixture = options();
    expect(fixture.synchronizeV1).not.toHaveBeenCalled();
    const slot = renderSlot(app.threadLists[0]!, props, fixture.value);
    expect(await slot.findByText("Design migration")).toBeTruthy();
    expect(await slot.findByText("A useful preview")).toBeTruthy();
    expect(fixture.synchronizeV1).toHaveBeenCalledWith({
      migrateThreadStages: true,
    });
    slot.lifecycle.unmount();
  });

  it("selects the scoped section when a New thread composer appears", async () => {
    storeSectionScope("section-a");
    window.history.replaceState(
      { idx: 1, key: "compose", usr: { focusPrompt: true } },
      "",
      "/",
    );
    const originalPushState = window.history.pushState;
    const originalReplaceState = window.history.replaceState;
    const app = await loadPluginApp(() => import("./app"));
    const scripts = await mountPluginContentScripts(app, {
      pluginId: "ribbon-sidebar",
      generation: 1,
    });

    appendNewThreadComposer();

    await waitFor(() =>
      expect(window.history.state.usr?.sectionId).toBe("section-a"),
    );
    expect(window.history.pushState).toBe(originalPushState);
    expect(window.history.replaceState).toBe(originalReplaceState);
    await scripts.lifecycle.dispose();
  });

  it("updates an open composer when its Section scope changes", async () => {
    storeSectionScope("section-a");
    window.history.replaceState(
      { idx: 1, key: "compose", usr: { focusPrompt: true } },
      "",
      "/",
    );
    appendNewThreadComposer();
    const app = await loadPluginApp(() => import("./app"));
    const scripts = await mountPluginContentScripts(app, {
      pluginId: "ribbon-sidebar",
      generation: 1,
    });
    await waitFor(() =>
      expect(window.history.state.usr?.sectionId).toBe("section-a"),
    );

    storeSectionScope("unsectioned");
    window.dispatchEvent(
      new Event(RIBBON_SIDEBAR_PREFERENCES_CHANGED_EVENT),
    );

    await waitFor(() => expect(window.history.state.usr.sectionId).toBe(""));
    await scripts.lifecycle.dispose();
  });

  it("clears an injected Section when an open composer switches to a provider group", async () => {
    storeSectionScope("section-a");
    window.history.replaceState(
      { idx: 1, key: "compose", usr: { focusPrompt: true } },
      "",
      "/",
    );
    appendNewThreadComposer();
    const app = await loadPluginApp(() => import("./app"));
    const scripts = await mountPluginContentScripts(app, {
      pluginId: "ribbon-sidebar",
      generation: 1,
    });
    await waitFor(() =>
      expect(window.history.state.usr?.sectionId).toBe("section-a"),
    );

    storeGroupScope("plugin:thread-stages:stages", "Active");
    window.dispatchEvent(
      new Event(RIBBON_SIDEBAR_PREFERENCES_CHANGED_EVENT),
    );

    await waitFor(() =>
      expect(window.history.state.usr).not.toHaveProperty("sectionId"),
    );
    await scripts.lifecycle.dispose();
  });

  it("captures a selected provider group when the New thread form is submitted", async () => {
    storeGroupScope("plugin:thread-stages:stages", "Active");
    const { form } = appendNewThreadComposer();
    const requested: unknown[] = [];
    window.addEventListener("bb.ribbon-sidebar.new-thread-group-requested", (event) => {
      requested.push((event as CustomEvent).detail);
    });
    const app = await loadPluginApp(() => import("./app"));
    const scripts = await mountPluginContentScripts(app, {
      pluginId: "ribbon-sidebar",
      generation: 1,
    });

    fireEvent.submit(form);

    expect(requested).toEqual([
      {
        groupingKey: "plugin:thread-stages:stages",
        groupId: "Active",
      },
    ]);
    await scripts.lifecycle.dispose();
  });

  it("requests the selected Project when a New thread composer appears", async () => {
    storeGroupScope("builtin:projects", "project-a");
    const requested: unknown[] = [];
    window.addEventListener("bb.ribbon-sidebar.new-thread-project-requested", (event) => {
      requested.push((event as CustomEvent).detail);
    });
    const app = await loadPluginApp(() => import("./app"));
    const scripts = await mountPluginContentScripts(app, {
      pluginId: "ribbon-sidebar",
      generation: 1,
    });

    appendNewThreadComposer();

    await waitFor(() => expect(requested).toEqual(["project-a"]));
    await scripts.lifecycle.dispose();
  });

  it("requests a selected Project only once across composer remounts", async () => {
    storeGroupScope("builtin:projects", "project-a");
    const requested: unknown[] = [];
    const capture = (event: Event) => {
      const projectId = (event as CustomEvent).detail;
      requested.push(projectId);
    };
    window.addEventListener(
      "bb.ribbon-sidebar.new-thread-project-requested",
      capture,
    );
    const app = await loadPluginApp(() => import("./app"));
    const scripts = await mountPluginContentScripts(app, {
      pluginId: "ribbon-sidebar",
      generation: 1,
    });

    for (let mount = 0; mount < 2; mount += 1) {
      document.body.replaceChildren();
      appendNewThreadComposer();
      await new Promise<void>((resolve) => queueMicrotask(resolve));
    }

    expect(requested).toEqual(["project-a"]);
    await scripts.lifecycle.dispose();
    window.removeEventListener(
      "bb.ribbon-sidebar.new-thread-project-requested",
      capture,
    );
  });

  it("delivers a pending Project request when Ribbon mounts later", async () => {
    storeGroupScope("builtin:projects", "project-a");
    appendNewThreadComposer();
    const app = await loadPluginApp(() => import("./app"));
    const scripts = await mountPluginContentScripts(app, {
      pluginId: "ribbon-sidebar",
      generation: 1,
    });
    const fixture = options();
    const slot = renderSlot(app.threadLists[0]!, props, fixture.value);

    await waitFor(() =>
      expect(slot.inspection.sidebarActionCalls).toContainEqual({
        method: "openNewThread",
        options: { projectId: "project-a", focusPrompt: true },
      }),
    );
    expect(
      document.documentElement.hasAttribute(
        "data-ribbon-sidebar-pending-new-thread-project",
      ),
    ).toBe(false);
    slot.lifecycle.unmount();
    await scripts.lifecycle.dispose();
  });

  it("does not rescan the document for unrelated DOM mutations", async () => {
    storeSectionScope("section-a");
    const querySelectorAll = vi.spyOn(document, "querySelectorAll");
    const app = await loadPluginApp(() => import("./app"));
    const scripts = await mountPluginContentScripts(app, {
      pluginId: "ribbon-sidebar",
      generation: 1,
    });
    querySelectorAll.mockClear();

    document.body.append(document.createElement("span"));
    await waitFor(() => expect(document.body.lastElementChild).toBeTruthy());

    expect(querySelectorAll).not.toHaveBeenCalled();
    querySelectorAll.mockRestore();
    await scripts.lifecycle.dispose();
  });

  it("selects the requested Project through bb's New thread action", async () => {
    storeGroupScope("builtin:projects", "project-a");
    const app = await loadPluginApp(() => import("./app"));
    const fixture = options();
    const slot = renderSlot(app.threadLists[0]!, props, fixture.value);
    expect(await slot.findByRole("button", { name: "Storefront, filtered" })).toBeTruthy();

    window.dispatchEvent(
      new CustomEvent("bb.ribbon-sidebar.new-thread-project-requested", {
        detail: "project-a",
      }),
    );

    await waitFor(() =>
      expect(slot.inspection.sidebarActionCalls).toContainEqual({
        method: "openNewThread",
        options: { projectId: "project-a", focusPrompt: true },
      }),
    );
    slot.lifecycle.unmount();
  });

  it("places the newly active thread in the provider group captured at submission", async () => {
    storeGroupScope("plugin:thread-stages:stages", "Active");
    const app = await loadPluginApp(() => import("./app"));
    const sidebarThreads = {
      projects: [{ id: "project-a", name: "Storefront", isPersonal: false }],
      threads: [] as ReturnType<typeof thread>[],
    };
    const fixture = options({
      sidebarThreads,
    });
    const slot = renderSlot(app.threadLists[0]!, props, fixture.value);
    expect(await slot.findByRole("button", { name: "Active, filtered" })).toBeTruthy();

    window.dispatchEvent(
      new CustomEvent("bb.ribbon-sidebar.new-thread-group-requested", {
        detail: {
          groupingKey: "plugin:thread-stages:stages",
          groupId: "Active",
        },
      }),
    );
    sidebarThreads.threads.push(thread({ id: "thread-new" }));
    slot.lifecycle.rerender(
      createElement(app.threadLists[0]!.component, {
        ...props,
        activeThreadId: "thread-new",
      }),
    );

    await waitFor(() =>
      expect(fixture.placeNewThreadV1).toHaveBeenCalledWith({
        groupingKey: "plugin:thread-stages:stages",
        groupId: "Active",
        threadId: "thread-new",
      }),
    );
    slot.lifecycle.unmount();
  });

  it("does not place a known thread after a New thread submission fails", async () => {
    storeGroupScope("plugin:thread-stages:stages", "Active");
    const app = await loadPluginApp(() => import("./app"));
    const fixture = options();
    const slot = renderSlot(app.threadLists[0]!, props, fixture.value);
    expect(await slot.findByRole("button", { name: "Active, filtered" })).toBeTruthy();

    window.dispatchEvent(
      new CustomEvent("bb.ribbon-sidebar.new-thread-group-requested", {
        detail: {
          groupingKey: "plugin:thread-stages:stages",
          groupId: "Active",
        },
      }),
    );
    slot.lifecycle.rerender(
      createElement(app.threadLists[0]!.component, {
        ...props,
        activeThreadId: "thread-a",
      }),
    );

    await waitFor(() => expect(fixture.synchronizeV1).toHaveBeenCalled());
    expect(fixture.placeNewThreadV1).not.toHaveBeenCalled();
    slot.lifecycle.unmount();
  });

  it("refreshes cached previews when the backend publishes a change", async () => {
    const app = await loadPluginApp(() => import("./app"));
    const fixture = options();
    fixture.value.rpc.listPreviewsV1
      .mockResolvedValueOnce({
        previews: [{ threadId: "thread-a", preview: "Initial preview" }],
      })
      .mockResolvedValue({
        previews: [{ threadId: "thread-a", preview: "Updated preview" }],
      });
    const slot = renderSlot(app.threadLists[0]!, props, fixture.value);

    expect(await slot.findByText("Initial preview")).toBeTruthy();
    await slot.emitRealtime("previews-changed", { threadId: "thread-a" });
    expect(await slot.findByText("Updated preview")).toBeTruthy();
    slot.lifecycle.unmount();
  });

  it("preserves released Thread stages row and group interactions", async () => {
    const app = await loadPluginApp(() => import("./app"));
    const fixture = options({
      sidebarThreads: {
        projects: [
          { id: "project-a", name: "Storefront", isPersonal: false },
        ],
        threads: [
          thread({
            id: "thread-a",
            title: "Design migration",
            indicator: "runtime",
            indicatorLabel: "Thread working",
          }),
          thread({
            id: "thread-child",
            parentThreadId: "thread-a",
            title: "Verify child flow",
            indicator: "waiting-for-input",
            indicatorLabel: "Needs input",
          }),
          thread({ id: "thread-b", title: "Ship UI" }),
        ],
      },
      rpc: {
        ...options().value.rpc,
        listPreviewsV1: vi.fn(async () => ({
          previews: [
            { threadId: "thread-a", preview: "A useful preview" },
            { threadId: "thread-child", preview: "Child preview" },
          ],
        })),
      },
    });
    const slot = renderSlot(app.threadLists[0]!, props, fixture.value);

    const open = await slot.findByRole("link", {
      name: "Open Design migration — A useful preview",
    });
    expect(open).toBeTruthy();
    expect(slot.getByLabelText("Thread working")).toBeTruthy();
    expect(
      open.parentElement?.querySelector('[data-ribbon-icons-project="project-a"]'),
    ).not.toBeNull();

    const collapseChildren = slot.getByRole("button", {
      name: "Collapse Design migration threads",
    });
    fireEvent.click(collapseChildren);
    expect(slot.queryByText("Verify child flow")).toBeNull();
    expect(slot.getByLabelText("Needs input")).toBeTruthy();
    expect(slot.queryByLabelText("Thread working")).toBeNull();
    expect(
      JSON.parse(
        window.localStorage.getItem("bb.sidebar.collapsedThreads") ?? "[]",
      ),
    ).toEqual(["thread-a"]);
    fireEvent.click(
      slot.getByRole("button", { name: "Expand Design migration threads" }),
    );
    expect(slot.getByText("Verify child flow")).toBeTruthy();
    expect(slot.getByLabelText("Thread working")).toBeTruthy();
    expect(slot.getByText("Child preview")).toBeTruthy();
    expect(fixture.value.rpc.listPreviewsV1).toHaveBeenCalledWith({
      threadIds: ["thread-a", "thread-child", "thread-b"],
    });
    expect(
      JSON.parse(
        window.localStorage.getItem("bb.sidebar.collapsedThreads") ?? "[]",
      ),
    ).toEqual([]);

    expect(slot.getByLabelText("Idle group icon")).toBeTruthy();
    expect(
      slot.getByRole("button", { name: "Collapse Idle section" }),
    ).toBeTruthy();
    expect(slot.queryByText("Stage: Idle")).toBeNull();

    fireEvent.keyDown(
      slot
        .getByText("Design migration")
        .closest("[data-thread-id]")!
        .querySelector('[aria-label="Thread actions"]')!,
      { key: "Enter" },
    );
    expect(await slot.findByText("Mark unread")).toBeTruthy();
    expect(slot.getByText("Pin")).toBeTruthy();
    expect(slot.getByText("Rename")).toBeTruthy();
    expect(
      slot
        .getByText("Move to stage")
        .closest('[role="menuitem"]')
        ?.querySelector('path[d="M8 5v14l11-7z"]'),
    ).toBeTruthy();
    expect(slot.getByText("Move to section")).toBeTruthy();
    expect(slot.getByText("Archive")).toBeTruthy();
    expect(slot.getByText("Delete")).toBeTruthy();
    slot.lifecycle.unmount();
  });

  it("names each row's owner for the Icons plugin to paint", async () => {
    const app = await loadPluginApp(() => import("./app"));
    const fixture = options();
    const slot = renderSlot(app.threadLists[0]!, props, fixture.value);
    await slot.findByText("Design migration");

    const box = slot.container.querySelector(
      '[data-ribbon-icons-project="project-a"]',
    );
    expect(box).not.toBeNull();

    // The rules and the boxes are written apart, in CSS and in JSX; a rename
    // on one side would render an empty span forever.
    const sheet = document.head.querySelector(
      "style[data-ribbon-sidebar-icons]",
    )?.textContent;
    expect(sheet).toContain(`[${ICON_ATTRIBUTE}="project"]`);
    expect(box?.getAttribute(ICON_ATTRIBUTE)).toBe("project");
    expect(sheet).toContain(`[${ICON_OPTIONAL_ATTRIBUTE}]{display:none}`);
    expect(box?.hasAttribute(ICON_OPTIONAL_ATTRIBUTE)).toBe(true);

    slot.lifecycle.unmount();
    expect(
      document.head.querySelector("style[data-ribbon-sidebar-icons]"),
    ).toBeNull();
  });

  it("applies provider collapse defaults for a fresh client", async () => {
    const app = await loadPluginApp(() => import("./app"));
    const fixture = options();
    fixture.synchronizeV1.mockResolvedValue({
      ...snapshot,
      groupings: snapshot.groupings.map((grouping) => ({
        ...grouping,
        groups: grouping.groups.map((group) => ({
          ...group,
          defaultCollapsed:
            grouping.groupingKey === "plugin:thread-stages:stages" &&
            group.id === "Active",
        })),
      })),
    });
    const slot = renderSlot(app.threadLists[0]!, props, fixture.value);

    await waitFor(() =>
      expect(
        slot
          .getByRole("button", { name: "Expand Active section" })
          .getAttribute("aria-expanded"),
      ).toBe("false"),
    );
    expect(slot.queryByText("Ship UI")).toBeNull();
    slot.lifecycle.unmount();
  });

  it("keeps pins and hierarchy while host search filters roots", async () => {
    const app = await loadPluginApp(() => import("./app"));
    const fixture = options();
    const slot = renderSlot(
      app.threadLists[0]!,
      { ...props, searchQuery: "migration" },
      fixture.value,
    );
    expect(await slot.findByText("Design migration")).toBeTruthy();
    expect(slot.queryByText("Pinned")).toBeNull();
    expect(slot.queryByText("thread-pin")).toBeNull();
    expect(slot.getByText("thread-child")).toBeTruthy();
    expect(slot.queryByText("Ship UI")).toBeNull();
    slot.lifecycle.unmount();
  });

  it("preserves the released collapsed Pinned section preference", async () => {
    window.localStorage.setItem(
      "bb.plugin.workflow-stage.collapsedStatuses",
      JSON.stringify(["Pinned"]),
    );
    const app = await loadPluginApp(() => import("./app"));
    const fixture = options();
    const slot = renderSlot(app.threadLists[0]!, props, fixture.value);

    await slot.findByRole("button", { name: "Expand Pinned section" });
    fireEvent.keyDown(
      slot.getByRole("button", { name: "Pinned options" }),
      { key: "Enter" },
    );
    expect(await slot.findByRole("menuitem", { name: "Group by" })).toBeTruthy();
    expect(slot.queryByRole("separator")).toBeNull();
    fireEvent.keyDown(slot.getByRole("menuitem", { name: "Group by" }), {
      key: "Escape",
    });
    expect(slot.queryByText("thread-pin")).toBeNull();
    fireEvent.click(
      slot.getByRole("button", { name: "Expand Pinned section" }),
    );
    expect(await slot.findByText("thread-pin")).toBeTruthy();
    slot.lifecycle.unmount();
  });

  it("uses bb's thread search results instead of title-only matching", async () => {
    const app = await loadPluginApp(() => import("./app"));
    const fixture = options();
    fixture.value.rpc.searchThreadIdsV1 = vi.fn(async (_raw: unknown) => ({
      threadIds: ["thread-b"],
      threads: [],
    }));
    const slot = renderSlot(
      app.threadLists[0]!,
      { ...props, searchQuery: "message body keyword" },
      fixture.value,
    );

    expect(await slot.findByText("Ship UI")).toBeTruthy();
    expect(slot.queryByText("Design migration")).toBeNull();
    expect(
      slot.queryByRole("button", { name: "Move Ship UI" }),
    ).toBeNull();
    slot.lifecycle.unmount();
  });

  it("preserves released archived-thread search results", async () => {
    const app = await loadPluginApp(() => import("./app"));
    const fixture = options();
    fixture.value.rpc.searchThreadIdsV1 = vi.fn(async () => ({
      threadIds: ["thread-archived"],
      threads: [
        {
          id: "thread-archived",
          projectId: "project-a",
          title: "Archived migration",
          titleFallback: null,
          parentThreadId: null,
          providerId: "codex",
          isArchived: true,
        },
      ],
    })) as never;
    const onNavigate = vi.fn();
    const slot = renderSlot(
      app.threadLists[0]!,
      { ...props, onNavigate, searchQuery: "archived migration" },
      fixture.value,
    );

    expect(await slot.findByText("Archived migration")).toBeTruthy();
    expect(
      slot.queryByRole("button", { name: "Thread actions" }),
    ).toBeNull();
    fireEvent.click(slot.getByRole("link", { name: "Open Archived migration" }));
    expect(slot.inspection.sidebarActionCalls).not.toContainEqual(
      expect.objectContaining({ method: "open", threadId: "thread-archived" }),
    );
    expect(onNavigate).toHaveBeenCalledOnce();
    slot.lifecycle.unmount();
  });

  it("moves an existing section scope to the root of a newly opened thread", async () => {
    window.localStorage.setItem(
      "bb.plugin.ribbon-sidebar.preferences.v1",
      JSON.stringify({
        view: {
          scope: {
            kind: "group",
            group: {
              groupingKey: "builtin:sections",
              groupId: "section-a",
            },
          },
          groupingKey: "plugin:thread-stages:stages",
        },
        collapsed: [],
      }),
    );
    const app = await loadPluginApp(() => import("./app"));
    const fixture = options({
      sidebarThreads: {
        projects: [
          { id: "project-a", name: "Storefront", isPersonal: false },
        ],
        threads: [
          thread({ id: "thread-a", title: "Design migration" }),
          thread({
            id: "thread-b",
            title: "Ship UI",
            sectionId: "section-b",
          }),
          thread({
            id: "thread-b-child",
            title: "Opened child",
            parentThreadId: "thread-b",
            sectionId: null,
          }),
        ],
      },
    });
    fixture.value.rpc.listPlacementsV1 = vi.fn(async (raw: unknown) => {
      const { groupingKey, threadIds } = raw as {
        groupingKey: string;
        threadIds?: string[];
      };
      const ids = (threadIds ?? ["thread-a", "thread-b"]).filter((id) =>
        ["thread-a", "thread-b"].includes(id),
      );
      return {
        ok: true as const,
        value: {
          groupingKey,
          revision: 1,
          items: ids.map((threadId) => ({
            groupingKey,
            groupId:
              groupingKey === "builtin:sections"
                ? threadId === "thread-b"
                  ? "section-b"
                  : "section-a"
                : "Idle",
            threadId,
            enteredAtMs: groupingKey.startsWith("plugin:") ? 1 : null,
            ...(groupingKey.startsWith("plugin:")
              ? { origin: "auto" as const }
              : {}),
          })),
        },
      };
    });
    const slot = renderSlot(
      app.threadLists[0]!,
      { ...props, activeThreadId: "thread-b-child" },
      fixture.value,
    );

    expect(await slot.findByRole("button", { name: "Roadmap, filtered" })).toBeTruthy();
    expect(await slot.findByText("Ship UI")).toBeTruthy();
    expect(await slot.findByText("Opened child")).toBeTruthy();
    expect(
      slot.container.querySelector<HTMLElement>("[data-ribbon-sidebar-root]")
        ?.dataset,
    ).toMatchObject({
      ribbonSidebarScopeGroupingKey: "builtin:sections",
      ribbonSidebarScopeGroupId: "section-b",
    });

    fireEvent.keyDown(
      slot.getByRole("button", { name: "Roadmap, filtered" }),
      { key: "Enter" },
    );
    fireEvent.click(await slot.findByText("Release"));
    expect(await slot.findByRole("button", { name: "Release, filtered" })).toBeTruthy();
    expect(await slot.findByText("Design migration")).toBeTruthy();
    expect(
      slot.container.querySelector<HTMLElement>("[data-ribbon-sidebar-root]")
        ?.dataset,
    ).toMatchObject({
      ribbonSidebarScopeGroupingKey: "builtin:sections",
      ribbonSidebarScopeGroupId: "section-a",
    });
    slot.lifecycle.unmount();
  });

  it("previews only the opened thread inside a collapsed stage", async () => {
    window.localStorage.setItem(
      "bb.plugin.ribbon-sidebar.preferences.v1",
      JSON.stringify({
        view: {
          scope: { kind: "all" },
          groupingKey: "plugin:thread-stages:stages",
        },
        collapsed: ["plugin:thread-stages:stages/Idle"],
      }),
    );
    const app = await loadPluginApp(() => import("./app"));
    const fixture = options();
    fixture.value.rpc.listPlacementsV1 = vi.fn(async () => ({
      ok: true as const,
      value: {
        groupingKey: "plugin:thread-stages:stages",
        revision: 1,
        items: ["thread-a", "thread-b"].map((threadId) => ({
          groupingKey: "plugin:thread-stages:stages",
          groupId: "Idle",
          threadId,
          enteredAtMs: 1,
          origin: "auto" as const,
        })),
      },
    }));
    const slot = renderSlot(
      app.threadLists[0]!,
      { ...props, activeThreadId: "thread-a" },
      fixture.value,
    );

    expect(await slot.findByText("Design migration")).toBeTruthy();
    expect(slot.queryByText("thread-child")).toBeNull();
    expect(slot.queryByText("Ship UI")).toBeNull();
    expect(
      slot.getByRole("button", { name: "Expand Idle section" }).getAttribute(
        "aria-expanded",
      ),
    ).toBe("false");
    slot.lifecycle.unmount();
  });

  it("ignores saved scope and collapsed groups while searching", async () => {
    window.localStorage.setItem(
      "bb.plugin.ribbon-sidebar.preferences.v1",
      JSON.stringify({
        view: {
          scope: {
            kind: "group",
            group: {
              groupingKey: "builtin:sections",
              groupId: "section-a",
            },
          },
          groupingKey: "plugin:thread-stages:stages",
        },
        collapsed: ["plugin:thread-stages:stages/Active"],
      }),
    );
    const app = await loadPluginApp(() => import("./app"));
    const fixture = options();
    fixture.value.rpc.searchThreadIdsV1 = vi.fn(async () => ({
      threadIds: ["thread-b"],
      threads: [],
    }));
    fixture.value.rpc.listPlacementsV1 = vi.fn(async (raw: unknown) => {
      const { groupingKey, threadIds } = raw as {
        groupingKey: string;
        threadIds?: string[];
      };
      const ids = threadIds ?? ["thread-a", "thread-b"];
      return {
        ok: true as const,
        value: {
          groupingKey,
          revision: 1,
          items: ids.map((threadId) => ({
            groupingKey,
            groupId:
              groupingKey === "builtin:sections"
                ? threadId === "thread-b"
                  ? "section-b"
                  : "section-a"
                : threadId === "thread-b"
                  ? "Active"
                  : "Idle",
            threadId,
            enteredAtMs: groupingKey.startsWith("plugin:") ? 1 : null,
            ...(groupingKey.startsWith("plugin:")
              ? { origin: "auto" as const }
              : {}),
          })),
        },
      };
    });
    const slot = renderSlot(
      app.threadLists[0]!,
      { ...props, searchQuery: "ship" },
      fixture.value,
    );

    expect(await slot.findByText("Ship UI")).toBeTruthy();
    expect(
      slot.getByRole("button", { name: "Collapse Active section" }).getAttribute(
        "aria-expanded",
      ),
    ).toBe("true");
    expect(slot.queryByText("Design migration")).toBeNull();
    slot.lifecycle.unmount();
  });

  it("renders unpinned roots in Ribbon's stored within-group order", async () => {
    const app = await loadPluginApp(() => import("./app"));
    const fixture = options();
    fixture.value.rpc.listPlacementsV1 = vi.fn(async () => ({
      ok: true as const,
      value: {
        groupingKey: "plugin:thread-stages:stages",
        revision: 1,
        items: [
          {
            groupingKey: "plugin:thread-stages:stages",
            groupId: "Idle",
            threadId: "thread-b",
            enteredAtMs: 1,
            origin: "ui" as const,
          },
          {
            groupingKey: "plugin:thread-stages:stages",
            groupId: "Idle",
            threadId: "thread-a",
            enteredAtMs: 1,
            origin: "ui" as const,
          },
        ],
      },
    }));
    const slot = renderSlot(app.threadLists[0]!, props, fixture.value);

    await slot.findByText("Design migration");
    const idleGroup = slot.getByRole("region", { name: "Idle group" });
    const renderedRoots = Array.from(
      idleGroup.querySelectorAll<HTMLElement>("[data-thread-id]"),
    )
      .map((child) => child.dataset.threadId)
      .filter((threadId) => threadId === "thread-a" || threadId === "thread-b");
    expect(renderedRoots).toEqual(["thread-b", "thread-a"]);
    slot.lifecycle.unmount();
  });

  it("promotes a live child when its parent is absent from the live hierarchy", async () => {
    const app = await loadPluginApp(() => import("./app"));
    const fixture = options({
      sidebarThreads: {
        projects: [{ id: "project-a", name: "Storefront", isPersonal: false }],
        threads: [
          thread({ id: "thread-parent", isArchived: true }),
          thread({
            id: "thread-orphan",
            parentThreadId: "thread-parent",
            title: "Visible child",
          }),
        ],
      },
    });
    fixture.value.rpc.listPlacementsV1 = vi.fn(async () => ({
      ok: true as const,
      value: {
        groupingKey: "plugin:thread-stages:stages",
        revision: 1,
        items: [
          {
            groupingKey: "plugin:thread-stages:stages",
            groupId: "Idle",
            threadId: "thread-orphan",
            enteredAtMs: 1,
            origin: "auto" as const,
          },
        ],
      },
    }));
    const slot = renderSlot(app.threadLists[0]!, props, fixture.value);

    expect(await slot.findByText("Visible child")).toBeTruthy();
    slot.lifecycle.unmount();
  });

  it("expands the filtered grouping in the Groups menu", async () => {
    const app = await loadPluginApp(() => import("./app"));
    const fixture = options();
    const slot = renderSlot(app.threadLists[0]!, props, fixture.value);
    await slot.findByText("Design migration");

    fireEvent.keyDown(
      slot.getByRole("button", { name: "Groups" }),
      { key: "Enter" },
    );
    expect(await slot.findByText("All groups")).toBeTruthy();
    fireEvent.click(await slot.findByRole("menuitemradio", { name: /Release/u }));
    expect(await slot.findByRole("button", { name: "Release, filtered" }))
      .toBeTruthy();

    fireEvent.keyDown(slot.getByRole("button", { name: "Release, filtered" }), {
      key: "Enter",
    });
    const allGroups = await slot.findByRole("menuitemradio", {
      name: "All groups",
    });
    expect(allGroups).toBeTruthy();
    expect(slot.queryByRole("menuitem", { name: "Group by section" })).toBeNull();
    const projects = slot.getByRole("menuitem", { name: "Projects" });
    const stages = slot.getByRole("menuitem", { name: "Stages" });
    const sectionHeader = slot.getByText("Sections");
    expect(
      allGroups.compareDocumentPosition(sectionHeader) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      sectionHeader.compareDocumentPosition(projects) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      projects.compareDocumentPosition(stages) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(allGroups.parentElement?.nextElementSibling?.getAttribute("role"))
      .toBe("separator");
    expect(slot.getByRole("menuitemradio", { name: /Release/u })).toBeTruthy();
    slot.lifecycle.unmount();
  });

  it("expands the remembered filter grouping when All groups is selected", async () => {
    const app = await loadPluginApp(() => import("./app"));
    const fixture = options();
    const slot = renderSlot(app.threadLists[0]!, props, fixture.value);
    await slot.findByText("Design migration");

    fireEvent.keyDown(slot.getByRole("button", { name: "Groups" }), {
      key: "Enter",
    });

    const allGroups = await slot.findByRole("menuitemradio", {
      name: "All groups",
    });
    const release = slot.getByRole("menuitemradio", { name: /Release/u });
    const unorganized = slot.getByRole("menuitemradio", {
      name: "Unorganized",
    });
    const newSection = slot.getByRole("menuitem", { name: "New section" });
    const projects = slot.getByRole("menuitem", { name: "Projects" });
    const stages = slot.getByRole("menuitem", { name: "Stages" });
    expect(allGroups.getAttribute("aria-checked")).toBe("true");
    expect(release.parentElement).toBe(unorganized.parentElement);
    expect(release.parentElement?.nextElementSibling).toBe(newSection);
    expect(
      newSection.compareDocumentPosition(projects) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      projects.compareDocumentPosition(stages) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(slot.queryByText(/Group by/u)).toBeNull();
    slot.lifecycle.unmount();
  });

  it("remembers a different filter grouping after returning to All groups", async () => {
    const app = await loadPluginApp(() => import("./app"));
    const fixture = options();
    const slot = renderSlot(app.threadLists[0]!, props, fixture.value);
    await slot.findByText("Design migration");

    fireEvent.keyDown(slot.getByRole("button", { name: "Groups" }), {
      key: "Enter",
    });
    fireEvent.keyDown(slot.getByRole("menuitem", { name: "Projects" }), {
      key: "ArrowRight",
    });
    fireEvent.click(
      await slot.findByRole("menuitemradio", { name: /Storefront/u }),
    );
    fireEvent.keyDown(
      await slot.findByRole("button", { name: "Storefront, filtered" }),
      { key: "Enter" },
    );
    fireEvent.click(
      await slot.findByRole("menuitemradio", { name: "All groups" }),
    );
    fireEvent.keyDown(await slot.findByRole("button", { name: "Groups" }), {
      key: "Enter",
    });

    const storefront = await slot.findByRole("menuitemradio", {
      name: /Storefront/u,
    });
    const newProject = slot.getByRole("menuitem", { name: "New project" });
    expect(storefront.parentElement?.nextElementSibling).toBe(newProject);
    expect(slot.getByRole("menuitem", { name: "Sections" })).toBeTruthy();
    expect(slot.getByRole("menuitem", { name: "Stages" })).toBeTruthy();
    slot.lifecycle.unmount();
  });

  it("keeps the selected display grouping until No grouping is chosen", async () => {
    const app = await loadPluginApp(() => import("./app"));
    const fixture = options();
    const slot = renderSlot(app.threadLists[0]!, props, fixture.value);
    await slot.findByText("Design migration");

    const idle = slot.getByRole("region", { name: "Idle group" });
    fireEvent.keyDown(within(idle).getByRole("button", { name: "Idle options" }), {
      key: "Enter",
    });
    const groupBy = slot.getByRole("menuitem", { name: "Group by" });
    expect(slot.queryByRole("separator")).toBeNull();
    groupBy.focus();
    fireEvent.pointerMove(groupBy);
    fireEvent.keyDown(groupBy, {
      key: "ArrowRight",
    });
    const checked = await slot.findByRole("menuitemcheckbox", {
      name: "Stages",
    });
    expect(checked.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(checked);

    expect(
      await slot.findByRole("region", { name: "Idle group" }),
    ).toBeTruthy();
    expect(
      slot.queryByRole("region", { name: "Threads group" }),
    ).toBeNull();

    fireEvent.keyDown(within(idle).getByRole("button", { name: "Idle options" }), {
      key: "Enter",
    });
    const reopenedGroupBy = slot.getByRole("menuitem", { name: "Group by" });
    reopenedGroupBy.focus();
    fireEvent.keyDown(reopenedGroupBy, { key: "ArrowRight" });
    const noGrouping = await slot.findByRole("menuitemcheckbox", {
      name: "No grouping",
    });
    expect(noGrouping.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(noGrouping);

    const threads = await slot.findByRole("region", {
      name: "Threads group",
    });
    expect(slot.getByText("Design migration")).toBeTruthy();
    expect(
      (
        slot
          .getByText("Design migration")
          .closest("[data-thread-id]") as HTMLElement
      ).draggable,
    ).toBe(false);
    fireEvent.keyDown(
      within(threads).getByRole("button", { name: "Threads options" }),
      { key: "Enter" },
    );
    const flatGroupBy = slot.getByRole("menuitem", { name: "Group by" });
    flatGroupBy.focus();
    fireEvent.keyDown(flatGroupBy, {
      key: "ArrowRight",
    });
    expect(
      (await slot.findByRole("menuitemcheckbox", { name: "Stages" }))
        .getAttribute("aria-checked"),
    ).toBe("false");
    expect(
      (await slot.findByRole("menuitemcheckbox", { name: "No grouping" }))
        .getAttribute("aria-checked"),
    ).toBe("true");
    slot.lifecycle.unmount();
  });

  it("shows Threads and changes grouping from the group header menu", async () => {
    window.localStorage.setItem(
      "bb.plugin.ribbon-sidebar.preferences.v1",
      JSON.stringify({
        view: {
          scope: { kind: "all" },
          groupingKey: null,
          filterGroupingKey: "builtin:sections",
        },
        collapsed: [],
      }),
    );
    const app = await loadPluginApp(() => import("./app"));
    const fixture = options();
    const slot = renderSlot(app.threadLists[0]!, props, fixture.value);
    await slot.findByText("Design migration");

    const threads = await slot.findByRole("region", {
      name: "Threads group",
    });
    fireEvent.keyDown(
      within(threads).getByRole("button", { name: "Threads options" }),
      { key: "Enter" },
    );
    const groupBy = await slot.findByRole("menuitem", { name: "Group by" });
    groupBy.focus();
    fireEvent.keyDown(groupBy, {
      key: "ArrowRight",
    });
    const sections = await slot.findByRole("menuitemcheckbox", {
      name: "Sections",
    });
    expect(sections.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(sections);

    expect(
      await slot.findByRole("region", { name: "Release group" }),
    ).toBeTruthy();
    slot.lifecycle.unmount();
  });

  it("inlines entity actions after Group by only for actionable groups", async () => {
    window.localStorage.setItem(
      "bb.plugin.ribbon-sidebar.preferences.v1",
      JSON.stringify({
        view: {
          scope: { kind: "all" },
          groupingKey: "builtin:sections",
          filterGroupingKey: "builtin:sections",
        },
        collapsed: [],
      }),
    );
    const app = await loadPluginApp(() => import("./app"));
    const fixture = options();
    const slot = renderSlot(app.threadLists[0]!, props, fixture.value);
    await slot.findByText("Design migration");

    const release = await slot.findByRole("region", { name: "Release group" });
    fireEvent.keyDown(
      within(release).getByRole("button", { name: "Release options" }),
      { key: "Enter" },
    );
    const groupBy = await slot.findByRole("menuitem", { name: "Group by" });
    const rename = slot.getByRole("menuitem", { name: "Rename" });
    const remove = slot.getByRole("menuitem", { name: "Remove" });
    expect(groupBy.nextElementSibling?.getAttribute("role")).toBe("separator");
    expect(groupBy.nextElementSibling?.nextElementSibling).toBe(rename);
    expect(rename.nextElementSibling).toBe(remove);
    fireEvent.keyDown(groupBy, { key: "Escape" });

    const unorganized = slot.getByRole("region", {
      name: "Unorganized group",
    });
    fireEvent.keyDown(
      within(unorganized).getByRole("button", { name: "Unorganized options" }),
      { key: "Enter" },
    );
    expect(await slot.findByRole("menuitem", { name: "Group by" })).toBeTruthy();
    expect(slot.queryByRole("menuitem", { name: "Rename" })).toBeNull();
    expect(slot.queryByRole("separator")).toBeNull();
    slot.lifecycle.unmount();
  });

  it("keeps Group by out of Groups and places New directly after its rows", async () => {
    const app = await loadPluginApp(() => import("./app"));
    const fixture = options();
    const slot = renderSlot(app.threadLists[0]!, props, fixture.value);
    await slot.findByText("Design migration");

    fireEvent.keyDown(slot.getByRole("button", { name: "Groups" }), {
      key: "Enter",
    });
    const sectionRows = slot.getByRole("menuitemradio", { name: /Release/u })
      .parentElement;
    expect(sectionRows?.nextElementSibling).toBe(
      slot.getByRole("menuitem", { name: "New section" }),
    );
    expect(slot.queryByText("Group by")).toBeNull();

    fireEvent.keyDown(slot.getByRole("menuitem", { name: "Projects" }), {
      key: "ArrowRight",
    });
    const projectRows = (await slot.findByRole("menuitemradio", {
      name: /Storefront/u,
    })).parentElement;
    expect(projectRows?.nextElementSibling).toBe(
      slot.getByRole("menuitem", { name: "New project" }),
    );
    expect(slot.queryByText("Group by")).toBeNull();
    slot.lifecycle.unmount();
  });

  it("clears grouping when a filter selects the same dimension", async () => {
    window.localStorage.setItem(
      "bb.plugin.ribbon-sidebar.preferences.v1",
      JSON.stringify({
        view: { scope: { kind: "all" }, groupingKey: "builtin:sections" },
        collapsed: [],
      }),
    );
    const app = await loadPluginApp(() => import("./app"));
    const fixture = options();
    fixture.synchronizeV1.mockResolvedValue({
      groupings: [
        snapshot.groupings[1]!,
        snapshot.groupings[0]!,
        snapshot.groupings[2]!,
      ],
    });
    const slot = renderSlot(app.threadLists[0]!, props, fixture.value);
    await slot.findByText("Design migration");

    fireEvent.keyDown(slot.getByRole("button", { name: "Groups" }), {
      key: "Enter",
    });
    fireEvent.click(slot.getByRole("menuitemradio", { name: /Release/u }));

    await waitFor(() =>
      expect(slot.queryByRole("region", { name: "Release group" })).toBeNull(),
    );
    expect(slot.getByText("Design migration")).toBeTruthy();
    expect(slot.queryByText("Ship UI")).toBeNull();
    expect(
      JSON.parse(
        window.localStorage.getItem(
          "bb.plugin.ribbon-sidebar.preferences.v1",
        ) ?? "null",
      ).view,
    ).toEqual({
      scope: {
        kind: "group",
        group: { groupingKey: "builtin:sections", groupId: "section-a" },
      },
      groupingKey: null,
      filterGroupingKey: "builtin:sections",
    });
    fireEvent.keyDown(
      slot.getByRole("button", { name: "Release, filtered" }),
      { key: "Enter" },
    );
    expect(slot.queryByText("Group by")).toBeNull();
    const newSection = slot.getByRole("menuitem", { name: "New section" });
    expect(newSection.previousElementSibling?.getAttribute("role")).toBe(
      "group",
    );
    slot.lifecycle.unmount();
  });

  it("hides pinned threads outside the active group filter", async () => {
    window.localStorage.setItem(
      "bb.plugin.ribbon-sidebar.preferences.v1",
      JSON.stringify({
        view: {
          scope: {
            kind: "group",
            group: {
              groupingKey: "builtin:sections",
              groupId: "section-a",
            },
          },
          groupingKey: null,
          filterGroupingKey: "builtin:sections",
        },
        collapsed: [],
      }),
    );
    const app = await loadPluginApp(() => import("./app"));
    const fixture = options({
      sidebarThreads: {
        projects: [
          { id: "project-a", name: "Storefront", isPersonal: false },
        ],
        threads: [
          thread({ id: "thread-a", title: "Release thread" }),
          thread({ id: "thread-b", title: "Roadmap pin", isPinned: true }),
        ],
      },
    });
    const slot = renderSlot(app.threadLists[0]!, props, fixture.value);

    expect(await slot.findByText("Release thread")).toBeTruthy();
    expect(slot.queryByText("Roadmap pin")).toBeNull();
    slot.lifecycle.unmount();
  });

  it("puts Chats last in project groups directly before New project", async () => {
    window.localStorage.setItem(
      "bb.plugin.ribbon-sidebar.preferences.v1",
      JSON.stringify({
        view: { scope: { kind: "all" }, groupingKey: "builtin:projects" },
        collapsed: [],
      }),
    );
    const app = await loadPluginApp(() => import("./app"));
    const fixture = options({
      sidebarThreads: {
        projects: [
          { id: "project-personal", name: "Personal", isPersonal: true },
          { id: "project-a", name: "Storefront", isPersonal: false },
        ],
        threads: [
          thread({ id: "thread-a", title: "Store thread" }),
          thread({
            id: "thread-b",
            projectId: "project-personal",
            title: "Personal thread",
          }),
        ],
      },
    });
    fixture.synchronizeV1.mockResolvedValue({
      ...snapshot,
      groupings: snapshot.groupings.map((grouping) =>
        grouping.groupingKey === "builtin:projects"
          ? {
              ...grouping,
              groups: [
                ...grouping.groups,
                {
                  id: "project-personal",
                  label: "Chats",
                  visibleWhenEmpty: true,
                  acceptsAssignments: true,
                  defaultCollapsed: false,
                },
              ],
            }
          : grouping,
      ),
    });
    fixture.listPlacementsV1.mockImplementation(async (raw: unknown) => {
      const { groupingKey } = raw as { groupingKey: string };
      return {
        ok: true as const,
        value: {
          groupingKey,
          revision: 1,
          items: [
            { groupingKey, groupId: "project-a", threadId: "thread-a", enteredAtMs: null },
            { groupingKey, groupId: "project-personal", threadId: "thread-b", enteredAtMs: null },
          ],
        },
      };
    });
    const slot = renderSlot(app.threadLists[0]!, props, fixture.value);
    await slot.findByText("Personal thread");

    const regions = slot.getAllByRole("region").filter((region) =>
      /group$/u.test(region.getAttribute("aria-label") ?? ""),
    );
    expect(regions.map((region) => region.getAttribute("aria-label"))).toEqual([
      "Storefront group",
      "Chats group",
    ]);

    fireEvent.keyDown(
      within(regions[0]!).getByRole("button", { name: "Storefront options" }),
      { key: "Enter" },
    );
    const projectGroupBy = await slot.findByRole("menuitem", {
      name: "Group by",
    });
    expect(slot.getByRole("menuitem", { name: "Project settings" })).toBeTruthy();
    expect(slot.getByRole("menuitem", { name: "Rename" })).toBeTruthy();
    expect(slot.getByRole("menuitem", { name: "Remove" })).toBeTruthy();
    expect(projectGroupBy.nextElementSibling?.getAttribute("role")).toBe(
      "separator",
    );
    fireEvent.keyDown(projectGroupBy, { key: "Escape" });
    await waitFor(() =>
      expect(slot.queryByRole("menuitem", { name: "Group by" })).toBeNull(),
    );

    fireEvent.keyDown(
      within(regions[1]!).getByRole("button", { name: "Chats options" }),
      { key: "Enter" },
    );
    const threadsGroupBy = await slot.findByRole("menuitem", {
      name: "Group by",
    });
    expect(slot.queryByRole("menuitem", { name: "Project settings" })).toBeNull();
    expect(slot.queryByRole("menuitem", { name: "Rename" })).toBeNull();
    expect(slot.queryByRole("separator")).toBeNull();
    fireEvent.keyDown(threadsGroupBy, { key: "Escape" });
    await waitFor(() =>
      expect(slot.queryByRole("menuitem", { name: "Group by" })).toBeNull(),
    );

    fireEvent.keyDown(slot.getByRole("button", { name: "Groups" }), {
      key: "Enter",
    });
    fireEvent.keyDown(slot.getByRole("menuitem", { name: "Projects" }), {
      key: "ArrowRight",
    });
    const chats = await slot.findByRole("menuitemradio", { name: "Chats" });
    const newProject = await slot.findByRole("menuitem", {
      name: "New project",
    });
    expect(chats.parentElement?.lastElementChild).toBe(chats);
    expect(chats.parentElement?.nextElementSibling).toBe(newProject);
    slot.lifecycle.unmount();
  });

  it("filters from Groups and changes grouping from a group header", async () => {
    const app = await loadPluginApp(() => import("./app"));
    const fixture = options();
    const slot = renderSlot(app.threadLists[0]!, props, fixture.value);
    await slot.findByText("Design migration");

    fireEvent.click(slot.getByText("Idle"));
    expect(
      slot.getByRole("button", { name: "Groups" }),
    ).toBeTruthy();
    expect(slot.queryByRole("button", { name: /Group by/u })).toBeNull();

    fireEvent.keyDown(slot.getByRole("button", { name: "Groups" }), {
      key: "Enter",
    });
    expect(await slot.findByRole("menuitemradio", { name: "All groups" }))
      .toBeTruthy();
    expect(
      slot.getByRole("menuitem", { name: "Projects" }).querySelectorAll("svg"),
    ).toHaveLength(2);
    expect(
      slot
        .getByRole("menuitem", { name: "Stages" })
        .querySelector('path[d="M8 5v14l11-7z"]'),
    ).toBeTruthy();
    expect(
      (await slot.findByRole("menuitemradio", { name: "Unorganized" }))
        .querySelector('[data-icon="ListViewOff"]'),
    ).toBeTruthy();
    expect(slot.queryByText("Group by")).toBeNull();
    fireEvent.keyDown(slot.getByRole("menuitemradio", { name: "All groups" }), {
      key: "Escape",
    });

    const idle = slot.getByRole("region", { name: "Idle group" });
    fireEvent.keyDown(within(idle).getByRole("button", { name: "Idle options" }), {
      key: "Enter",
    });
    const groupBy = await slot.findByRole("menuitem", { name: "Group by" });
    groupBy.focus();
    fireEvent.keyDown(groupBy, {
      key: "ArrowRight",
    });
    fireEvent.click(await slot.findByRole("menuitemcheckbox", { name: "Sections" }));

    expect(
      await slot.findByRole("region", { name: "Release group" }),
    ).toBeTruthy();
    expect(slot.getByRole("button", { name: "Groups" })).toBeTruthy();
    slot.lifecycle.unmount();
  });

  it("preserves hidden group management UI", async () => {
    const app = await loadPluginApp(() => import("./app"));
    const fixture = options();
    const slot = renderSlot(app.threadLists[0]!, props, fixture.value);
    await slot.findByText("Design migration");

    const management = slot.getByRole("button", {
      name: "Groups",
    });
    const managementRow = management.parentElement!;
    fireEvent.mouseEnter(managementRow);
    expect(
      slot.getByRole("button", { name: "New section" }),
    ).toBeTruthy();
    expect(
      slot.getByRole("button", { name: "New project" }),
    ).toBeTruthy();
    expect(
      slot.getByRole("button", { name: "Groups options" }),
    ).toBeTruthy();

    fireEvent.keyDown(management, { key: "Enter" });
    expect(
      await slot.findByRole("menuitemradio", {
        name: "All groups",
      }),
    ).toBeTruthy();
    const section = await slot.findByRole("menuitemradio", { name: /Release/u });
    expect(section.querySelector("svg")).toBeTruthy();
    fireEvent.click(section);
    fireEvent.keyDown(
      slot.getByRole("button", { name: "Release, filtered" }),
      { key: "Enter" },
    );
    fireEvent.keyDown(slot.getByRole("menuitem", { name: "Projects" }), {
      key: "ArrowRight",
    });
    const project = await slot.findByRole("menuitemradio", { name: /Storefront/u });
    expect(project.querySelector("svg")).toBeTruthy();
    slot.lifecycle.unmount();
  });

  it("honors Ribbon settings without hiding nonempty orphan groups", async () => {
    const app = await loadPluginApp(() => import("./app"));
    const fixture = options({
      settings: {
        showProjectsAndSections: false,
        showMessagePreviews: false,
        showCollapsedGroupIndicators: true,
        showGroupHeaderIcons: true,
      },
    });
    fixture.value.rpc.listPlacementsV1 = vi.fn(async () => ({
      ok: true as const,
      value: {
        groupingKey: "plugin:thread-stages:stages",
        revision: 1,
        items: [
          {
            groupingKey: "plugin:thread-stages:stages",
            groupId: "Removed",
            threadId: "thread-a",
            enteredAtMs: 1,
            origin: "auto" as const,
          },
        ],
      },
    }));
    const slot = renderSlot(app.threadLists[0]!, props, fixture.value);
    await slot.findByText("Design migration");
    expect(slot.getByText("Removed (unavailable)")).toBeTruthy();
    expect(
      slot.getByRole("button", { name: "Collapse Idle section" }),
    ).toBeTruthy();
    expect(
      slot.queryByRole("button", { name: "Groups" }),
    ).toBeNull();
    expect(slot.queryByRole("button", { name: /Group by/u })).toBeNull();
    expect(slot.queryByText("A useful preview")).toBeNull();
    slot.lifecycle.unmount();
  });

  it("retains Thread stages activity in a collapsed stage", async () => {
    window.localStorage.setItem(
      "bb.plugin.ribbon-sidebar.preferences.v1",
      JSON.stringify({
        view: {
          scope: { kind: "all" },
          groupingKey: "plugin:thread-stages:stages",
        },
        collapsed: ["plugin:thread-stages:stages/Idle"],
      }),
    );
    const app = await loadPluginApp(() => import("./app"));
    const fixture = options({
      sidebarThreads: {
        projects: [
          { id: "project-a", name: "Storefront", isPersonal: false },
        ],
        threads: [
          thread({
            id: "thread-a",
            title: "Design migration",
            indicator: "runtime",
            indicatorLabel: "Thread working",
          }),
          thread({
            id: "thread-child",
            parentThreadId: "thread-a",
            indicator: "waiting-for-input",
            indicatorLabel: "Needs input",
          }),
          thread({ id: "thread-b", title: "Ship UI" }),
        ],
      },
    });
    const slot = renderSlot(app.threadLists[0]!, props, fixture.value);

    expect(await slot.findByLabelText("Needs input")).toBeTruthy();
    expect(slot.queryByLabelText("Thread working")).toBeNull();
    expect(slot.queryByText("Design migration")).toBeNull();
    slot.lifecycle.unmount();
  });

  it("does not roll up Thread stages' ordinary unread indicator", async () => {
    window.localStorage.setItem(
      "bb.plugin.ribbon-sidebar.preferences.v1",
      JSON.stringify({
        view: {
          scope: { kind: "all" },
          groupingKey: "plugin:thread-stages:stages",
        },
        collapsed: ["plugin:thread-stages:stages/Idle"],
      }),
    );
    const app = await loadPluginApp(() => import("./app"));
    const fixture = options({
      sidebarThreads: {
        projects: [
          { id: "project-a", name: "Storefront", isPersonal: false },
        ],
        threads: [
          thread({
            id: "thread-a",
            indicator: "unread-success",
            indicatorLabel: "Unread thread succeeded",
            isUnread: true,
          }),
        ],
      },
    });
    const slot = renderSlot(app.threadLists[0]!, props, fixture.value);

    expect(await slot.findByLabelText("1 thread")).toBeTruthy();
    expect(slot.queryByLabelText("Unread thread succeeded")).toBeNull();
    slot.lifecycle.unmount();
  });

  it("retains chosen section icons in a thread's section menu", async () => {
    const app = await loadPluginApp(() => import("./app"));
    const fixture = options();
    const slot = renderSlot(app.threadLists[0]!, props, fixture.value);
    await slot.findByText("Design migration");

    fireEvent.keyDown(
      slot
        .getByText("Design migration")
        .closest("[data-thread-id]")!
        .querySelector('[aria-label="Thread actions"]')!,
      { key: "Enter" },
    );
    fireEvent.click(await slot.findByText("Move to section"));

    // jsdom paints nothing, so only the name a row writes is readable here.
    expect(
      slot
        .getByText("Release")
        .closest('[role="menuitem"]')
        ?.querySelector('[data-ribbon-icons-section="section-a"]'),
    ).not.toBeNull();
    expect(
      slot
        .getByText("Unorganized")
        .closest('[role="menuitem"]')
        ?.querySelector('[data-icon="ListViewOff"]'),
    ).toBeTruthy();
    slot.lifecycle.unmount();
  });

  it("shows built-in group icons in headers unless the setting hides them", async () => {
    const app = await loadPluginApp(() => import("./app"));
    const fixture = options();
    const slot = renderSlot(app.threadLists[0]!, props, fixture.value);
    await slot.findByText("Design migration");

    const idle = slot.getByRole("region", { name: "Idle group" });
    fireEvent.keyDown(within(idle).getByRole("button", { name: "Idle options" }), {
      key: "Enter",
    });
    fireEvent.keyDown(await slot.findByRole("menuitem", { name: "Group by" }), {
      key: "ArrowRight",
    });
    fireEvent.click(
      await slot.findByRole("menuitemcheckbox", { name: "Sections" }),
    );

    const releaseHeader = (await slot.findByRole("region", {
      name: "Release group",
    })).querySelector('[data-sidebar="group-label"]')!;
    await waitFor(() =>
      expect(
        releaseHeader.querySelector('[data-ribbon-icons-section="section-a"]'),
      ).not.toBeNull(),
    );
    const unorganizedHeader = slot
      .getByRole("region", { name: "Unorganized group" })
      .querySelector('[data-sidebar="group-label"]')!;
    expect(
      unorganizedHeader.querySelector('[data-icon="ListViewOff"]'),
    ).toBeTruthy();
    slot.lifecycle.unmount();

    const hiddenFixture = options({
      settings: {
        showProjectsAndSections: true,
        showMessagePreviews: true,
        showCollapsedGroupIndicators: false,
        showGroupHeaderIcons: false,
      },
    });
    window.localStorage.setItem(
      "bb.plugin.ribbon-sidebar.preferences.v1",
      JSON.stringify({
        view: { scope: { kind: "all" }, groupingKey: "builtin:sections" },
        collapsed: [],
      }),
    );
    const hiddenSlot = renderSlot(
      app.threadLists[0]!,
      props,
      hiddenFixture.value,
    );
    const hiddenHeader = (await hiddenSlot.findByRole("region", {
      name: "Release group",
    })).querySelector('[data-sidebar="group-label"]')!;
    expect(
      hiddenHeader.querySelector('[data-ribbon-icons-section="section-a"]'),
    ).toBeNull();
    hiddenSlot.lifecycle.unmount();
  });

  it("moves a root from the thread's section menu", async () => {
    const app = await loadPluginApp(() => import("./app"));
    const fixture = options();
    const slot = renderSlot(app.threadLists[0]!, props, fixture.value);
    await slot.findByText("Design migration");

    fireEvent.keyDown(
      slot
        .getByText("Design migration")
        .closest("[data-thread-id]")!
        .querySelector('[aria-label="Thread actions"]')!,
      { key: "Enter" },
    );
    fireEvent.click(await slot.findByText("Move to section"));
    fireEvent.click(slot.getByText("Roadmap"));

    await waitFor(() =>
      expect(fixture.updatePlacementV1).toHaveBeenCalledWith({
        groupingKey: "builtin:sections",
        groupId: "section-b",
        threadId: "thread-a",
        anchor: { kind: "preserve" },
        origin: "ui",
      }),
    );
    slot.lifecycle.unmount();
  });

  it("offers every writable grouping from every thread menu", async () => {
    window.localStorage.setItem(
      "bb.plugin.ribbon-sidebar.preferences.v1",
      JSON.stringify({
        view: { scope: { kind: "all" }, groupingKey: "builtin:projects" },
        collapsed: [],
      }),
    );
    const app = await loadPluginApp(() => import("./app"));
    const fixture = options();
    const slot = renderSlot(app.threadLists[0]!, props, fixture.value);
    await slot.findByText("Design migration");

    fireEvent.keyDown(
      slot
        .getByText("Design migration")
        .closest("[data-thread-id]")!
        .querySelector('[aria-label="Thread actions"]')!,
      { key: "Enter" },
    );
    expect(await slot.findByText("Move to section")).toBeTruthy();
    expect(slot.getByText("Move to stage")).toBeTruthy();
    expect(slot.queryByText("Move to project")).toBeNull();
    fireEvent.click(slot.getByText("Move to stage"));
    fireEvent.click(await slot.findByText("Active"));

    await waitFor(() =>
      expect(fixture.updatePlacementV1).toHaveBeenCalledWith({
        groupingKey: "plugin:thread-stages:stages",
        groupId: "Active",
        threadId: "thread-a",
        anchor: { kind: "preserve" },
        origin: "ui",
      }),
    );
    slot.lifecycle.unmount();
  });

  it("keeps project and section creation plus scoped entity actions", async () => {
    const app = await loadPluginApp(() => import("./app"));
    const fixture = options();
    const slot = renderSlot(app.threadLists[0]!, props, fixture.value);
    await slot.findByText("Design migration");

    const management = slot.getByRole("button", {
      name: "Groups",
    });
    fireEvent.click(slot.getByRole("button", { name: "New project" }));
    await waitFor(() => expect(fixture.createProjectV1).toHaveBeenCalled());

    fireEvent.click(slot.getByRole("button", { name: "New section" }));
    expect(await slot.findByText("Create a section for threads.")).toBeTruthy();
    const createName = await slot.findByRole("textbox", {
      name: "Section name",
    });
    expect(document.activeElement).toBe(createName);
    fireEvent.change(createName, { target: { value: "Roadmap" } });
    fireEvent.click(slot.getByRole("button", { name: "Create section" }));
    await waitFor(() =>
      expect(fixture.createSectionV1).toHaveBeenCalledWith({ name: "Roadmap" }),
    );

    fireEvent.keyDown(management, { key: "Enter" });
    fireEvent.contextMenu(
      await slot.findByRole("menuitemradio", { name: /Release/u }),
    );
    fireEvent.click(await slot.findByText("Rename"));
    const renameName = await slot.findByRole("textbox", { name: "New name" });
    fireEvent.change(renameName, { target: { value: "Roadmap" } });
    fireEvent.click(slot.getByRole("button", { name: "Rename" }));
    await waitFor(() =>
      expect(fixture.renameEntityV1).toHaveBeenCalledWith({
        groupingKey: "builtin:sections",
        id: "section-a",
        name: "Roadmap",
      }),
    );

    fireEvent.keyDown(management, { key: "Enter" });
    fireEvent.contextMenu(
      await slot.findByRole("menuitemradio", { name: /Release/u }),
    );
    fireEvent.click(await slot.findByText("Remove"));
    expect(await slot.findByText("Delete Release?")).toBeTruthy();
    fireEvent.click(slot.getByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(fixture.deleteEntityV1).toHaveBeenCalledWith({
        groupingKey: "builtin:sections",
        id: "section-a",
      }),
    );
    slot.lifecycle.unmount();
  });

  it("retains project settings and local-path actions for a scoped project", async () => {
    const app = await loadPluginApp(() => import("./app"));
    const fixture = options();
    const slot = renderSlot(app.threadLists[0]!, props, fixture.value);
    await slot.findByText("Design migration");

    const management = slot.getByRole("button", {
      name: "Groups",
    });
    fireEvent.keyDown(management, { key: "Enter" });
    fireEvent.keyDown(slot.getByRole("menuitem", { name: "Projects" }), {
      key: "ArrowRight",
    });
    fireEvent.contextMenu(
      await slot.findByRole("menuitemradio", { name: /Storefront/u }),
    );
    expect(await slot.findByText("Project settings")).toBeTruthy();
    fireEvent.click(slot.getByText("Add local path"));
    await waitFor(() =>
      expect(fixture.addProjectLocalPathV1).toHaveBeenCalledWith({
        projectId: "project-a",
      }),
    );
    slot.lifecycle.unmount();
  });

  it("keeps a cached unavailable provider selected for recovery", async () => {
    window.localStorage.setItem(
      "bb.plugin.ribbon-sidebar.preferences.v1",
      JSON.stringify({
        view: {
          scope: { kind: "all" },
          groupingKey: "plugin:thread-stages:stages",
        },
        collapsed: [],
      }),
    );
    const app = await loadPluginApp(() => import("./app"));
    const fixture = options();
    const unavailable = {
      ...snapshot,
      groupings: snapshot.groupings.map((grouping) =>
        grouping.groupingKey === "plugin:thread-stages:stages"
          ? { ...grouping, available: false }
          : grouping,
      ),
    };
    fixture.value.rpc.synchronizeV1 = vi.fn(async () => unavailable);
    const slot = renderSlot(app.threadLists[0]!, props, fixture.value);

    expect(
      await slot.findByRole("region", { name: "Idle group" }),
    ).toBeTruthy();
    expect(fixture.listPlacementsV1).toHaveBeenCalledWith(
      expect.objectContaining({
        groupingKey: "plugin:thread-stages:stages",
      }),
    );
    slot.lifecycle.unmount();
  });

  it("keeps an orphaned scoped group recoverable instead of falling back", async () => {
    window.localStorage.setItem(
      "bb.plugin.ribbon-sidebar.preferences.v1",
      JSON.stringify({
        view: {
          scope: {
            kind: "group",
            group: {
              groupingKey: "plugin:thread-stages:stages",
              groupId: "Removed",
            },
          },
          groupingKey: "plugin:thread-stages:stages",
        },
        collapsed: [],
      }),
    );
    const app = await loadPluginApp(() => import("./app"));
    const fixture = options();
    fixture.value.rpc.listPlacementsV1 = vi.fn(async (raw: unknown) => {
      const input = raw as { groupingKey: string; groupIds?: string[] };
      if (input.groupIds !== undefined) {
        return {
          ok: false as const,
          error: {
            code: "GROUP_NOT_FOUND" as const,
            message: "Group not found",
          },
        };
      }
      return {
        ok: true as const,
        value: {
          groupingKey: input.groupingKey,
          revision: 1,
          items: [
            {
              groupingKey: input.groupingKey,
              groupId: "Removed",
              threadId: "thread-a",
              enteredAtMs: 1,
              origin: "auto" as const,
            },
          ],
        },
      };
    }) as never;
    const slot = renderSlot(app.threadLists[0]!, props, fixture.value);

    expect(
      await slot.findByRole("button", {
        name: "Removed (unavailable), filtered",
      }),
    ).toBeTruthy();
    expect(await slot.findByText("Design migration")).toBeTruthy();
    expect(slot.queryByText("BB original list")).toBeNull();
    expect(fixture.value.rpc.listPlacementsV1).toHaveBeenCalledWith({
      groupingKey: "plugin:thread-stages:stages",
    });
    slot.lifecycle.unmount();
  });

  it("uses released invisible group drop targets without move placeholders or handles", async () => {
    const app = await loadPluginApp(() => import("./app"));
    const fixture = options();
    const slot = renderSlot(app.threadLists[0]!, props, fixture.value);
    await slot.findByText("Design migration");

    fireEvent.click(
      slot.getByRole("button", { name: "Collapse Idle section" }),
    );
    expect(slot.queryByText("Design migration")).toBeNull();
    fireEvent.click(
      slot.getByRole("button", { name: "Expand Idle section" }),
    );
    expect(slot.getByText("Design migration")).toBeTruthy();

    const dataTransfer = { setData: vi.fn(), getData: vi.fn() };
    fireEvent.dragStart(
      slot.getByText("Ship UI").closest("[data-thread-id]")!,
      { dataTransfer },
    );
    expect(
      slot.queryByRole("button", { name: "Move Ship UI" }),
    ).toBeNull();
    expect(
      slot.queryByRole("button", { name: "Move to end of Idle" }),
    ).toBeNull();
    const idleGroup = slot.getByRole("region", { name: "Idle group" });
    fireEvent.dragOver(idleGroup, { dataTransfer });
    fireEvent.drop(idleGroup, { dataTransfer });
    expect(fixture.updatePlacementV1).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: "thread-b",
        groupId: "Idle",
        anchor: { kind: "end" },
        origin: "ui",
      }),
    );
    slot.lifecycle.unmount();
  });

  it("allows order within Projects but rejects cross-project drag targets", async () => {
    window.localStorage.setItem(
      "bb.plugin.ribbon-sidebar.preferences.v1",
      JSON.stringify({
        view: { scope: { kind: "all" }, groupingKey: "builtin:projects" },
        collapsed: [],
      }),
    );
    const app = await loadPluginApp(() => import("./app"));
    const fixture = options({
      sidebarThreads: {
        projects: [
          { id: "project-a", name: "Storefront", isPersonal: false },
          { id: "project-b", name: "Back office", isPersonal: false },
        ],
        threads: [
          thread({ id: "thread-a", title: "Project A first" }),
          thread({ id: "thread-c", title: "Project A second" }),
          thread({ id: "thread-b", projectId: "project-b", title: "Project B" }),
        ],
      },
    });
    fixture.synchronizeV1.mockResolvedValue({
      ...snapshot,
      groupings: snapshot.groupings.map((grouping) =>
        grouping.groupingKey === "builtin:projects"
          ? {
              ...grouping,
              groups: [
                ...grouping.groups,
                {
                  id: "project-b",
                  label: "Back office",
                  visibleWhenEmpty: true,
                  acceptsAssignments: true,
                  defaultCollapsed: false,
                },
              ],
            }
          : grouping,
      ),
    });
    fixture.listPlacementsV1.mockImplementation(async (raw: unknown) => {
      const { groupingKey } = raw as { groupingKey: string };
      return {
        ok: true as const,
        value: {
          groupingKey,
          revision: 1,
          items: [
            { groupingKey, groupId: "project-a", threadId: "thread-a", enteredAtMs: null },
            { groupingKey, groupId: "project-a", threadId: "thread-c", enteredAtMs: null },
            { groupingKey, groupId: "project-b", threadId: "thread-b", enteredAtMs: null },
          ],
        },
      };
    });
    const slot = renderSlot(app.threadLists[0]!, props, fixture.value);
    await slot.findByText("Project A first");

    const source = slot.getByText("Project A first").closest("[data-thread-id]")!;
    const sameProject = slot.getByText("Project A second").closest("[data-thread-id]")!;
    const otherProject = slot.getByText("Project B").closest("[data-thread-id]")!;
    const dataTransfer = { setData: vi.fn(), effectAllowed: "none" };
    fireEvent.dragStart(source, { dataTransfer });
    fireEvent.dragOver(sameProject, { clientY: 0, dataTransfer });
    expect(slot.container.querySelector("[data-sidebar-drop-indicator]")).toBeTruthy();

    fireEvent.dragOver(otherProject, { clientY: 0, dataTransfer });
    expect(slot.container.querySelector("[data-sidebar-drop-indicator]")).toBeNull();
    fireEvent.drop(otherProject, { clientY: 0, dataTransfer });
    expect(fixture.updatePlacementV1).not.toHaveBeenCalled();
    slot.lifecycle.unmount();
  });

  it("allows cross-group drops when the grouping membership is writable", async () => {
    window.localStorage.setItem(
      "bb.plugin.ribbon-sidebar.preferences.v1",
      JSON.stringify({
        view: { scope: { kind: "all" }, groupingKey: "builtin:sections" },
        collapsed: [],
      }),
    );
    const app = await loadPluginApp(() => import("./app"));
    const fixture = options();
    const slot = renderSlot(app.threadLists[0]!, props, fixture.value);
    await slot.findByText("Design migration");

    const source = slot
      .getByText("Design migration")
      .closest("[data-thread-id]")!;
    const target = slot.getByRole("region", { name: "Roadmap group" });
    const dataTransfer = { setData: vi.fn(), effectAllowed: "none" };
    fireEvent.dragStart(source, { dataTransfer });
    fireEvent.dragOver(target, { dataTransfer });
    fireEvent.drop(target, { dataTransfer });

    expect(fixture.updatePlacementV1).toHaveBeenCalledWith(
      expect.objectContaining({
        groupingKey: "builtin:sections",
        groupId: "section-b",
        threadId: "thread-a",
        anchor: { kind: "end" },
        origin: "ui",
      }),
    );
    slot.lifecycle.unmount();
  });

  it("keeps pinned reorder bb-owned and exposes drag feedback", async () => {
    const app = await loadPluginApp(() => import("./app"));
    const fixture = options({
      sidebarThreads: {
        projects: [
          { id: "project-a", name: "Storefront", isPersonal: false },
        ],
        threads: [
          thread({ id: "thread-pin-a", title: "Pinned A", isPinned: true }),
          thread({ id: "thread-pin-b", title: "Pinned B", isPinned: true }),
          thread({ id: "thread-a", title: "Design migration" }),
          thread({ id: "thread-b", title: "Ship UI" }),
        ],
      },
    });
    const slot = renderSlot(app.threadLists[0]!, props, fixture.value);
    await slot.findByText("Pinned A");

    const source = slot.getByText("Pinned A").closest("[data-thread-id]")!;
    const target = slot.getByText("Pinned B").closest("[data-thread-id]")!;
    const dataTransfer = { setData: vi.fn(), effectAllowed: "none" };
    fireEvent.dragStart(source, { dataTransfer });
    expect(dataTransfer.effectAllowed).toBe("move");
    expect(source.querySelector("[aria-grabbed='true']")).toBeTruthy();
    fireEvent.dragOver(target, { clientY: 0, dataTransfer });
    fireEvent.drop(target, { clientY: 0, dataTransfer });
    await waitFor(() =>
      expect(fixture.reorderPinnedV1).toHaveBeenCalledWith({
        threadId: "thread-pin-a",
        previousThreadId: null,
        nextThreadId: "thread-pin-b",
      }),
    );
    expect(fixture.updatePlacementV1).not.toHaveBeenCalledWith(
      expect.objectContaining({ threadId: "thread-pin-a" }),
    );
    slot.lifecycle.unmount();
  });

  it("renders search progress, failure, retry, and empty-result states", async () => {
    const app = await loadPluginApp(() => import("./app"));
    const fixture = options();
    let rejectSearch: ((error: Error) => void) | undefined;
    fixture.value.rpc.searchThreadIdsV1 = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            rejectSearch = reject;
          }),
      )
      .mockResolvedValue({ threadIds: [], threads: [] });
    const slot = renderSlot(
      app.threadLists[0]!,
      { ...props, searchQuery: "missing" },
      fixture.value,
    );

    expect(await slot.findByText("Searching threads…")).toBeTruthy();
    rejectSearch?.(new Error("offline"));
    expect(await slot.findByText("Search failed.")).toBeTruthy();
    fireEvent.click(slot.getByRole("button", { name: "Retry" }));
    expect(await slot.findByText("No matching threads")).toBeTruthy();
    expect(slot.queryByRole("region", { name: "Idle group" })).toBeNull();
    slot.lifecycle.unmount();
  });

  it("normalizes a same-key saved scope to a flat list", async () => {
    window.localStorage.setItem(
      "bb.plugin.ribbon-sidebar.preferences.v1",
      JSON.stringify({
        view: {
          scope: {
            kind: "group",
            group: {
              groupingKey: "plugin:thread-stages:stages",
              groupId: "Idle",
            },
          },
          groupingKey: "plugin:thread-stages:stages",
        },
        collapsed: [],
      }),
    );
    const app = await loadPluginApp(() => import("./app"));
    const fixture = options();
    const slot = renderSlot(app.threadLists[0]!, props, fixture.value);
    await slot.findByText("Design migration");

    expect(slot.queryByRole("button", { name: "Collapse Idle section" }))
      .toBeNull();
    expect(slot.queryByTestId("scope-end-drop-target")).toBeNull();
    for (const item of Array.from(slot.container.querySelectorAll("li"))) {
      expect(item.closest("ul")).toBeTruthy();
    }
    fireEvent.keyDown(
      slot.getByRole("button", { name: "Idle, filtered" }),
      { key: "Enter" },
    );
    fireEvent.click(await slot.findByRole("menuitemradio", { name: "All groups" }));
    expect(slot.queryByRole("button", { name: "Collapse Idle section" }))
      .toBeNull();
    slot.lifecycle.unmount();
  });

  it("ignores self-drops and retries one revision conflict", async () => {
    const app = await loadPluginApp(() => import("./app"));
    const fixture = options();
    fixture.updatePlacementV1.mockResolvedValueOnce({
      ok: false as const,
      error: {
        code: "REVISION_CONFLICT" as const,
        message: "Grouping revision changed.",
        revision: 2,
      },
    } as never);
    const slot = renderSlot(app.threadLists[0]!, props, fixture.value);
    await slot.findByText("Ship UI");

    const row = slot.getByText("Ship UI").closest("[data-thread-id]")!;
    const dataTransfer = { setData: vi.fn(), getData: vi.fn() };
    fireEvent.dragStart(row, { dataTransfer });
    fireEvent.drop(row, { dataTransfer });
    expect(fixture.updatePlacementV1).not.toHaveBeenCalled();

    fireEvent.dragStart(row, { dataTransfer });
    const activeGroup = slot.getByRole("region", { name: "Active group" });
    fireEvent.dragOver(activeGroup, { dataTransfer });
    fireEvent.drop(activeGroup, { dataTransfer });
    await waitFor(() => expect(fixture.updatePlacementV1).toHaveBeenCalledTimes(2));
    expect(fixture.updatePlacementV1.mock.calls[1]?.[0]).toMatchObject({
      expectedRevision: 2,
    });
    expect(slot.queryByText("Grouping revision changed.")).toBeNull();
    slot.lifecycle.unmount();
  });

  it("marks the rendered sidebar ready after placements and previews load", async () => {
    const app = await loadPluginApp(() => import("./app"));
    const fixture = options();
    const slot = renderSlot(app.threadLists[0]!, props, fixture.value);

    await slot.findByText("Design migration");
    await waitFor(() =>
      expect(
        slot.container.querySelector(
          "[data-ribbon-sidebar-root][data-ribbon-sidebar-ready]",
        ),
      ).toBeTruthy(),
    );
    slot.lifecycle.unmount();
  });

  it("delegates to bb's original list when mounting fails", async () => {
    const app = await loadPluginApp(() => import("./app"));
    const fixture = options({
      rpc: {
        synchronizeV1: async () => {
          throw new Error("Ribbon backend unavailable");
        },
      },
    });
    const slot = renderSlot(app.threadLists[0]!, props, fixture.value);
    expect(await slot.findByText("BB original list")).toBeTruthy();
    slot.lifecycle.unmount();
  });

  it("retries a failed initial synchronization after realtime reconnects", async () => {
    const app = await loadPluginApp(() => import("./app"));
    const fixture = options();
    fixture.value.rpc.synchronizeV1 = vi
      .fn()
      .mockRejectedValueOnce(new Error("provider is still starting"))
      .mockResolvedValue(snapshot);
    const slot = renderSlot(app.threadLists[0]!, props, {
      ...fixture.value,
      realtimeConnectionState: "connected",
    });

    expect(await slot.findByText("BB original list")).toBeTruthy();
    await slot.behavior.setRealtimeConnectionState("reconnecting");
    await slot.behavior.setRealtimeConnectionState("connected");
    expect(await slot.findByText("Design migration")).toBeTruthy();
    expect(fixture.value.rpc.synchronizeV1).toHaveBeenCalledTimes(2);
    slot.lifecycle.unmount();
  });

  it("refreshes the mounted catalog when the server publishes an invalidation", async () => {
    const app = await loadPluginApp(() => import("./app"));
    const fixture = options();
    const refreshed = {
      ...snapshot,
      groupings: snapshot.groupings.map((grouping) =>
        grouping.groupingKey === "plugin:thread-stages:stages"
          ? { ...grouping, pluralLabel: "Workflow stages" }
          : grouping,
      ),
    };
    fixture.value.rpc.synchronizeV1 = vi
      .fn()
      .mockResolvedValueOnce(snapshot)
      .mockResolvedValue(refreshed);
    const slot = renderSlot(app.threadLists[0]!, props, fixture.value);
    await slot.findByText("Design migration");

    await slot.behavior.emitRealtime("catalog-changed", null);
    fireEvent.keyDown(slot.getByRole("button", { name: "Groups" }), {
      key: "Enter",
    });
    expect(
      await slot.findByRole("menuitem", { name: "Workflow stages" }),
    ).toBeTruthy();
    slot.lifecycle.unmount();
  });
});
