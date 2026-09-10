// @vitest-environment jsdom
import { CircleIcon } from "@hugeicons/core-free-icons";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { cleanup, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
  const styles = document.createElement("style");
  styles.dataset.cursorTestStyles = "";
  styles.textContent = `
    .cursor-pointer { cursor: pointer; }
    .size-7 { width: 28px; height: 28px; }
  `;
  document.head.append(styles);
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  document.head.querySelector("[data-cursor-test-styles]")?.remove();
});

describe("project icon app registration", () => {
  it("registers one thread-header action through the plugin app contract", async () => {
    const app = await loadPluginApp(() => import("./app"));

    expect(app.threadHeaderActions).toHaveLength(1);
    expect(app.threadHeaderActions[0]).toMatchObject({
      id: "project-icon",
      title: "Project icon",
    });
  });

  it("matches the standard header control size and cursor", async () => {
    document.body.innerHTML = `
      <header>
        <div>
          <div><p>Thread title</p></div>
          <span id="slot-wrapper" role="group"></span>
          <button data-testid="thread-detail-header-actions-menu"></button>
        </div>
      </header>
    `;
    const app = await loadPluginApp(() => import("./app"));
    const action = app.threadHeaderActions[0]!;
    const wrapper = document.querySelector("#slot-wrapper")!;
    const slot = renderSlot(
      action,
      {
        threadId: "thread-1",
        projectId: "missing-project",
        isCompactViewport: false,
      },
      {
        rpc: {
          listIcons: () => ({
            icons: [],
            defaults: {
              project: CircleIcon,
              personal: CircleIcon,
              section: CircleIcon,
            },
          }),
        },
        sidebarThreads: {
          projects: [
            { id: "project-1", name: "Example project", isPersonal: false },
          ],
        },
      },
    );
    wrapper.append(slot.container);
    slot.lifecycle.rerender(
      createElement(action.component, {
        threadId: "thread-1",
        projectId: "project-1",
        isCompactViewport: false,
      }),
    );

    const trigger = await screen.findByRole("button", {
      name: "Icon for Example project",
    });
    const style = getComputedStyle(trigger);
    expect(style.cursor).toBe("pointer");
    expect(style.width).toBe("28px");
    expect(style.height).toBe("28px");
    slot.lifecycle.unmount();
  });
});

describe("sidebar icon overlay", () => {
  it("draws through SDK RPC and removes its icons and stylesheet on unmount", async () => {
    document.body.innerHTML = `
      <div data-sidebar-project-id="proj_1">
        <div data-sidebar="group-label"><span><span title="Storefront">Storefront</span></span></div>
      </div>`;
    const app = await loadPluginApp(() => import("./app"));
    expect(app.appOverlays).toHaveLength(1);
    expect(app.contentScripts).toHaveLength(0);
    const slot = renderSlot(
      app.appOverlays[0]!,
      {},
      {
        settings: { showInSidebar: true },
        rpc: {
          listIcons: () => ({
            icons: [],
            defaults: {
              project: CircleIcon,
              personal: CircleIcon,
              section: CircleIcon,
            },
          }),
        },
      },
    );
    await screen.findByRole("button", { name: "Icon for Storefront" });
    await vi.waitFor(() =>
      expect(document.head.querySelector("[data-ribbon-icons]")).not.toBeNull(),
    );
    slot.lifecycle.unmount();
    expect(
      screen.queryByRole("button", { name: "Icon for Storefront" }),
    ).toBeNull();
    expect(document.head.querySelector("[data-ribbon-icons]")).toBeNull();
  });
  it("refreshes icons from realtime even when no thread header is mounted", async () => {
    const app = await loadPluginApp(() => import("./app"));
    let icons: Array<{
      kind: "project";
      id: string;
      icon: string;
      color: "blue";
      glyph: typeof CircleIcon;
    }> = [];
    const slot = renderSlot(
      app.appOverlays[0]!,
      {},
      {
        settings: { showInSidebar: false },
        rpc: {
          listIcons: () => ({
            icons,
            defaults: {
              project: CircleIcon,
              personal: CircleIcon,
              section: CircleIcon,
            },
          }),
        },
      },
    );
    await vi.waitFor(() =>
      expect(document.head.querySelector("[data-ribbon-icons]")).not.toBeNull(),
    );
    icons = [
      {
        kind: "project",
        id: "remote-project",
        icon: "circle",
        color: "blue",
        glyph: CircleIcon,
      },
    ];
    await slot.behavior.emitRealtime("icons-changed", {
      kind: "project",
      id: "remote-project",
    });
    await vi.waitFor(() =>
      expect(
        document.head.querySelector("[data-ribbon-icons]")?.textContent,
      ).toContain("remote-project"),
    );
    slot.lifecycle.unmount();
  });
});
