// @vitest-environment jsdom
import {
  loadPluginApp,
  renderSlot,
} from "@get-bb/plugin-sdk/testing/app";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { cleanup, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

const sidebarThread = {
  id: "thread-1",
  projectId: "project-1",
  title: "Polish the release",
  titleFallback: null,
  parentThreadId: null,
  sectionId: null,
  originKind: null,
  originPluginId: null,
  providerId: "codex",
  hasPendingInteraction: false,
  activity: {
    workflows: 0,
    backgroundAgents: 0,
    backgroundCommands: 0,
    planMode: 0,
    goals: 0,
  },
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
} satisfies PluginSidebarThread;

const threadListProps = {
  activeThreadId: null,
  activeProjectId: null,
  isCompactViewport: false,
  onNavigate: () => {},
  searchQuery: "",
  experimental_Original: () => null,
};

function threadListOptions(
  showThreadPreviews: boolean,
  workflowStage: "Deferred" | "Idle" = "Idle",
  settings: Record<string, boolean> = {},
  thread: PluginSidebarThread = sidebarThread,
) {
  return {
    settings: { ...settings, showThreadPreviews },
    rpc: {
      listState: () => ({
        assignments: [
          {
            threadId: "thread-1",
            workflowStage,
            sortKey: "a",
            updatedAt: 1,
          },
        ],
      }),
      listPreviews: () => ({
        previews: [{ threadId: "thread-1", preview: "A useful preview" }],
      }),
      listSections: () => ({ sections: [] }),
      listProjectActionStates: () => ({ projects: [] }),
    },
    sidebarThreads: {
      projects: [
        { id: "project-1", name: "Example project", isPersonal: false },
      ],
      threads: [thread],
    },
  };
}

describe("thread stages app registration", () => {
  it(
    "registers the thread list and lifecycle-managed shortcuts",
    async () => {
      const app = await loadPluginApp(() => import("./app"));

      expect(app.threadLists).toHaveLength(1);
      expect(app.threadLists[0]).toMatchObject({
        id: "workflow-stage",
        title: "Thread stages",
      });
      expect(app.contentScripts).toHaveLength(2);
      expect(app.contentScripts.map(({ id }) => id)).toEqual([
        "workflow-shortcuts",
        "sidebar-content-spacing",
      ]);
    },
    10_000,
  );

  it("hides message previews when the setting is disabled", async () => {
    const app = await loadPluginApp(() => import("./app"));
    const threadList = app.threadLists[0]!;
    const slot = renderSlot(
      threadList,
      threadListProps,
      threadListOptions(false),
    );

    await slot.findByText("Polish the release");
    expect(slot.queryByText("A useful preview")).toBeNull();
    slot.lifecycle.unmount();
  });

  it("shows message previews by default", async () => {
    const app = await loadPluginApp(() => import("./app"));
    const threadList = app.threadLists[0]!;
    const slot = renderSlot(
      threadList,
      threadListProps,
      threadListOptions(true),
    );

    expect(await slot.findByText("A useful preview")).toBeTruthy();
    slot.lifecycle.unmount();
  });

  it("always shows non-unread activity in a collapsed stage header", async () => {
    const app = await loadPluginApp(() => import("./app"));
    const slot = renderSlot(
      app.threadLists[0]!,
      threadListProps,
      threadListOptions(
        true,
        "Deferred",
        { showCollapsedStageIndicators: false },
        {
          ...sidebarThread,
          indicator: "runtime",
          indicatorLabel: "Thread working",
        },
      ),
    );

    expect(await slot.findByLabelText("Thread working")).toBeTruthy();
    slot.lifecycle.unmount();
  });

  it("never shows unread-success activity in a collapsed stage header", async () => {
    const app = await loadPluginApp(() => import("./app"));
    const slot = renderSlot(
      app.threadLists[0]!,
      threadListProps,
      threadListOptions(
        true,
        "Deferred",
        {},
        {
          ...sidebarThread,
          indicator: "unread-success",
          indicatorLabel: "Unread thread succeeded",
          isUnread: true,
        },
      ),
    );

    await slot.findByText("Deferred");
    expect(slot.queryByLabelText("Unread thread succeeded")).toBeNull();
    slot.lifecycle.unmount();
  });

  it("hides an empty disabled stage", async () => {
    const app = await loadPluginApp(() => import("./app"));
    const slot = renderSlot(
      app.threadLists[0]!,
      threadListProps,
      threadListOptions(true, "Idle", { showDeferredStage: false }),
    );

    await slot.findByText("Polish the release");
    expect(slot.queryByText("Deferred")).toBeNull();
    slot.lifecycle.unmount();
  });

  it("keeps a nonempty disabled stage visible so it can be emptied", async () => {
    const app = await loadPluginApp(() => import("./app"));
    const slot = renderSlot(
      app.threadLists[0]!,
      threadListProps,
      threadListOptions(true, "Deferred", { showDeferredStage: false }),
    );

    expect(await slot.findByText("Deferred")).toBeTruthy();
    slot.lifecycle.unmount();
  });

  it("moves an existing project filter to the newly opened thread without overriding later filter changes", async () => {
    window.localStorage.setItem(
      "bb.plugin.thread-stages.threadFilter",
      "project:project-1",
    );
    const secondThread = {
      ...sidebarThread,
      id: "thread-2",
      projectId: "project-2",
      title: "Ship the release",
    };
    const baseOptions = threadListOptions(true);
    const app = await loadPluginApp(() => import("./app"));
    const slot = renderSlot(
      app.threadLists[0]!,
      { ...threadListProps, activeThreadId: secondThread.id },
      {
        ...baseOptions,
        rpc: {
          ...baseOptions.rpc,
          listState: () => ({
            assignments: [
              ...baseOptions.rpc.listState().assignments,
              {
                threadId: secondThread.id,
                workflowStage: "Idle" as const,
                sortKey: "b",
                updatedAt: 1,
              },
            ],
          }),
        },
        sidebarThreads: {
          projects: [
            ...baseOptions.sidebarThreads.projects,
            { id: "project-2", name: "Second project", isPersonal: false },
          ],
          threads: [sidebarThread, secondThread],
        },
      },
    );

    const trigger = await slot.findByRole("button", {
      name: "Sections and projects: Second project",
    });
    expect(slot.getByText("Ship the release")).toBeTruthy();
    expect(slot.queryByText("Polish the release")).toBeNull();

    fireEvent.keyDown(trigger, { key: "Enter" });
    fireEvent.click(
      await slot.findByRole("menuitemradio", { name: "Example project" }),
    );
    expect(
      await slot.findByRole("button", {
        name: "Sections and projects: Example project",
      }),
    ).toBeTruthy();
    expect(slot.getByText("Polish the release")).toBeTruthy();
    expect(slot.queryByText("Ship the release")).toBeNull();
    slot.lifecycle.unmount();
  });

  it("moves an existing section filter to the root section of an opened child thread", async () => {
    window.localStorage.setItem(
      "bb.plugin.thread-stages.threadFilter",
      "section:section-1",
    );
    const firstRoot = { ...sidebarThread, sectionId: "section-1" };
    const secondRoot = {
      ...sidebarThread,
      id: "thread-2",
      title: "Second section root",
      sectionId: "section-2",
    };
    const openedChild = {
      ...sidebarThread,
      id: "thread-2-child",
      title: "Opened child",
      parentThreadId: secondRoot.id,
      sectionId: null,
    };
    const baseOptions = threadListOptions(true);
    const app = await loadPluginApp(() => import("./app"));
    const slot = renderSlot(
      app.threadLists[0]!,
      { ...threadListProps, activeThreadId: openedChild.id },
      {
        ...baseOptions,
        rpc: {
          ...baseOptions.rpc,
          listState: () => ({
            assignments: [
              ...baseOptions.rpc.listState().assignments,
              {
                threadId: secondRoot.id,
                workflowStage: "Idle" as const,
                sortKey: "b",
                updatedAt: 1,
              },
            ],
          }),
          listSections: () => ({
            sections: [
              { id: "section-1", name: "First section" },
              { id: "section-2", name: "Second section" },
            ],
          }),
        },
        sidebarThreads: {
          ...baseOptions.sidebarThreads,
          threads: [firstRoot, secondRoot, openedChild],
        },
      },
    );

    expect(
      await slot.findByRole("button", {
        name: "Sections and projects: Second section",
      }),
    ).toBeTruthy();
    expect(slot.getByText("Opened child")).toBeTruthy();
    expect(slot.queryByText("Polish the release")).toBeNull();
    slot.lifecycle.unmount();
  });

  it("shows only the opened thread as a preview inside its collapsed stage", async () => {
    window.localStorage.setItem(
      "bb.plugin.workflow-stage.collapsedStatuses",
      '["Idle"]',
    );
    const openedThread = {
      ...sidebarThread,
      id: "thread-2",
      title: "Opened thread preview",
    };
    const baseOptions = threadListOptions(true);
    const app = await loadPluginApp(() => import("./app"));
    const slot = renderSlot(
      app.threadLists[0]!,
      { ...threadListProps, activeThreadId: openedThread.id },
      {
        ...baseOptions,
        rpc: {
          ...baseOptions.rpc,
          listState: () => ({
            assignments: [
              ...baseOptions.rpc.listState().assignments,
              {
                threadId: openedThread.id,
                workflowStage: "Idle" as const,
                sortKey: "b",
                updatedAt: 1,
              },
            ],
          }),
        },
        sidebarThreads: {
          ...baseOptions.sidebarThreads,
          threads: [sidebarThread, openedThread],
        },
      },
    );

    expect(
      (
        await slot.findByRole("button", { name: "Expand Idle section" })
      ).getAttribute("aria-expanded"),
    ).toBe("false");
    expect(await slot.findByText("Opened thread preview")).toBeTruthy();
    expect(slot.queryByText("Polish the release")).toBeNull();
    slot.lifecycle.unmount();
  });

  it("shows only the opened pinned thread as a preview inside the collapsed pinned group", async () => {
    window.localStorage.setItem(
      "bb.plugin.workflow-stage.collapsedStatuses",
      '["Pinned"]',
    );
    const firstPinned = { ...sidebarThread, isPinned: true };
    const openedPinned = {
      ...sidebarThread,
      id: "thread-2",
      title: "Opened pinned preview",
      isPinned: true,
    };
    const baseOptions = threadListOptions(true);
    const app = await loadPluginApp(() => import("./app"));
    const slot = renderSlot(
      app.threadLists[0]!,
      { ...threadListProps, activeThreadId: openedPinned.id },
      {
        ...baseOptions,
        rpc: {
          ...baseOptions.rpc,
          listState: () => ({
            assignments: [
              ...baseOptions.rpc.listState().assignments,
              {
                threadId: openedPinned.id,
                workflowStage: "Idle" as const,
                sortKey: "b",
                updatedAt: 1,
              },
            ],
          }),
          listPinnedThreadIds: () => ({
            threadIds: [firstPinned.id, openedPinned.id],
          }),
        },
        sidebarThreads: {
          ...baseOptions.sidebarThreads,
          threads: [firstPinned, openedPinned],
        },
      },
    );

    expect(
      (
        await slot.findByRole("button", { name: "Expand Pinned section" })
      ).getAttribute("aria-expanded"),
    ).toBe("false");
    expect(await slot.findByText("Opened pinned preview")).toBeTruthy();
    expect(slot.queryByText("Polish the release")).toBeNull();
    slot.lifecycle.unmount();
  });

  it("ignores the saved filter and expands matching groups while searching", async () => {
    window.localStorage.setItem(
      "bb.plugin.thread-stages.threadFilter",
      "project:project-1",
    );
    window.localStorage.setItem(
      "bb.plugin.workflow-stage.collapsedStatuses",
      '["Active"]',
    );
    const searchMatch = {
      ...sidebarThread,
      id: "thread-2",
      projectId: "project-2",
      title: "Ship the release",
    };
    const baseOptions = threadListOptions(true);
    const app = await loadPluginApp(() => import("./app"));
    const slot = renderSlot(
      app.threadLists[0]!,
      { ...threadListProps, searchQuery: "ship" },
      {
        ...baseOptions,
        rpc: {
          ...baseOptions.rpc,
          listState: () => ({
            assignments: [
              ...baseOptions.rpc.listState().assignments,
              {
                threadId: searchMatch.id,
                workflowStage: "Active" as const,
                sortKey: "b",
                updatedAt: 1,
              },
            ],
          }),
          searchThreads: () => ({
            threads: [
              {
                id: searchMatch.id,
                projectId: searchMatch.projectId,
                title: searchMatch.title,
                titleFallback: null,
                parentThreadId: null,
                providerId: searchMatch.providerId,
                isArchived: false,
              },
            ],
          }),
        },
        sidebarThreads: {
          projects: [
            ...baseOptions.sidebarThreads.projects,
            { id: "project-2", name: "Second project", isPersonal: false },
          ],
          threads: [sidebarThread, searchMatch],
        },
      },
    );

    expect(await slot.findByText("Ship the release")).toBeTruthy();
    expect(slot.queryByText("Polish the release")).toBeNull();
    expect(
      (
        await slot.findByRole("button", { name: "Collapse Active section" })
      ).getAttribute("aria-expanded"),
    ).toBe("true");
    expect(
      slot.getByRole("button", {
        name: "Sections and projects: Example project",
      }),
    ).toBeTruthy();
    slot.lifecycle.unmount();
  });

  it("falls back to bb's original list after ownership transfers", async () => {
    const app = await loadPluginApp(() => import("./app"));
    const slot = renderSlot(
      app.threadLists[0]!,
      {
        ...threadListProps,
        experimental_Original: () => <div>Original thread list</div>,
      },
      {
        ...threadListOptions(true),
        rpc: {
          ...threadListOptions(true).rpc,
          listState: () => {
            throw new Error(
              "Thread stages placement ownership has transferred to Ribbon sidebar.",
            );
          },
        },
      },
    );

    expect(await slot.findByText("Original thread list")).toBeTruthy();
    expect(
      slot.getByText(
        "Ribbon sidebar now owns stage placement. The original thread list is available below while Ribbon recovers.",
      ),
    ).toBeTruthy();
    slot.lifecycle.unmount();
  });
});
