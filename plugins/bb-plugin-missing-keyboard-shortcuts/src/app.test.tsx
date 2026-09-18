// @vitest-environment jsdom
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("missing keyboard shortcuts app registration", () => {
  it("registers its composer bridge and lifecycle-managed overlay", async () => {
    const app = await loadPluginApp(() => import("./app"));

    expect(app.composerCustomizations).toHaveLength(1);
    expect(app.composerCustomizations[0]).toMatchObject({
      id: "navigation-bridge",
    });
    expect(app.appOverlays).toHaveLength(1);
    expect(app.appOverlays[0]).toMatchObject({
      id: "missing-keyboard-shortcuts",
    });
  });

  it("opens a project thread through the public sidebar action", async () => {
    const app = await loadPluginApp(() => import("./app"));
    const slot = renderSlot(
      app.appOverlays[0]!,
      {},
      { context: { projectId: "project-a", threadId: "thread-a" } },
    );

    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        key: "n",
        metaKey: true,
        shiftKey: true,
      }),
    );

    expect(slot.inspection.sidebarActionCalls).toContainEqual({
      method: "openNewThread",
      options: { focusPrompt: true, projectId: "project-a" },
    });
    slot.lifecycle.unmount();
  });
});
