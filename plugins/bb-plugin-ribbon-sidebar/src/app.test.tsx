// @vitest-environment jsdom
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { act, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { IconDataV1 } from "./contracts";
import type { GroupingKey } from "./placement-store";
import { SIDEBAR_PREFERENCES_KEY } from "./view-state";

afterEach(async () => {
  cleanup();
  // dnd-kit briefly captures the click after a drag, even when the row unmounts.
  const probe = document.createElement("button");
  document.body.append(probe);
  const clicked = vi.fn();
  probe.addEventListener("click", clicked);
  await waitFor(() => {
    fireEvent.click(probe);
    expect(clicked).toHaveBeenCalled();
  });
  vi.restoreAllMocks();
  document.body.innerHTML = "";
  window.localStorage.clear();
});

// jsdom has no layout; give the real dnd-kit sensors row and group rectangles.
async function beginThreadDrag(source: Element) {
  const groups = Array.from(
    document.querySelectorAll("[data-ribbon-sidebar-root] section"),
  );
  const rectFor = (node: Element): DOMRect => {
    if (node.matches("[data-ribbon-thread-drop-preview]")) {
      const next = node.closest("li")?.nextElementSibling;
      const previous = node.closest("li")?.previousElementSibling;
      const adjacent = next ?? previous;
      if (adjacent) {
        const rect = rectFor(adjacent);
        const top = next ? rect.top : rect.bottom;
        return { ...rect, y: top, top, bottom: top + 50, height: 50 };
      }
    }
    const group = node.closest("section");
    const groupIndex = groups.indexOf(group!);
    const row = node.closest("li[data-thread-id]");
    const rows = group
      ? Array.from(group.querySelectorAll("li[data-thread-id]"))
      : [];
    const y = groupIndex * 500 + (row ? 40 + rows.indexOf(row) * 50 : 0);
    const height = row
      ? 50
      : node.matches('[data-sidebar="group-label"]')
        ? 30
        : 400;
    return {
      x: 0,
      y,
      top: y,
      left: 0,
      width: 250,
      height,
      right: 250,
      bottom: y + height,
      toJSON() {},
    };
  };
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      return rectFor(this);
    },
  );
  const anchor = source.querySelector("a")!;
  const box = rectFor(anchor);
  fireEvent.mouseDown(anchor, { button: 0, clientX: 50, clientY: box.y + 25 });
  fireEvent.mouseMove(document, { clientX: 56, clientY: box.y + 25 });
  await waitFor(() =>
    expect(
      document.querySelector("[data-ribbon-thread-drag-overlay]"),
    ).toBeTruthy(),
  );
  return {
    hover(target: Element) {
      const targetBox = rectFor(target);
      fireEvent.mouseMove(document, {
        clientX: 60,
        clientY: targetBox.y + (target.matches("section") ? 390 : 5),
      });
    },
    hoverBelow(target: Element) {
      const targetBox = rectFor(target);
      fireEvent.mouseMove(document, {
        clientX: 60,
        clientY: targetBox.bottom + 20,
      });
    },
    hoverJustBelow(target: Element) {
      const targetBox = rectFor(target);
      fireEvent.mouseMove(document, {
        clientX: 60,
        clientY: targetBox.bottom + 2,
      });
    },
    drop() {
      fireEvent.mouseUp(document);
    },
    cancel() {
      fireEvent.keyDown(document, { key: "Escape", code: "Escape" });
    },
  };
}

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
interface ListedThread {
  id: string;
  projectId: string;
  title: string | null;
  titleFallback: string | null;
  parentThreadId: string | null;
  sectionId: string | null;
  originKind: "fork" | null;
  originPluginId: string | null;
  providerId: string;
  visibility: "visible" | "hidden";
  isPinned: boolean;
  isArchived: boolean;
  createdAt: number;
  updatedAt: number;
  lastReadAt: number | null;
  latestAttentionAt: number;
}
const thread = (value: Partial<Record<string, unknown>> & { id: string }) => {
  const { id, ...overrides } = value;
  return {
    id,
    projectId: "project-a",
    title: value.id,
    titleFallback: null,
    displayTitle: String(value.title ?? id),
    lifecycleOwnerThreadId: null,
    sourceThreadId: null,
    status: "idle" as const,
    runtimeStatus: "idle" as const,
    queuedWork: "none" as const,
    pinnedAt: null,
    pinSortKey: null,
    archivedAt: null,
    href: `/projects/project-a/threads/${id}`,
    isHidden: false,
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
      defaultPlacement?: "start" | "end";
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
        children: [{ tag: "path", attrs: { d: "M8 5v14l11-7z" } }],
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
            children: [{ tag: "circle", attrs: { cx: 12, cy: 12, r: 8 } }],
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
            children: [{ tag: "path", attrs: { d: "M8 5v14l11-7z" } }],
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
  const listThreadsV1 = vi.fn(
    async (): Promise<{ threads: ListedThread[] }> => ({ threads: [] }),
  );
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
    listThreadsV1,
    updateSettingsV1,
    value: {
      settings: {
        showProjectsAndSections: true,
        showMessagePreviews: true,
        threadAdornmentAlignment: "Title row",
        showCollapsedGroupIndicators: false,
        showGroupHeaderIcons: true,
      },
      rpc: {
        synchronizeV1,
        listPlacementsV1,
        listPreviewsV1: vi.fn(async (_input: unknown) => ({
          previews: [{ threadId: "thread-a", preview: "A useful preview" }],
        })),
        listProjectActionStatesV1,
        listThreadsV1,
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
          {
            id: "project-a",
            name: "Storefront",
            isPersonal: false,
            href: "/projects/project-a",
            settingsHref: "/projects/project-a/settings",
          },
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

function useManualSort(groupingKey = "plugin:thread-stages:stages") {
  window.localStorage.setItem(
    "bb.plugin.ribbon-sidebar.preferences.v1",
    JSON.stringify({
      view: {
        scope: { kind: "all" },
        groupingKey,
        filterGroupingKey: "builtin:sections",
        hide: {
          notArchived: false,
          archived: true,
          visible: false,
          hidden: true,
        },
        sort: "manual",
      },
      collapsed: [],
    }),
  );
}

describe("Ribbon sidebar app", () => {
  it("keeps the latest section order when an older placement read finishes last", async () => {
    const app = await loadPluginApp(() => import("./app"));
    const fixture = options();
    const response = (revision: number, ids: string[]) => ({
      ok: true as const,
      value: {
        groupingKey: "builtin:sections",
        revision,
        items: ids.map((threadId) => ({
          groupingKey: "builtin:sections",
          groupId: "section-a",
          threadId,
          enteredAtMs: null,
        })),
      },
    });
    let reads = 0;
    let resolveOld!: (result: ReturnType<typeof response>) => void;
    const old = new Promise<ReturnType<typeof response>>((resolve) => {
      resolveOld = resolve;
    });
    const original = fixture.listPlacementsV1.getMockImplementation()!;
    fixture.listPlacementsV1.mockImplementation(async (raw) => {
      if ((raw as { groupingKey: string }).groupingKey !== "builtin:sections")
        return original(raw);
      reads++;
      if (reads === 2) return old;
      return response(
        reads === 1 ? 1 : 2,
        reads === 1 ? ["thread-a", "thread-b"] : ["thread-b", "thread-a"],
      );
    });
    const slot = renderSlot(app.threadLists[0]!, props, fixture.value);
    await slot.findByText("Design migration");
    const group = slot.getByRole("region", { name: "Release group" });
    const titles = () =>
      within(group)
        .getAllByRole("link")
        .map((node) => node.textContent || node.getAttribute("aria-label"));
    await slot.emitRealtime("placements-changed", null);
    await slot.emitRealtime("placements-changed", null);
    await waitFor(() => expect(titles()[0]).toContain("Ship UI"));
    await act(async () => resolveOld(response(1, ["thread-a", "thread-b"])));
    expect(titles()[0]).toContain("Ship UI");
    slot.lifecycle.unmount();
  }, 15_000);

  it("shows archived threads when Archived is removed from Hide", async () => {
    const app = await loadPluginApp(() => import("./app"));
    const fixture = options();
    fixture.listThreadsV1.mockResolvedValue({
      threads: [
        {
          id: "thread-archived",
          projectId: "project-a",
          title: "Archived planning",
          titleFallback: null,
          parentThreadId: null,
          sectionId: "section-a",
          originKind: null,
          originPluginId: null,
          providerId: "codex",
          visibility: "visible" as const,
          isPinned: false,
          isArchived: true,
          createdAt: 1,
          updatedAt: 3,
          lastReadAt: 2,
          latestAttentionAt: 1,
        },
      ],
    });
    const slot = renderSlot(app.threadLists[0]!, props, fixture.value);
    await slot.findByText("Design migration");
    expect(slot.queryByText("Archived planning")).toBeNull();

    fireEvent.keyDown(
      slot.getByRole("button", { name: "Sidebar display options" }),
      { key: "Enter" },
    );
    const hide = await slot.findByRole("menuitem", {
      name: "Hide Hidden, Archived",
    });
    hide.focus();
    fireEvent.keyDown(hide, { key: "ArrowRight" });
    fireEvent.click(
      await slot.findByRole("menuitemcheckbox", { name: "Archived" }),
    );

    expect(await slot.findByText("Archived planning")).toBeTruthy();
    expect(fixture.listThreadsV1).toHaveBeenCalledWith(null);
    slot.lifecycle.unmount();
  });

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

  it.each([
    ["queued-waiting", "Thread has a message waiting to send"],
    ["queued-failed", "Queued message failed to send"],
  ])("shows bb's %s indicator", async (indicator, indicatorLabel) => {
    const app = await loadPluginApp(() => import("./app"));
    const fixture = options({
      sidebarThreads: {
        ...options().value.sidebarThreads,
        threads: [thread({ id: "thread-a", indicator, indicatorLabel })],
      },
    });
    const slot = renderSlot(app.threadLists[0]!, props, fixture.value);
    const link = await slot.findByRole("link", {
      name: "Open thread-a — A useful preview",
    });
    expect(
      within(link.closest("li")!).getByLabelText(indicatorLabel),
    ).toBeTruthy();
    slot.lifecycle.unmount();
  });

  it.each([
    ["none", "Thread has unsubmitted draft"],
    ["runtime", "Thread working with unsubmitted draft"],
    ["queued-waiting", "Thread has a message waiting to send"],
    ["queued-failed", "Queued message failed to send"],
    ["waiting-for-input", "Thread needs user input"],
  ])(
    "combines a draft with %s using bb's priority",
    async (indicator, expected) => {
      const labels: Record<string, string> = {
        runtime: "Thread working",
        "queued-waiting": "Thread has a message waiting to send",
        "queued-failed": "Queued message failed to send",
        "waiting-for-input": "Thread needs user input",
      };
      const app = await loadPluginApp(() => import("./app"));
      const fixture = options({
        sidebarDraftThreadIds: ["thread-a"],
        sidebarThreads: {
          ...options().value.sidebarThreads,
          threads: [
            thread({
              id: "thread-a",
              indicator,
              indicatorLabel: labels[indicator] ?? null,
            }),
          ],
        },
      });
      const slot = renderSlot(app.threadLists[0]!, props, fixture.value);
      const link = await slot.findByRole("link", {
        name: "Open thread-a — A useful preview (unsubmitted draft)",
      });
      if (indicator !== "none")
        expect(
          within(link.closest("li")!).getByLabelText(expected),
        ).toBeTruthy();
      slot.lifecycle.unmount();
    },
  );

  it.each([
    ["none", false, "Saving draft"],
    ["runtime", false, "Thread working"],
    ["runtime", true, "Saving draft"],
    ["unread-error", true, "Unread thread failed"],
    ["waiting-for-input", true, "Thread needs user input"],
  ])(
    "resolves a plugin status with %s and draft=%s",
    async (indicator, draft, expected) => {
      const labels: Record<string, string> = {
        runtime: "Thread working",
        "unread-error": "Unread thread failed",
        "waiting-for-input": "Thread needs user input",
      };
      const app = await loadPluginApp(() => import("./app"));
      const fixture = options({
        sidebarDraftThreadIds: draft ? ["thread-a"] : [],
        sidebarRowStatuses: {
          "thread-a": { icon: "Save", label: "Saving draft", tone: "running" },
        },
        sidebarThreads: {
          ...options().value.sidebarThreads,
          threads: [
            thread({
              id: "thread-a",
              indicator,
              indicatorLabel: labels[indicator] ?? null,
            }),
          ],
        },
      });
      const slot = renderSlot(app.threadLists[0]!, props, fixture.value);
      await slot.findByText("thread-a");
      expect(slot.getByLabelText(expected)).toBeTruthy();
      if (expected !== "Saving draft")
        expect(slot.queryByLabelText("Saving draft")).toBeNull();
      slot.lifecycle.unmount();
    },
  );

  it("combines a hidden child's draft with its parent's work", async () => {
    const app = await loadPluginApp(() => import("./app"));
    window.localStorage.setItem(
      "bb.sidebar.collapsedThreads",
      JSON.stringify(["thread-a"]),
    );
    const fixture = options({
      sidebarDraftThreadIds: ["child"],
      sidebarThreads: {
        ...options().value.sidebarThreads,
        threads: [
          thread({
            id: "thread-a",
            indicator: "runtime",
            indicatorLabel: "Thread working",
          }),
          thread({ id: "child", parentThreadId: "thread-a" }),
        ],
      },
    });
    const slot = renderSlot(app.threadLists[0]!, props, fixture.value);
    await slot.findByText("thread-a");
    expect(
      slot.getByLabelText("Thread working with unsubmitted draft"),
    ).toBeTruthy();
    fireEvent.click(
      slot.getByRole("button", { name: "Expand thread-a threads" }),
    );
    expect(slot.getByLabelText("Thread working")).toBeTruthy();
    expect(
      slot.getByRole("link", { name: "Open child (unsubmitted draft)" }),
    ).toBeTruthy();
    slot.lifecycle.unmount();
  });

  it("keeps a hidden child's queue off the parent indicator like bb", async () => {
    const app = await loadPluginApp(() => import("./app"));
    window.localStorage.setItem(
      "bb.sidebar.collapsedThreads",
      JSON.stringify(["thread-a"]),
    );
    const fixture = options({
      sidebarThreads: {
        ...options().value.sidebarThreads,
        threads: [
          thread({
            id: "thread-a",
            indicator: "queued-waiting",
            indicatorLabel: "Thread has a message waiting to send",
            queuedWork: "waiting",
          }),
          thread({
            id: "child",
            parentThreadId: "thread-a",
            indicator: "queued-failed",
            indicatorLabel: "Queued message failed to send",
            queuedWork: "failed",
          }),
        ],
      },
    });
    const slot = renderSlot(app.threadLists[0]!, props, fixture.value);
    await slot.findByText("thread-a");
    expect(
      slot.getByLabelText("Thread has a message waiting to send"),
    ).toBeTruthy();
    expect(slot.queryByLabelText("Queued message failed to send")).toBeNull();
    fireEvent.click(
      slot.getByRole("button", { name: "Expand thread-a threads" }),
    );
    expect(slot.getByLabelText("Queued message failed to send")).toBeTruthy();
    slot.lifecycle.unmount();
  });

  it("hides internal threads supplied by the newer sidebar API by default", async () => {
    const app = await loadPluginApp(() => import("./app"));
    const fixture = options({
      sidebarThreads: {
        ...options().value.sidebarThreads,
        threads: [
          thread({ id: "thread-a", title: "Visible thread" }),
          thread({ id: "thread-b", title: "Internal thread", isHidden: true }),
        ],
      },
    });
    const slot = renderSlot(app.threadLists[0]!, props, fixture.value);
    await slot.findByText("Visible thread");
    expect(slot.queryByText("Internal thread")).toBeNull();
    slot.lifecycle.unmount();
  });

  it("aligns thread icons and indicators with the title row by default", async () => {
    const app = await loadPluginApp(() => import("./app"));
    const fixture = options({
      sidebarThreads: {
        projects: [
          {
            id: "project-a",
            name: "Storefront",
            isPersonal: false,
            href: "/projects/project-a",
            settingsHref: "/projects/project-a/settings",
          },
        ],
        threads: [
          thread({
            id: "thread-a",
            title: "Design migration",
            indicator: "runtime",
            indicatorLabel: "Thread working",
          }),
          thread({ id: "thread-b", title: "Ship UI" }),
        ],
      },
    });
    const slot = renderSlot(app.threadLists[0]!, props, fixture.value);
    const title = await slot.findByText("Design migration");
    const row = title.closest("[data-thread-id]")!;
    const icon = row.querySelector<HTMLElement>(
      "[data-ribbon-sidebar-icon-slot] svg",
    )!;
    const iconSlot = icon.closest<HTMLElement>(
      "[data-ribbon-sidebar-icon-slot]",
    )!;
    const indicator = row.querySelector<HTMLElement>(
      "[data-sidebar-thread-trailing-indicator]",
    )!;
    const indicatorLane = indicator.parentElement!.parentElement!;

    expect(getComputedStyle(iconSlot).gridRowStart).toBe("1");
    expect(getComputedStyle(iconSlot).gridRowEnd).toBe("auto");
    expect(getComputedStyle(indicatorLane).alignSelf).toBe("start");
    slot.lifecycle.unmount();
  });

  it("reserves a title-row indicator only on the title line", async () => {
    const app = await loadPluginApp(() => import("./app"));
    const fixture = options({
      sidebarThreads: {
        projects: [
          {
            id: "project-a",
            name: "Storefront",
            isPersonal: false,
            href: "/projects/project-a",
            settingsHref: "/projects/project-a/settings",
          },
        ],
        threads: [
          thread({
            id: "thread-a",
            title: "Design migration",
            indicator: "runtime",
            indicatorLabel: "Thread working",
          }),
          thread({ id: "thread-b", title: "Ship UI" }),
        ],
      },
    });
    const slot = renderSlot(app.threadLists[0]!, props, fixture.value);
    const title = await slot.findByText("Design migration");
    const preview = await slot.findByText("A useful preview");
    const row = title.closest("[data-thread-id]")!;
    const indicator = row.querySelector<HTMLElement>(
      "[data-sidebar-thread-trailing-indicator]",
    )!;
    const indicatorLane = indicator.parentElement!.parentElement!;

    expect(getComputedStyle(preview).paddingRight).toBe("8px");
    expect(getComputedStyle(indicatorLane).position).toBe("absolute");
    slot.lifecycle.unmount();
  });

  it("keeps the preview inside the right edge without an indicator", async () => {
    const app = await loadPluginApp(() => import("./app"));
    const fixture = options();
    const slot = renderSlot(app.threadLists[0]!, props, fixture.value);
    const preview = await slot.findByText("A useful preview");

    expect(getComputedStyle(preview).paddingRight).toBe("8px");
    slot.lifecycle.unmount();
  });

  it("centers thread icons and indicators across the entire item when configured", async () => {
    const app = await loadPluginApp(() => import("./app"));
    const fixture = options({
      settings: { threadAdornmentAlignment: "Entire item" },
      sidebarThreads: {
        projects: [
          {
            id: "project-a",
            name: "Storefront",
            isPersonal: false,
            href: "/projects/project-a",
            settingsHref: "/projects/project-a/settings",
          },
        ],
        threads: [
          thread({
            id: "thread-a",
            title: "Design migration",
            indicator: "runtime",
            indicatorLabel: "Thread working",
          }),
          thread({ id: "thread-b", title: "Ship UI" }),
        ],
      },
    });
    const slot = renderSlot(app.threadLists[0]!, props, fixture.value);
    const title = await slot.findByText("Design migration");
    const row = title.closest("[data-thread-id]")!;
    const icon = row.querySelector<HTMLElement>(
      "[data-ribbon-sidebar-icon-slot] svg",
    )!;
    const iconSlot = icon.closest<HTMLElement>(
      "[data-ribbon-sidebar-icon-slot]",
    )!;
    const indicator = row.querySelector<HTMLElement>(
      "[data-sidebar-thread-trailing-indicator]",
    )!;
    const indicatorLane = indicator.parentElement!.parentElement!;

    expect(getComputedStyle(iconSlot).gridRowStart).toBe("1");
    expect(getComputedStyle(iconSlot).gridRowEnd).toBe("span 2");
    expect(getComputedStyle(indicatorLane).alignSelf).toBe("stretch");
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
          {
            id: "project-a",
            name: "Storefront",
            isPersonal: false,
            href: "/projects/project-a",
            settingsHref: "/projects/project-a/settings",
          },
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
      open.parentElement?.querySelector("[data-ribbon-sidebar-icon-slot] svg"),
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
        window.localStorage.getItem("bb.plugin.ribbon-sidebar.collapsedThreads") ?? "[]",
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
        window.localStorage.getItem("bb.plugin.ribbon-sidebar.collapsedThreads") ?? "[]",
      ),
    ).toEqual([]);

    expect(slot.getAllByLabelText("Idle stage").length).toBeGreaterThan(0);
    expect(
      slot.getByRole("button", { name: "Collapse Release section" }),
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
    expect(slot.queryByRole("button", { name: "Move Ship UI" })).toBeNull();
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
    expect(slot.queryByRole("button", { name: "Thread actions" })).toBeNull();
    fireEvent.click(
      slot.getByRole("link", { name: "Open Archived migration" }),
    );
    expect(slot.inspection.sidebarActionCalls).not.toContainEqual(
      expect.objectContaining({ method: "open", threadId: "thread-archived" }),
    );
    expect(slot.inspection.navigateCalls).toContainEqual({
      method: "toThread",
      threadId: "thread-archived",
    });
    expect(onNavigate).toHaveBeenCalledOnce();
    slot.lifecycle.unmount();
  });

  it("previews only the opened thread inside a collapsed stage", async () => {
    window.localStorage.setItem(
      "bb.plugin.ribbon-sidebar.preferences.v1",
      JSON.stringify({
        view: {
          scope: { kind: "all" },
          groupingKey: "builtin:sections",
        },
        collapsed: ["builtin:sections/section-a"],
      }),
    );
    const app = await loadPluginApp(() => import("./app"));
    const fixture = options();
    fixture.value.rpc.listPlacementsV1 = vi.fn(async () => ({
      ok: true as const,
      value: {
        groupingKey: "builtin:sections",
        revision: 1,
        items: ["thread-a", "thread-b"].map((threadId) => ({
          groupingKey: "builtin:sections",
          groupId: "section-a",
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
      slot
        .getByRole("button", { name: "Expand Release section" })
        .getAttribute("aria-expanded"),
    ).toBe("false");
    slot.lifecycle.unmount();
  });

  it("previews only the opened thread inside the collapsed Pinned section", async () => {
    window.localStorage.setItem(
      "bb.plugin.ribbon-sidebar.preferences.v1",
      JSON.stringify({
        view: {
          scope: { kind: "all" },
          groupingKey: "plugin:thread-stages:stages",
        },
        collapsed: ["builtin:pinned"],
      }),
    );
    const app = await loadPluginApp(() => import("./app"));
    const fixture = options({
      sidebarThreads: {
        projects: [
          {
            id: "project-a",
            name: "Storefront",
            isPersonal: false,
            href: "/projects/project-a",
            settingsHref: "/projects/project-a/settings",
          },
        ],
        threads: [
          thread({
            id: "thread-pin-open",
            isPinned: true,
            title: "Opened pinned thread",
          }),
          thread({
            id: "thread-pin-other",
            isPinned: true,
            title: "Other pinned thread",
          }),
          thread({ id: "thread-a", title: "Design migration" }),
        ],
      },
    });
    const slot = renderSlot(
      app.threadLists[0]!,
      { ...props, activeThreadId: "thread-pin-open" },
      fixture.value,
    );

    expect(await slot.findByText("Opened pinned thread")).toBeTruthy();
    expect(slot.queryByText("Other pinned thread")).toBeNull();
    expect(
      slot
        .getByRole("button", { name: "Expand Pinned section" })
        .getAttribute("aria-expanded"),
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
        collapsed: ["builtin:sections/section-b"],
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
      slot
        .getByRole("button", { name: "Collapse Roadmap section" })
        .getAttribute("aria-expanded"),
    ).toBe("true");
    expect(slot.queryByText("Design migration")).toBeNull();
    slot.lifecycle.unmount();
  });

  it("renders unpinned roots in Ribbon's stored within-group order", async () => {
    useManualSort();
    const app = await loadPluginApp(() => import("./app"));
    const fixture = options();
    fixture.value.rpc.listPlacementsV1 = vi.fn(async () => ({
      ok: true as const,
      value: {
        groupingKey: "builtin:sections",
        revision: 1,
        items: [
          {
            groupingKey: "builtin:sections",
            groupId: "section-a",
            threadId: "thread-b",
            enteredAtMs: 1,
            origin: "ui" as const,
          },
          {
            groupingKey: "builtin:sections",
            groupId: "section-a",
            threadId: "thread-a",
            enteredAtMs: 1,
            origin: "ui" as const,
          },
        ],
      },
    }));
    const slot = renderSlot(app.threadLists[0]!, props, fixture.value);

    await slot.findByText("Design migration");
    const idleGroup = slot.getByRole("region", { name: "Release group" });
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

  it("retains Thread stages activity in a collapsed stage", async () => {
    window.localStorage.setItem(
      "bb.plugin.ribbon-sidebar.preferences.v1",
      JSON.stringify({
        view: {
          scope: { kind: "all" },
          groupingKey: "plugin:thread-stages:stages",
        },
        collapsed: ["builtin:sections/section-a"],
      }),
    );
    const app = await loadPluginApp(() => import("./app"));
    const fixture = options({
      settings: { showCollapsedGroupIndicators: true },
      sidebarThreads: {
        projects: [
          {
            id: "project-a",
            name: "Storefront",
            isPersonal: false,
            href: "/projects/project-a",
            settingsHref: "/projects/project-a/settings",
          },
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
        collapsed: ["builtin:sections/section-a"],
      }),
    );
    const app = await loadPluginApp(() => import("./app"));
    const fixture = options({
      sidebarThreads: {
        projects: [
          {
            id: "project-a",
            name: "Storefront",
            isPersonal: false,
            href: "/projects/project-a",
            settingsHref: "/projects/project-a/settings",
          },
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
        .getByRole("menuitem", { name: "Release" })
        .closest('[role="menuitem"]')
        ?.querySelector('[data-ribbon-icons-section="section-a"]'),
    ).not.toBeNull();
    expect(
      slot
        .getByRole("menuitem", { name: "Unorganized" })
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

    const releaseHeader = (
      await slot.findByRole("region", {
        name: "Release group",
      })
    ).querySelector('[data-sidebar="group-label"]')!;
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
    const hiddenHeader = (
      await hiddenSlot.findByRole("region", {
        name: "Release group",
      })
    ).querySelector('[data-sidebar="group-label"]')!;
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
    fireEvent.click(slot.getByRole("menuitem", { name: "Roadmap" }));

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

  it.each([
    ["Active", "preserve"],
    ["Completed", "start"],
  ])(
    "moves to %s from any thread menu with the group's placement policy",
    async (stage, anchor) => {
      window.localStorage.setItem(
        "bb.plugin.ribbon-sidebar.preferences.v1",
        JSON.stringify({
          view: { scope: { kind: "all" }, groupingKey: "builtin:projects" },
          collapsed: [],
        }),
      );
      const app = await loadPluginApp(() => import("./app"));
      const fixture = options();
      const menuSnapshot = structuredClone(snapshot);
      menuSnapshot.groupings
        .find(
          ({ groupingKey }) => groupingKey === "plugin:thread-stages:stages",
        )!
        .groups.push({
          id: "Completed",
          label: "Completed",
          visibleWhenEmpty: true,
          acceptsAssignments: true,
          defaultCollapsed: true,
          defaultPlacement: "start",
        });
      fixture.synchronizeV1.mockResolvedValue(menuSnapshot);
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
      fireEvent.click(await slot.findByText(stage));

      await waitFor(() =>
        expect(fixture.updatePlacementV1).toHaveBeenCalledWith({
          groupingKey: "plugin:thread-stages:stages",
          groupId: stage,
          threadId: "thread-a",
          anchor: { kind: anchor },
          origin: "ui",
        }),
      );
      slot.lifecycle.unmount();
    },
  );

  it("moves a thread through the group surface without separate drag handles", async () => {
    useManualSort();
    const app = await loadPluginApp(() => import("./app"));
    const fixture = options();
    const slot = renderSlot(app.threadLists[0]!, props, fixture.value);
    await slot.findByText("Design migration");

    fireEvent.click(
      slot.getByRole("button", { name: "Collapse Release section" }),
    );
    expect(slot.queryByText("Design migration")).toBeNull();
    fireEvent.click(
      slot.getByRole("button", { name: "Expand Release section" }),
    );
    expect(slot.getByText("Design migration")).toBeTruthy();

    const drag = await beginThreadDrag(
      slot.getByText("Ship UI").closest("[data-thread-id]")!,
    );
    expect(slot.queryByRole("button", { name: "Move Ship UI" })).toBeNull();
    expect(
      slot.queryByRole("button", { name: "Move to end of Idle" }),
    ).toBeNull();
    const idleGroup = slot.getByRole("region", { name: "Release group" });
    drag.hover(idleGroup);
    await act(async () => drag.drop());
    expect(fixture.updatePlacementV1).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: "thread-b",
        groupId: "section-a",
        anchor: { kind: "end" },
        origin: "ui",
      }),
    );
    slot.lifecycle.unmount();
  });

  it("shows a placeholder at the original position when picking up and returning a thread", async () => {
    useManualSort();
    const app = await loadPluginApp(() => import("./app"));
    const fixture = options();
    const slot = renderSlot(app.threadLists[0]!, props, fixture.value);
    await slot.findByText("Ship UI");
    const source = slot.getByText("Ship UI").closest("li")!;
    const drag = await beginThreadDrag(source);
    const activeGroup = slot.getByRole("region", { name: "Roadmap group" });
    expect(
      activeGroup.querySelector("[data-ribbon-thread-drop-preview]"),
    ).toBeTruthy();
    drag.hover(slot.getByRole("region", { name: "Release group" }));
    drag.hover(source);
    expect(
      activeGroup.querySelector("[data-ribbon-thread-drop-preview]"),
    ).toBeTruthy();
    await act(async () => drag.drop());
    expect(fixture.updatePlacementV1).not.toHaveBeenCalled();
    expect(within(activeGroup).getByText("Ship UI")).toBeTruthy();
    slot.lifecycle.unmount();
  });

  it("shows a placeholder and drops at the end of the group above a gap", async () => {
    useManualSort();
    const app = await loadPluginApp(() => import("./app"));
    const fixture = options();
    const slot = renderSlot(app.threadLists[0]!, props, fixture.value);
    await slot.findByText("Ship UI");
    const drag = await beginThreadDrag(
      slot.getByText("Ship UI").closest("li")!,
    );
    const idleGroup = slot.getByRole("region", { name: "Release group" });
    drag.hoverBelow(idleGroup);
    expect(
      idleGroup.querySelector("[data-ribbon-thread-drop-preview]"),
    ).toBeTruthy();
    await act(async () => drag.drop());
    expect(fixture.updatePlacementV1).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: "thread-b",
        groupId: "section-a",
        anchor: { kind: "end" },
      }),
    );
    slot.lifecycle.unmount();
  });

  it("drops just below a group heading insert first", async () => {
    useManualSort();
    const app = await loadPluginApp(() => import("./app"));
    const fixture = options();
    const slot = renderSlot(app.threadLists[0]!, props, fixture.value);
    await slot.findByText("Design migration");
    const group = slot.getByRole("region", { name: "Release group" });
    const drag = await beginThreadDrag(
      slot.getByText("Ship UI").closest("li")!,
    );
    drag.hoverJustBelow(group.querySelector('[data-sidebar="group-label"]')!);
    await act(async () => drag.drop());
    expect(fixture.updatePlacementV1).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: "thread-b",
        groupId: "section-a",
        anchor: { kind: "before", threadId: "thread-a" },
      }),
    );
    slot.lifecycle.unmount();
  });

  it.each([false, true])(
    "drops on group titles insert first (collapsed: %s)",
    async (collapsed) => {
      useManualSort();
      const app = await loadPluginApp(() => import("./app"));
      const fixture = options();
      const slot = renderSlot(app.threadLists[0]!, props, fixture.value);
      await slot.findByText("Design migration");
      if (collapsed)
        fireEvent.click(
          slot.getByRole("button", { name: "Collapse Release section" }),
        );
      const group = slot.getByRole("region", { name: "Release group" });
      const drag = await beginThreadDrag(
        slot.getByText("Ship UI").closest("li")!,
      );
      drag.hover(group.querySelector('[data-sidebar="group-label"]')!);
      await act(async () => drag.drop());
      expect(fixture.updatePlacementV1).toHaveBeenCalledWith(
        expect.objectContaining({
          threadId: "thread-b",
          groupId: "section-a",
          anchor: { kind: "before", threadId: "thread-a" },
        }),
      );
      slot.lifecycle.unmount();
    },
  );

  it.each([
    { header: false, empty: false },
    { header: true, empty: false },
    { header: true, empty: true },
  ])(
    "allows writable group drops (header: $header, empty: $empty)",
    async ({ header, empty }) => {
      useManualSort("builtin:sections");
      const app = await loadPluginApp(() => import("./app"));
      const fixture = options();
      if (empty)
        fixture.value.sidebarThreads.threads =
          fixture.value.sidebarThreads.threads.filter(
            ({ id }) => id !== "thread-b",
          );
      const slot = renderSlot(app.threadLists[0]!, props, fixture.value);
      await slot.findByText("Design migration");

      const source = slot
        .getByText("Design migration")
        .closest("[data-thread-id]")!;
      const target = slot.getByRole("region", { name: "Roadmap group" });
      const drag = await beginThreadDrag(source);
      drag.hover(
        header ? target.querySelector('[data-sidebar="group-label"]')! : target,
      );
      await act(async () => drag.drop());

      expect(fixture.updatePlacementV1).toHaveBeenCalledWith(
        expect.objectContaining({
          groupingKey: "builtin:sections",
          groupId: "section-b",
          threadId: "thread-a",
          anchor:
            header && !empty
              ? { kind: "before", threadId: "thread-b" }
              : { kind: "end" },
          origin: "ui",
        }),
      );
      slot.lifecycle.unmount();
    },
  );

  it.each([false, true])(
    "keeps pinned reorder bb-owned (header: %s)",
    async (header) => {
      useManualSort();
      const app = await loadPluginApp(() => import("./app"));
      const fixture = options({
        sidebarThreads: {
          projects: [
            {
              id: "project-a",
              name: "Storefront",
              isPersonal: false,
              href: "/projects/project-a",
              settingsHref: "/projects/project-a/settings",
            },
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

      const source = slot.getByText("Pinned B").closest("[data-thread-id]")!;
      const target = slot.getByText("Pinned A").closest("[data-thread-id]")!;
      const drag = await beginThreadDrag(source);
      drag.hover(
        header
          ? target
              .closest("section")!
              .querySelector('[data-sidebar="group-label"]')!
          : target,
      );
      await act(async () => drag.drop());
      await waitFor(() =>
        expect(fixture.reorderPinnedV1).toHaveBeenCalledWith({
          threadId: "thread-pin-b",
          previousThreadId: null,
          nextThreadId: "thread-pin-a",
        }),
      );
      expect(fixture.updatePlacementV1).not.toHaveBeenCalledWith(
        expect.objectContaining({ threadId: "thread-pin-b" }),
      );
      slot.lifecycle.unmount();
    },
  );

  it("restores the original group when saving a drop fails", async () => {
    useManualSort();
    const app = await loadPluginApp(() => import("./app"));
    const fixture = options();
    fixture.updatePlacementV1.mockRejectedValueOnce(new Error("Move failed"));
    const slot = renderSlot(app.threadLists[0]!, props, fixture.value);
    await slot.findByText("Ship UI");
    const drag = await beginThreadDrag(
      slot.getByText("Ship UI").closest("li")!,
    );
    drag.hover(slot.getByRole("region", { name: "Release group" }));
    await act(async () => drag.drop());
    await slot.findByText("Move failed");
    await waitFor(() =>
      expect(
        within(slot.getByRole("region", { name: "Roadmap group" })).getByText(
          "Ship UI",
        ),
      ).toBeTruthy(),
    );
    expect(
      within(slot.getByRole("region", { name: "Release group" })).queryByText(
        "Ship UI",
      ),
    ).toBeNull();
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
    expect(slot.queryByRole("region", { name: "Release group" })).toBeNull();
    slot.lifecycle.unmount();
  });

  it("ignores self-drops and retries one revision conflict", async () => {
    useManualSort();
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
    const firstDrag = await beginThreadDrag(row);
    firstDrag.drop();
    expect(fixture.updatePlacementV1).not.toHaveBeenCalled();

    const drag = await beginThreadDrag(row);
    const idleGroup = slot.getByRole("region", { name: "Release group" });
    drag.hover(idleGroup);
    await act(async () => drag.drop());
    await waitFor(() =>
      expect(fixture.updatePlacementV1).toHaveBeenCalledTimes(2),
    );
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

  it("shows a retry action when mounting fails", async () => {
    const app = await loadPluginApp(() => import("./app"));
    const fixture = options({
      rpc: {
        synchronizeV1: async () => {
          throw new Error("Ribbon backend unavailable");
        },
      },
    });
    const slot = renderSlot(app.threadLists[0]!, props, fixture.value);
    expect(await slot.findByRole("button", { name: "Retry" })).toBeTruthy();
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

    expect(await slot.findByRole("button", { name: "Retry" })).toBeTruthy();
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
        grouping.groupingKey === "builtin:sections"
          ? {
              ...grouping,
              groups: grouping.groups.map((group) =>
                group.id === "section-a"
                  ? { ...group, label: "Renamed section" }
                  : group,
              ),
            }
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
      await slot.findByRole("region", { name: "Renamed section group" }),
    ).toBeTruthy();
    slot.lifecycle.unmount();
  });
});
