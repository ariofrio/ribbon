// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type {
  PluginSidebarThread,
  PluginSidebarThreadActions,
} from "@get-bb/plugin-sdk/app";
import {
  ThreadActionsContextMenu,
  ThreadActionsDropdown,
} from "./ThreadActionsMenu";
import { CompactViewportOverrideProvider } from "@/vendor/components/ui/hooks/use-compact-viewport";

function thread(): PluginSidebarThread {
  return {
    id: "thr_1",
    projectId: "proj_1",
    title: "Sidebar parity",
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
    indicator: "none",
    indicatorLabel: null,
    isUnread: true,
    isPinned: false,
    isArchived: false,
    environment: null,
    host: null,
    createdAt: 1,
    updatedAt: 1,
    lastReadAt: null,
    latestAttentionAt: 1,
  };
}

afterEach(cleanup);

function expectMenuItemIcon(label: string, iconName: string): void {
  const item = screen.getByText(label).closest('[role="menuitem"]');
  expect(item?.querySelector(`[data-icon="${iconName}"]`)).not.toBeNull();
}

/** jsdom paints nothing, so only the name a row writes is readable here. */
function expectSectionIcon(label: string, sectionId: string): void {
  const item = screen.getByText(label).closest('[role="menuitem"]');
  expect(
    item?.querySelector(
      `[data-ribbon-icons-section="${sectionId}"][data-thread-stages-icon="section"]`,
    ),
  ).not.toBeNull();
}

