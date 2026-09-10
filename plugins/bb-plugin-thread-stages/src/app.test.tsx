// @vitest-environment jsdom
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  cleanup();
  window.history.replaceState({}, "", "/");
  document.body.replaceChildren();
});

describe("thread stages overlay", () => {
  it("moves the scoped thread through SDK RPC and stops listening on unmount", async () => {
    window.history.replaceState({}, "", "/threads/thread-a");
    document.body.innerHTML = `<div data-ribbon-sidebar-root
      data-ribbon-sidebar-scope-grouping-key="builtin:projects"
      data-ribbon-sidebar-scope-group-id="project-a"></div>`;
    const app = await loadPluginApp(() => import("./app"));
    expect(app.threadLists).toHaveLength(0);
    expect(app.contentScripts).toHaveLength(0);
    const setWorkflowStage = vi.fn(() => ({ destination: { kind: "stay" } }));
    const slot = renderSlot(
      app.appOverlays[0]!,
      {},
      {
        rpc: {
          listAppKeybindings: () => ({ keybindings: [] }),
          setWorkflowStage,
        },
      },
    );
    const shortcut = () =>
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          code: "Period",
          key: ".",
          metaKey: true,
        }),
      );
    shortcut();
    await vi.waitFor(() =>
      expect(setWorkflowStage).toHaveBeenCalledWith({
        workflowStage: "Completed",
        threadId: "thread-a",
        scope: { groupingKey: "builtin:projects", groupId: "project-a" },
      }),
    );
    slot.lifecycle.unmount();
    shortcut();
    expect(setWorkflowStage).toHaveBeenCalledTimes(1);
  });
});
