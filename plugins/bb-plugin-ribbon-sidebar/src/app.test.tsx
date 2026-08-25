// @vitest-environment jsdom
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { cleanup, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

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

const snapshot = {
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
          label: "No section",
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
      defaultGroupId: "Idle",
      available: true,
      membershipWritable: true,
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
                ? "section-a"
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
  const createProjectV1 = vi.fn(async () => ({ id: "project-new" }));
  const createSectionV1 = vi.fn(async () => ({ id: "section-new" }));
  const renameEntityV1 = vi.fn(async () => null);
  const deleteEntityV1 = vi.fn(async () => null);
  return {
    synchronizeV1,
    listPlacementsV1,
    updatePlacementV1,
    createProjectV1,
    createSectionV1,
    renameEntityV1,
    deleteEntityV1,
    value: {
      settings: {
        showProjectsAndSections: true,
        showMessagePreviews: true,
        showCollapsedGroupIndicators: false,
      },
      rpc: {
        synchronizeV1,
        listPlacementsV1,
        listPreviewsV1: vi.fn(async (_input: unknown) => ({
          previews: [
            { threadId: "thread-a", preview: "A useful preview" },
          ],
        })),
        listEntityIconsV1: vi.fn(async () => ({
          icons: [
            {
              kind: "section" as const,
              id: "section-a",
              icon: "custom-section",
              color: "red",
              glyph: [["path", { d: "M1 1h14v14H1z" }]],
            },
          ],
          defaults: {
            project: [],
            personal: [],
            section: [],
          },
        })),
        searchThreadIdsV1: vi.fn(async (raw: unknown) => ({
          threadIds: (raw as { query: string }).query
            .toLocaleLowerCase()
            .includes("migration")
            ? ["thread-a"]
            : [],
        })),
        updatePlacementV1,
        createProjectV1,
        createSectionV1,
        renameEntityV1,
        deleteEntityV1,
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
          .getByRole("button", { name: "Stage: Active" })
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

  it("uses bb's thread search results instead of title-only matching", async () => {
    const app = await loadPluginApp(() => import("./app"));
    const fixture = options();
    fixture.value.rpc.searchThreadIdsV1 = vi.fn(async (_raw: unknown) => ({
      threadIds: ["thread-b"],
    }));
    const slot = renderSlot(
      app.threadLists[0]!,
      { ...props, searchQuery: "message body keyword" },
      fixture.value,
    );

    expect(await slot.findByText("Ship UI")).toBeTruthy();
    expect(slot.queryByText("Design migration")).toBeNull();
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

    expect(await slot.findByText("Roadmap scope")).toBeTruthy();
    expect(await slot.findByText("Ship UI")).toBeTruthy();
    expect(await slot.findByText("Opened child")).toBeTruthy();

    fireEvent.keyDown(
      slot.getByRole("button", { name: "Projects and sections" }),
      { key: "Enter" },
    );
    fireEvent.click(await slot.findByText("Release"));
    expect(await slot.findByText("Release scope")).toBeTruthy();
    expect(await slot.findByText("Design migration")).toBeTruthy();
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
      slot.getByRole("button", { name: "Stage: Idle" }).getAttribute(
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
      slot.getByRole("button", { name: "Stage: Active" }).getAttribute(
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
    const renderedRoots = Array.from(idleGroup.children)
      .map((child) =>
        child.querySelector<HTMLElement>("[data-thread-id]")?.dataset.threadId,
      )
      .filter((threadId): threadId is string => threadId !== undefined);
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

  it("offers independent Projects-and-sections scope and grouping choices", async () => {
    const app = await loadPluginApp(() => import("./app"));
    const fixture = options();
    const slot = renderSlot(app.threadLists[0]!, props, fixture.value);
    await slot.findByText("Design migration");

    fireEvent.keyDown(
      slot.getByRole("button", { name: "Projects and sections" }),
      { key: "Enter" },
    );
    expect(await slot.findByText("All projects and sections")).toBeTruthy();
    expect(slot.getByText("New project…")).toBeTruthy();
    expect(slot.getByText("New section…")).toBeTruthy();
    fireEvent.click(slot.getByText("Release"));
    expect(await slot.findByText("Release scope")).toBeTruthy();

    fireEvent.keyDown(slot.getByRole("button", { name: /Group by/u }), {
      key: "Enter",
    });
    fireEvent.click(await slot.findByText("Sections", { selector: "[role=menuitem]" }));
    expect(slot.queryByText("Section: Release")).toBeNull();
    expect(
      slot.queryByRole("region", { name: "No section group" }),
    ).toBeNull();
    expect(slot.getByTestId("scope-end-drop-target")).toBeTruthy();
    slot.lifecycle.unmount();
  });

  it("honors Ribbon settings without hiding nonempty orphan groups", async () => {
    const app = await loadPluginApp(() => import("./app"));
    const fixture = options({
      settings: {
        showProjectsAndSections: false,
        showMessagePreviews: false,
        showCollapsedGroupIndicators: true,
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
    expect(slot.getByText("Stage: Removed (unavailable)")).toBeTruthy();
    expect(slot.getByRole("button", { name: "Stage: Idle" })).toBeTruthy();
    expect(
      slot.queryByRole("button", { name: "Projects and sections" }),
    ).toBeNull();
    expect(slot.getByRole("button", { name: /Group by/u })).toBeTruthy();
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
      slot.getByRole("button", {
        name: "Thread actions for Design migration",
      }),
      { key: "Enter" },
    );
    fireEvent.click(await slot.findByText("Move to section"));

    const sectionIcon = slot
      .getByText("Release")
      .closest('[role="menuitem"]')
      ?.querySelector("svg");
    expect(sectionIcon).not.toBeNull();
    expect(getComputedStyle(sectionIcon!).color).not.toBe("");
    slot.lifecycle.unmount();
  });

  it("moves a root from the thread's section menu", async () => {
    const app = await loadPluginApp(() => import("./app"));
    const fixture = options();
    const slot = renderSlot(app.threadLists[0]!, props, fixture.value);
    await slot.findByText("Design migration");

    fireEvent.keyDown(
      slot.getByRole("button", {
        name: "Thread actions for Design migration",
      }),
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

  it("keeps project and section creation plus scoped entity actions", async () => {
    const app = await loadPluginApp(() => import("./app"));
    const fixture = options();
    const slot = renderSlot(app.threadLists[0]!, props, fixture.value);
    await slot.findByText("Design migration");

    const management = slot.getByRole("button", {
      name: "Projects and sections",
    });
    fireEvent.keyDown(management, { key: "Enter" });
    fireEvent.click(await slot.findByText("New project…"));
    await waitFor(() => expect(fixture.createProjectV1).toHaveBeenCalled());

    fireEvent.keyDown(management, { key: "Enter" });
    fireEvent.click(await slot.findByText("New section…"));
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
    fireEvent.click(await slot.findByText("Release"));
    const actions = await slot.findByRole("button", { name: "Scope actions" });
    fireEvent.keyDown(actions, { key: "Enter" });
    fireEvent.click(await slot.findByText("Rename…"));
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

    fireEvent.keyDown(actions, { key: "Enter" });
    fireEvent.click(await slot.findByText("Delete…"));
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
      await slot.findByRole("button", { name: "Group by Stages" }),
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

    expect(await slot.findByText("Removed (unavailable) scope")).toBeTruthy();
    expect(await slot.findByText("Design migration")).toBeTruthy();
    expect(slot.queryByText("BB original list")).toBeNull();
    expect(fixture.value.rpc.listPlacementsV1).toHaveBeenCalledWith({
      groupingKey: "plugin:thread-stages:stages",
    });
    slot.lifecycle.unmount();
  });

  it("supports pointer collapse and drag placement with rendered targets", async () => {
    const app = await loadPluginApp(() => import("./app"));
    const fixture = options();
    const slot = renderSlot(app.threadLists[0]!, props, fixture.value);
    await slot.findByText("Design migration");

    const idle = slot.getByRole("button", { name: "Stage: Idle" });
    fireEvent.click(idle);
    expect(slot.queryByText("Design migration")).toBeNull();
    fireEvent.click(idle);
    expect(slot.getByText("Design migration")).toBeTruthy();

    const dataTransfer = { setData: vi.fn(), getData: vi.fn() };
    fireEvent.dragStart(
      slot.getByText("Ship UI").closest("[data-thread-id]")!,
      { dataTransfer },
    );
    fireEvent.drop(
      slot.getByRole("button", { name: "Move to end of Idle" }),
      { dataTransfer },
    );
    expect(fixture.updatePlacementV1).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: "thread-b",
        groupId: "Idle",
        anchor: { kind: "end" },
        origin: "ui",
      }),
    );

    fixture.updatePlacementV1.mockClear();
    fireEvent.click(slot.getByRole("button", { name: "Move Ship UI" }));
    fireEvent.click(
      slot.getByRole("button", { name: "Move Ship UI before Design migration" }),
    );
    expect(fixture.updatePlacementV1).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: "thread-b",
        groupId: "Idle",
        anchor: { kind: "before", threadId: "thread-a" },
        origin: "ui",
      }),
    );

    fixture.updatePlacementV1.mockClear();
    fireEvent.click(slot.getByRole("button", { name: "Move Ship UI" }));
    fireEvent.keyDown(
      slot.container.querySelector("[data-ribbon-sidebar-root]")!,
      { key: "Escape" },
    );
    expect(
      slot.queryByRole("button", {
        name: "Move Ship UI before Design migration",
      }),
    ).toBeNull();

    fireEvent.click(slot.getByRole("button", { name: "Move Ship UI" }));
    fireEvent.click(
      slot.getByRole("button", { name: "Move to end of Idle" }),
    );
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

  it("ignores self-drops and keeps recoverable placement errors visible", async () => {
    const app = await loadPluginApp(() => import("./app"));
    const fixture = options();
    fixture.updatePlacementV1.mockResolvedValue({
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

    fireEvent.click(slot.getByRole("button", { name: "Move Ship UI" }));
    fireEvent.click(slot.getByRole("button", { name: "Move to end of Idle" }));
    expect(await slot.findByText("Grouping revision changed.")).toBeTruthy();
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
    expect(
      await slot.findByRole("button", { name: "Group by Workflow stages" }),
    ).toBeTruthy();
    slot.lifecycle.unmount();
  });
});