describe("ThreadActionsDropdown", () => {
  it("mirrors the built-in thread actions and adds workflow organization", () => {
    const actions = {
      open: vi.fn(),
      openNewThread: vi.fn(),
      setPinned: vi.fn(async () => {}),
      setRead: vi.fn(async () => {}),
      rename: vi.fn(async () => {}),
      archive: vi.fn(),
      requestDelete: vi.fn(),
    } satisfies PluginSidebarThreadActions;
    render(
      <ThreadActionsDropdown
        actions={actions}
        disabled={false}
        sections={[
          { id: "section_1", name: "Now" },
          { id: "section_2", name: "Later" },
        ]}
        onNewSection={vi.fn()}
        onOpenChange={vi.fn()}
        onRename={vi.fn()}
        onSetSection={vi.fn()}
        onSetWorkflowStage={vi.fn()}
        splitAvailable
        workflowStage="Idle"
        thread={thread()}
      />,
    );

    const trigger = screen.getByLabelText("Thread actions");
    expect(trigger.className).toContain("cursor-pointer");
    fireEvent.keyDown(trigger, { key: "Enter" });
    expect(screen.getByText("Open in split")).toBeDefined();
    expect(screen.getByText("Mark read")).toBeDefined();
    expect(screen.getByText("Pin")).toBeDefined();
    expect(screen.getByText("Rename")).toBeDefined();
    const moveToStageItem = screen
      .getByText("Move to stage")
      .closest('[role="menuitem"]');
    expect(
      moveToStageItem?.querySelector("svg")?.getAttribute("data-icon"),
    ).toBe("Progress02");
    const moveToSectionItem = screen
      .getByText("Move to section")
      .closest('[role="menuitem"]');
    expect(
      moveToSectionItem?.querySelector("svg")?.getAttribute("data-icon"),
    ).toBe("ListView");
    const organizationItems = screen
      .getAllByRole("menuitem")
      .map((item) => item.textContent?.trim());
    expect(organizationItems.indexOf("Move to stage")).toBeLessThan(
      organizationItems.indexOf("Move to section"),
    );
    expect(screen.queryByText("Set workflow stage")).toBeNull();
    expect(screen.queryByText("Move up")).toBeNull();
    expect(screen.queryByText("Move down")).toBeNull();
    expect(screen.getByText("Archive")).toBeDefined();
    expect(screen.getByText("Delete")).toBeDefined();
  }, 10_000);

  it("does not offer workflow stage controls for a child thread", () => {
    const actions = {
      open: vi.fn(),
      openNewThread: vi.fn(),
      setPinned: vi.fn(async () => {}),
      setRead: vi.fn(async () => {}),
      rename: vi.fn(async () => {}),
      archive: vi.fn(),
      requestDelete: vi.fn(),
    } satisfies PluginSidebarThreadActions;
    render(
      <ThreadActionsDropdown
        actions={actions}
        disabled={false}
        sections={[]}
        onNewSection={vi.fn()}
        onOpenChange={vi.fn()}
        onRename={vi.fn()}
        onSetSection={vi.fn()}
        onSetWorkflowStage={vi.fn()}
        splitAvailable={false}
        workflowStage={null}
        thread={{ ...thread(), parentThreadId: "thr_parent" }}
      />,
    );

    fireEvent.keyDown(screen.getByLabelText("Thread actions"), {
      key: "Enter",
    });
    expect(screen.queryByText("Move to stage")).toBeNull();
    expect(screen.getByText("Move to section")).toBeDefined();
  });

  it("keeps organization submenus available on compact viewports", () => {
    const actions = {
      open: vi.fn(),
      openNewThread: vi.fn(),
      setPinned: vi.fn(async () => {}),
      setRead: vi.fn(async () => {}),
      rename: vi.fn(async () => {}),
      archive: vi.fn(),
      requestDelete: vi.fn(),
    } satisfies PluginSidebarThreadActions;
    render(
      <CompactViewportOverrideProvider isCompactViewport>
        <ThreadActionsDropdown
          actions={actions}
          disabled={false}
          sections={[{ id: "section_1", name: "Later" }]}
          onNewSection={vi.fn()}
          onOpenChange={vi.fn()}
          onRename={vi.fn()}
          onSetSection={vi.fn()}
          onSetWorkflowStage={vi.fn()}
          splitAvailable={false}
          workflowStage="Idle"
          thread={thread()}
        />
      </CompactViewportOverrideProvider>,
    );

    fireEvent.keyDown(screen.getByLabelText("Thread actions"), {
      key: "Enter",
    });
    expect(screen.getByText("Move to stage")).toBeDefined();
    expect(screen.getByText("Move to section")).toBeDefined();
  });

  it("sets, clears, and creates sections from its submenu", () => {
    const onNewSection = vi.fn();
    const onSetSection = vi.fn();
    const actions = {
      open: vi.fn(),
      openNewThread: vi.fn(),
      setPinned: vi.fn(async () => {}),
      setRead: vi.fn(async () => {}),
      rename: vi.fn(async () => {}),
      archive: vi.fn(),
      requestDelete: vi.fn(),
    } satisfies PluginSidebarThreadActions;
    const view = render(
      <ThreadActionsDropdown
        actions={actions}
        disabled={false}
        sections={[
          { id: "section_1", name: "Now" },
          { id: "section_2", name: "Later" },
        ]}
        onNewSection={onNewSection}
        onOpenChange={vi.fn()}
        onRename={vi.fn()}
        onSetSection={onSetSection}
        onSetWorkflowStage={vi.fn()}
        splitAvailable={false}
        workflowStage="Idle"
        thread={{ ...thread(), sectionId: "section_1" }}
      />,
    );

    fireEvent.keyDown(screen.getByLabelText("Thread actions"), {
      key: "Enter",
    });
    fireEvent.click(screen.getByText("Move to section"));
    const sectionMenu = screen.getByText("New section").closest('[role="menu"]');
    expect(
      Array.from(sectionMenu?.querySelectorAll('[role="menuitem"]') ?? []).map(
        (item) => item.textContent,
      ),
    ).toEqual(["Now", "Later", "Unorganized", "New section"]);
    expect(sectionMenu?.querySelectorAll('[role="separator"]')).toHaveLength(0);
    expect(screen.getByText("Unorganized")).toBeDefined();
    expect(screen.getByText("Now")).toBeDefined();
    expect(screen.getByText("Later")).toBeDefined();
    expectMenuItemIcon("Unorganized", "ListViewOff");
    expectSectionIcon("Now", "section_1");
    expectSectionIcon("Later", "section_2");
    const newSectionItem = screen
      .getByText("New section")
      .closest('[role="menuitem"]');
    expect(newSectionItem?.className).toContain("pl-8");
    expect(
      newSectionItem?.querySelector("svg")?.getAttribute("data-icon"),
    ).toBe("SectionAdd");
    fireEvent.click(screen.getByText("Later"));
    expect(onSetSection).toHaveBeenCalledWith("section_2");

    fireEvent.keyDown(screen.getByLabelText("Thread actions"), {
      key: "Enter",
    });
    fireEvent.click(screen.getByText("Move to section"));
    fireEvent.click(screen.getByText("Unorganized"));
    expect(onSetSection).toHaveBeenCalledWith(null);

    view.rerender(
      <ThreadActionsDropdown
        actions={actions}
        disabled={false}
        sections={[
          { id: "section_1", name: "Now" },
          { id: "section_2", name: "Later" },
        ]}
        onNewSection={onNewSection}
        onOpenChange={vi.fn()}
        onRename={vi.fn()}
        onSetSection={onSetSection}
        onSetWorkflowStage={vi.fn()}
        splitAvailable={false}
        workflowStage="Idle"
        thread={thread()}
      />,
    );
    fireEvent.keyDown(screen.getByLabelText("Thread actions"), {
      key: "Enter",
    });
    fireEvent.click(screen.getByText("Move to section"));
    fireEvent.click(screen.getByText("Unorganized"));
    expect(onSetSection).toHaveBeenCalledTimes(2);

    fireEvent.keyDown(screen.getByLabelText("Thread actions"), {
      key: "Enter",
    });
    fireEvent.click(screen.getByText("Move to section"));
    fireEvent.click(screen.getByText("New section"));
    expect(onNewSection).toHaveBeenCalledOnce();
  });

  it("shows the shared stage icons in its stage submenu", () => {
    const actions = {
      open: vi.fn(),
      openNewThread: vi.fn(),
      setPinned: vi.fn(async () => {}),
      setRead: vi.fn(async () => {}),
      rename: vi.fn(async () => {}),
      archive: vi.fn(),
      requestDelete: vi.fn(),
    } satisfies PluginSidebarThreadActions;
    render(
      <ThreadActionsDropdown
        actions={actions}
        disabled={false}
        sections={[]}
        onNewSection={vi.fn()}
        onOpenChange={vi.fn()}
        onRename={vi.fn()}
        onSetSection={vi.fn()}
        onSetWorkflowStage={vi.fn()}
        splitAvailable={false}
        workflowStage="Idle"
        thread={thread()}
      />,
    );

    fireEvent.keyDown(screen.getByLabelText("Thread actions"), {
      key: "Enter",
    });
    fireEvent.click(screen.getByText("Move to stage"));

    expectMenuItemIcon("Deferred", "CircleDashed");
    expectMenuItemIcon("Idle", "Progress01");
    expectMenuItemIcon("Active", "Progress02");
    expectMenuItemIcon("Blocked", "BlockedProgress");
    expectMenuItemIcon("Completed", "CompletedProgress");
  });

  it("omits disabled stages from its stage submenu", () => {
    const actions = {
      open: vi.fn(),
      openNewThread: vi.fn(),
      setPinned: vi.fn(async () => {}),
      setRead: vi.fn(async () => {}),
      rename: vi.fn(async () => {}),
      archive: vi.fn(),
      requestDelete: vi.fn(),
    } satisfies PluginSidebarThreadActions;
    render(
      <ThreadActionsDropdown
        actions={actions}
        disabled={false}
        sections={[]}
        onNewSection={vi.fn()}
        onOpenChange={vi.fn()}
        onRename={vi.fn()}
        onSetSection={vi.fn()}
        onSetWorkflowStage={vi.fn()}
        splitAvailable={false}
        workflowStage="Idle"
        workflowStages={["Idle", "Active", "Completed"]}
        thread={thread()}
      />,
    );

    fireEvent.keyDown(screen.getByLabelText("Thread actions"), {
      key: "Enter",
    });
    fireEvent.click(screen.getByText("Move to stage"));

    expect(screen.queryByText("Deferred")).toBeNull();
    expect(screen.queryByText("Blocked")).toBeNull();
    expect(screen.getByText("Idle")).toBeDefined();
    expect(screen.getByText("Active")).toBeDefined();
    expect(screen.getByText("Completed")).toBeDefined();
  });
});

