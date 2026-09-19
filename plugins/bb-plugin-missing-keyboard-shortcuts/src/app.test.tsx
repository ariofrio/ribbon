// @vitest-environment jsdom
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import type { PluginCommandRegistration } from "@get-bb/plugin-sdk/app";
import { cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readSideChatPanelSnapshot } from "./terminal-panel-state";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("missing keyboard shortcuts app registration", () => {
  function commands(
    app: Awaited<ReturnType<typeof loadPluginApp>>,
  ): PluginCommandRegistration[] {
    return (
      app as typeof app & {
        commandPaletteActions: PluginCommandRegistration[];
      }
    ).commandPaletteActions;
  }

  it("registers rebindable commands, its composer bridge, and its overlay", async () => {
    const app = await loadPluginApp(() => import("./app"));

    expect(
      commands(app).map(({ defaultShortcut, id }) => ({
        defaultShortcut,
        id,
      })),
    ).toMatchObject([
      { id: "navigate-back", defaultShortcut: { key: "[", mod: true } },
      { id: "navigate-forward", defaultShortcut: { key: "]", mod: true } },
      { id: "new-personal-thread", defaultShortcut: { key: "n", mod: true } },
      {
        id: "new-project-thread",
        defaultShortcut: { key: "n", mod: true, shift: true },
      },
      {
        id: "focus-primary-composer",
        defaultShortcut: { key: "l", mod: true },
      },
      {
        id: "toggle-side-chat",
        defaultShortcut: { key: "l", mod: true, shift: true },
      },
      {
        id: "toggle-terminal",
        defaultShortcut: { control: true, key: "`" },
      },
    ]);
    expect(app.composerCustomizations).toHaveLength(1);
    expect(app.composerCustomizations[0]).toMatchObject({
      id: "navigation-bridge",
    });
    expect(app.appOverlays).toHaveLength(1);
    expect(app.appOverlays[0]).toMatchObject({
      id: "missing-keyboard-shortcuts",
    });
  });

  it("opens a project thread when its registered command runs", async () => {
    const app = await loadPluginApp(() => import("./app"));
    const slot = renderSlot(
      app.appOverlays[0]!,
      {},
      { context: { projectId: "project-a", threadId: "thread-a" } },
    );
    expect(
      document.querySelector("[data-missing-keyboard-shortcuts-ready]"),
    ).not.toBeNull();

    const command = commands(app).find(
      ({ id }) => id === "new-project-thread",
    );
    expect(command).toBeDefined();
    await command?.run({
      openPanel: () => false,
      projectId: "project-a",
      threadId: "thread-a",
    });

    expect(slot.inspection.sidebarActionCalls).toContainEqual({
      method: "openNewThread",
      options: { focusPrompt: true, projectId: "project-a" },
    });
    slot.lifecycle.unmount();
  });

  it("uses the command context while the overlay route context catches up", async () => {
    const app = await loadPluginApp(() => import("./app"));
    const createSideChat = vi.fn(() => ({ threadId: "side-chat-a" }));
    const slot = renderSlot(
      app.appOverlays[0]!,
      {},
      {
        context: { projectId: null, threadId: null },
        rpc: { createSideChat },
      },
    );
    const command = commands(app).find(({ id }) => id === "toggle-side-chat");

    await command?.run({
      openPanel: () => false,
      projectId: "project-a",
      threadId: "thread-a",
    });

    await vi.waitFor(() =>
      expect(createSideChat).toHaveBeenCalledWith({
        sourceThreadId: "thread-a",
      }),
    );
    await vi.waitFor(() =>
      expect(readSideChatPanelSnapshot(window.localStorage, "thread-a")).toMatchObject(
        {
          activeSideChat: { childThreadId: "side-chat-a" },
          isOpen: true,
        },
      ),
    );
    slot.lifecycle.unmount();
  });
});
