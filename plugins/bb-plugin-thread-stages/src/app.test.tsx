// @vitest-environment jsdom
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import type { PluginCommandRegistration } from "@get-bb/plugin-sdk/app";
import { cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  cleanup();
  window.history.replaceState({}, "", "/");
  document.body.replaceChildren();
});

describe("thread stages overlay", () => {
  function commands(
    app: Awaited<ReturnType<typeof loadPluginApp>>,
  ): PluginCommandRegistration[] {
    return (
      app as typeof app & {
        commandPaletteActions: PluginCommandRegistration[];
      }
    ).commandPaletteActions;
  }

  it("registers every stage and reorder shortcut as a rebindable command", async () => {
    const app = await loadPluginApp(() => import("./app"));

    expect(
      commands(app).map(({ defaultShortcut, id }) => ({
        defaultShortcut,
        id,
      })),
    ).toMatchObject([
      { id: "complete-thread", defaultShortcut: { key: ".", mod: true } },
      {
        id: "complete-thread-alternate",
        defaultShortcut: { alt: true, key: ".", mod: true },
      },
      {
        id: "idle-thread",
        defaultShortcut: { key: ".", mod: true, shift: true },
      },
      {
        id: "block-thread",
        defaultShortcut: { control: true, key: ".", mod: true, shift: true },
      },
      {
        id: "defer-thread",
        defaultShortcut: { control: true, key: ".", mod: true },
      },
      {
        id: "move-up",
        defaultShortcut: { alt: true, key: "ArrowUp", mod: true },
      },
      {
        id: "move-down",
        defaultShortcut: { alt: true, key: "ArrowDown", mod: true },
      },
      {
        id: "move-to-start",
        defaultShortcut: {
          alt: true,
          key: "ArrowUp",
          mod: true,
          shift: true,
        },
      },
      {
        id: "move-to-end",
        defaultShortcut: {
          alt: true,
          key: "ArrowDown",
          mod: true,
          shift: true,
        },
      },
      {
        id: "move-to-previous-stage",
        defaultShortcut: { control: true, key: "ArrowUp", mod: true },
      },
      {
        id: "move-to-next-stage",
        defaultShortcut: { control: true, key: "ArrowDown", mod: true },
      },
    ]);
    expect(
      commands(app).every(
        ({ isAvailable }) =>
          isAvailable?.({
            openPanel: () => false,
            projectId: null,
            threadId: null,
          }) === false,
      ),
    ).toBe(true);
  });

  it("makes commands for disabled stages unavailable", async () => {
    const app = await loadPluginApp(() => import("./app"));
    const slot = renderSlot(
      app.appOverlays[0]!,
      {},
      {
        settings: {
          showBlockedStage: false,
          showDeferredStage: false,
        },
      },
    );
    const context = {
      openPanel: () => false,
      projectId: "project-a",
      threadId: "thread-a",
    };

    expect(
      commands(app).find(({ id }) => id === "complete-thread")?.isAvailable?.(
        context,
      ),
    ).toBe(true);
    expect(
      commands(app).find(({ id }) => id === "block-thread")?.isAvailable?.(
        context,
      ),
    ).toBe(false);
    expect(
      commands(app).find(({ id }) => id === "defer-thread")?.isAvailable?.(
        context,
      ),
    ).toBe(false);

    slot.lifecycle.unmount();
  });

  it("moves the scoped thread through SDK RPC when the command runs", async () => {
    window.history.replaceState({}, "", "/threads/thread-a");
    document.body.innerHTML = `<div data-ribbon-sidebar-root
      data-ribbon-sidebar-scope-grouping-key="builtin:projects"
      data-ribbon-sidebar-scope-group-id="project-a"></div>`;
    const app = await loadPluginApp(() => import("./app"));
    expect(app.threadLists).toHaveLength(0);
    expect(app.contentScripts).toHaveLength(0);
    const setWorkflowStage = vi.fn(() => ({ destination: { kind: "compose" } }));
    const slot = renderSlot(
      app.appOverlays[0]!,
      {},
      {
        context: { projectId: "project-a", threadId: "thread-a" },
        rpc: {
          setWorkflowStage,
        },
      },
    );
    const command = commands(app).find(({ id }) => id === "complete-thread");
    expect(command).toBeDefined();
    await command?.run({
      openPanel: () => false,
      projectId: "project-a",
      threadId: "thread-a",
    });
    await vi.waitFor(() =>
      expect(setWorkflowStage).toHaveBeenCalledWith({
        workflowStage: "Completed",
        threadId: "thread-a",
        scope: { groupingKey: "builtin:projects", groupId: "project-a" },
      }),
    );
    await vi.waitFor(() =>
      expect(slot.inspection.navigateCalls).toContainEqual({
        method: "toCompose",
        options: { focusPrompt: true },
      }),
    );
    slot.lifecycle.unmount();
  });
});