describe("ThreadActionsContextMenu", () => {
  it("portals the workflow stage submenu outside the parent menu", () => {
    const actions = {
      open: vi.fn(),
      openNewThread: vi.fn(),
      setPinned: vi.fn(async () => {}),
      setRead: vi.fn(async () => {}),
      rename: vi.fn(async () => {}),
      archive: vi.fn(),
      requestDelete: vi.fn(),
    } satisfies PluginSidebarThreadActions;
    render(
      <ThreadActionsContextMenu
        actions={actions}
        disabled={false}
        sections={[]}
        onNewSection={vi.fn()}
        onOpenChange={vi.fn()}
        onRename={vi.fn()}
        onSetSection={vi.fn()}
        onSetWorkflowStage={vi.fn()}
        splitAvailable
        workflowStage="Idle"
        thread={thread()}
      >
        <button type="button">Thread row</button>
      </ThreadActionsContextMenu>,
    );

    fireEvent.contextMenu(screen.getByRole("button", { name: "Thread row" }));
    const parentMenu = screen.getByRole("menu", { name: "Thread actions" });
    fireEvent.click(screen.getByText("Move to stage"));

    expect(parentMenu.contains(screen.getByText("Completed"))).toBe(false);
    expectMenuItemIcon("Completed", "CompletedProgress");
  });

  it("portals the section submenu outside the right-click menu", () => {
    const actions = {
      open: vi.fn(),
      openNewThread: vi.fn(),
      setPinned: vi.fn(async () => {}),
      setRead: vi.fn(async () => {}),
      rename: vi.fn(async () => {}),
      archive: vi.fn(),
      requestDelete: vi.fn(),
    } satisfies PluginSidebarThreadActions;
    render(
      <ThreadActionsContextMenu
        actions={actions}
        disabled={false}
        sections={[{ id: "section_1", name: "Later" }]}
        onNewSection={vi.fn()}
        onOpenChange={vi.fn()}
        onRename={vi.fn()}
        onSetSection={vi.fn()}
        onSetWorkflowStage={vi.fn()}
        splitAvailable
        workflowStage="Idle"
        thread={thread()}
      >
        <button type="button">Thread row</button>
      </ThreadActionsContextMenu>,
    );

    fireEvent.contextMenu(screen.getByRole("button", { name: "Thread row" }));
    const parentMenu = screen.getByRole("menu", { name: "Thread actions" });
    fireEvent.click(screen.getByText("Move to section"));

    const sectionMenu = screen.getByText("New section").closest('[role="menu"]');
    expect(
      Array.from(sectionMenu?.querySelectorAll('[role="menuitem"]') ?? []).map(
        (item) => item.textContent,
      ),
    ).toEqual(["Later", "Unorganized", "New section"]);
    expect(sectionMenu?.querySelectorAll('[role="separator"]')).toHaveLength(0);
    expect(
      screen.getByText("New section").closest('[role="menuitem"]')?.className,
    ).toContain("pl-8");

    expect(screen.getByText("Unorganized")).toBeDefined();
    expect(screen.getByText("Later")).toBeDefined();
    expect(screen.getByText("New section")).toBeDefined();
    expectMenuItemIcon("Unorganized", "ListViewOff");
    expectSectionIcon("Later", "section_1");
    expect(parentMenu.contains(screen.getByText("New section"))).toBe(false);
  });
});
