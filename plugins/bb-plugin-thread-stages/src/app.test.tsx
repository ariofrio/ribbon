// @vitest-environment jsdom
import {
  loadPluginApp,
  renderSlot,
} from "@get-bb/plugin-sdk/testing/app";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ICON_ATTRIBUTE, ICON_OPTIONAL_ATTRIBUTE } from "./icon-styles";

afterEach(() => cleanup());

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

  it("names each row's project for the Icons plugin to paint", async () => {
    const app = await loadPluginApp(() => import("./app"));
    const threadList = app.threadLists[0]!;
    const slot = renderSlot(
      threadList,
      threadListProps,
      threadListOptions(true),
    );

    await slot.findByText("Polish the release");
    const box = slot.container.querySelector(
      '[data-ribbon-icons-project="project-1"]',
    );
    expect(box).not.toBeNull();

    // The rules and the boxes are written apart, in CSS and in JSX, and a
    // rename on one side would go on rendering an empty span forever.
    const sheet = document.head.querySelector(
      "style[data-thread-stages-icons]",
    )?.textContent;
    expect(sheet).toContain(`[${ICON_ATTRIBUTE}="project"]`);
    expect(box?.getAttribute(ICON_ATTRIBUTE)).toBe("project");
    expect(sheet).toContain(`[${ICON_OPTIONAL_ATTRIBUTE}]{display:none}`);
    expect(box?.hasAttribute(ICON_OPTIONAL_ATTRIBUTE)).toBe(true);

    slot.lifecycle.unmount();
    expect(
      document.head.querySelector("style[data-thread-stages-icons]"),
    ).toBeNull();
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
