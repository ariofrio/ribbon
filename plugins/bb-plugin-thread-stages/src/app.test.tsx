// @vitest-environment jsdom
import {
  loadPluginApp,
  mountPluginContentScripts,
  renderSlot,
} from "@get-bb/plugin-sdk/testing/app";
import { cleanup, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

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
};

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
      threads: [sidebarThread],
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
      expect(app.contentScripts).toHaveLength(3);
      expect(app.contentScripts.map(({ id }) => id)).toEqual([
        "new-thread-section",
        "workflow-shortcuts",
        "sidebar-content-spacing",
      ]);
    },
    10_000,
  );

  it("selects the filtered section when the New thread composer appears without intercepting navigation", async () => {
    window.localStorage.setItem(
      "bb.plugin.thread-stages.threadFilter",
      "section:section_now",
    );
    window.history.replaceState({}, "", "/threads/thread-1");
    const originalPushState = window.history.pushState;
    const originalReplaceState = window.history.replaceState;
    const app = await loadPluginApp(() => import("./app"));
    const contentScripts = await mountPluginContentScripts(app, {
      pluginId: "thread-stages",
      generation: 1,
    });

    window.history.pushState(
      { idx: 1, key: "compose", usr: { focusPrompt: true } },
      "",
      "/",
    );
    const stateBeforeComposer = window.history.state;
    document.body.insertAdjacentHTML(
      "beforeend",
      `<div data-app-composer data-app-composer-role="primary">
        <button data-promptbox-project-control>Project</button>
      </div>`,
    );

    await waitFor(() =>
      expect(window.history.state.usr?.sectionId).toBe("section_now"),
    );
    const interceptedNavigation =
      window.history.pushState !== originalPushState ||
      window.history.replaceState !== originalReplaceState;
    await contentScripts.lifecycle.dispose();
    window.localStorage.clear();

    expect(stateBeforeComposer.usr).toEqual({ focusPrompt: true });
    expect(interceptedNavigation).toBe(false);
  });

  it("updates an already-open composer when the section filter changes", async () => {
    window.history.replaceState(
      { idx: 1, key: "compose", usr: { focusPrompt: true } },
      "",
      "/",
    );
    document.body.innerHTML = `<div data-app-composer data-app-composer-role="primary">
      <button data-promptbox-project-control>Project</button>
    </div>`;
    const app = await loadPluginApp(() => import("./app"));
    const contentScripts = await mountPluginContentScripts(app, {
      pluginId: "thread-stages",
      generation: 1,
    });

    window.localStorage.setItem(
      "bb.plugin.thread-stages.threadFilter",
      "section:section_now",
    );
    window.dispatchEvent(
      new Event("bb.thread-stages.thread-filter-changed"),
    );

    expect(window.history.state.usr.sectionId).toBe("section_now");
    await contentScripts.lifecycle.dispose();
    window.localStorage.clear();
  });

  it("allows the New thread section picker to override the initial filter", async () => {
    window.localStorage.setItem(
      "bb.plugin.thread-stages.threadFilter",
      "section:section_now",
    );
    window.history.replaceState(
      { idx: 1, key: "compose", usr: { focusPrompt: true } },
      "",
      "/",
    );
    document.body.innerHTML = `<div data-app-composer data-app-composer-role="primary">
      <button data-promptbox-project-control>Project</button>
    </div>`;
    const app = await loadPluginApp(() => import("./app"));
    const contentScripts = await mountPluginContentScripts(app, {
      pluginId: "thread-stages",
      generation: 1,
    });
    await waitFor(() =>
      expect(window.history.state.usr?.sectionId).toBe("section_now"),
    );

    window.history.replaceState(
      {
        ...window.history.state,
        usr: { ...window.history.state.usr, sectionId: "section_later" },
      },
      "",
      window.location.href,
    );

    expect(window.history.state.usr.sectionId).toBe("section_later");
    await contentScripts.lifecycle.dispose();
    window.localStorage.clear();
  });

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
