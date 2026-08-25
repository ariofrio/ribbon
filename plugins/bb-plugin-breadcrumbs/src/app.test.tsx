// @vitest-environment jsdom
import {
  loadPluginApp,
  mountPluginContentScripts,
  renderSlot,
} from "@get-bb/plugin-sdk/testing/app";
import { fireEvent, waitFor } from "@testing-library/react";
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
});

afterEach(() => {
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

describe("project breadcrumb app registration", () => {
  it("registers the thread-header action through the plugin app contract", async () => {
    const app = await loadPluginApp(() => import("./app"));

    expect(app.threadHeaderActions).toHaveLength(1);
    expect(app.threadHeaderActions[0]).toMatchObject({
      id: "project-breadcrumb",
      title: "Breadcrumbs",
    });
  });

  it("registers the composer breadcrumb layout as a trusted content script", async () => {
    const app = await loadPluginApp(() => import("./app"));

    expect(app.contentScripts).toHaveLength(1);
    expect(app.contentScripts[0]?.id).toBe("composer-breadcrumbs");
  });

  it("puts Section and the native Project selector before New thread", async () => {
    document.body.innerHTML = `
      <div id="pane">
        <header>
          <div data-testid="app-page-header-content-row">
            <div><div id="header-center"><div id="new-thread-title"><p>New thread</p></div></div></div>
          </div>
        </header>
        <main>
          <div data-app-composer="" data-app-composer-role="primary">
            <div id="new-thread-options">
              <button data-promptbox-project-control="" aria-label="Project">bb-plugins</button>
              <button id="environment">Local</button>
            </div>
          </div>
        </main>
      </div>
    `;
    let sectionRequests = 0;
    let finishRefresh!: () => void;
    const refresh = new Promise<void>((resolve) => {
      finishRefresh = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const method = String(input).split("/").at(-1);
        if (method === "listSections" && sectionRequests++ > 0) {
          await refresh;
        }
        const result =
          method === "listCrumbs"
            ? {
                showSection: true,
                showProject: true,
                showAncestors: false,
                showComposerBreadcrumbs: true,
              }
            : { sections: [{ id: "sec_work", name: "Work" }] };
        return new Response(JSON.stringify({ ok: true, result }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );
    const app = await loadPluginApp(() => import("./app"));

    const scripts = await mountPluginContentScripts(app, {
      pluginId: "breadcrumbs",
      generation: 1,
    });

    await waitFor(() => {
      expect(
        document.querySelector(
          '[data-composer-breadcrumbs-root] [aria-label="Section"]',
        ),
      ).not.toBeNull();
    });
    const root = document.querySelector<HTMLElement>(
      "[data-composer-breadcrumbs-root]",
    )!;
    expect(root.nextElementSibling?.id).toBe("new-thread-title");
    expect(root.querySelector('[aria-label="Section"]')).not.toBeNull();
    expect(
      document.querySelector('[aria-label="Project"]')?.textContent,
    ).toBe("bb-plugins");
    expect(root.querySelectorAll('[data-icon="ChevronRight"]')).toHaveLength(2);
    expect(
      getComputedStyle(
        document.querySelector<HTMLElement>(
          "#new-thread-options [aria-label=Project]",
        )!,
      ).position,
    ).toBe("fixed");
    expect(document.querySelector("#new-thread-options #environment")).not.toBeNull();

    const section = root.querySelector<HTMLButtonElement>(
      '[aria-label="Section"]',
    )!;
    fireEvent.pointerDown(section, {
      button: 0,
      ctrlKey: false,
      pointerType: "mouse",
    });
    await waitFor(() => expect(sectionRequests).toBe(2));
    expect(section.disabled).toBe(false);
    expect(document.querySelector('[role="menuitem"]')?.textContent).toContain(
      "Work",
    );
    finishRefresh();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() =>
      expect(document.querySelector('[role="menuitem"]')).toBeNull(),
    );

    await scripts.lifecycle.dispose();
    expect(
      document.querySelector("#new-thread-options [aria-label=Project]"),
    ).not.toBeNull();
  });

  it("hides only the repeated project below an existing thread composer", async () => {
    document.body.innerHTML = `
      <div data-app-composer="" data-app-composer-role="primary">
        <div data-follow-up-composer-footer="">
          <div id="thread-project" title="Project: bb-plugins">bb-plugins</div>
          <div id="thread-environment" title="Environment: Local">Local</div>
        </div>
      </div>
    `;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const result = String(input).endsWith("/listCrumbs")
          ? {
              showSection: true,
              showProject: true,
              showAncestors: false,
              showComposerBreadcrumbs: true,
            }
          : { sections: [] };
        return new Response(JSON.stringify({ ok: true, result }));
      }),
    );
    const app = await loadPluginApp(() => import("./app"));
    const scripts = await mountPluginContentScripts(app, {
      pluginId: "breadcrumbs",
      generation: 1,
    });
    const project = document.querySelector<HTMLElement>("#thread-project")!;
    const environment = document.querySelector<HTMLElement>(
      "#thread-environment",
    )!;

    await waitFor(() => expect(project.hidden).toBe(true));
    expect(environment.hidden).toBe(false);

    await scripts.lifecycle.dispose();
    expect(project.hidden).toBe(false);
  });

  it("leaves both composer layouts native when the option is disabled", async () => {
    document.body.innerHTML = `
      <div id="pane">
        <header><div data-testid="app-page-header-content-row"><div><div><div><p>New thread</p></div></div></div></div></header>
        <div data-app-composer="" data-app-composer-role="primary">
          <div id="native-options"><button aria-label="Project" data-promptbox-project-control="">bb-plugins</button></div>
        </div>
      </div>
    `;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const result = String(input).endsWith("/listCrumbs")
          ? {
              showSection: true,
              showProject: true,
              showAncestors: false,
              showComposerBreadcrumbs: false,
            }
          : { sections: [] };
        return new Response(JSON.stringify({ ok: true, result }));
      }),
    );
    const app = await loadPluginApp(() => import("./app"));
    const scripts = await mountPluginContentScripts(app, {
      pluginId: "breadcrumbs",
      generation: 1,
    });

    expect(document.querySelector("[data-composer-breadcrumbs-root]")).toBeNull();
    expect(
      document.querySelector("#native-options [aria-label=Project]"),
    ).not.toBeNull();

    await scripts.lifecycle.dispose();
  });

  it("draws the whole trail from one settled answer", async () => {
    document.body.innerHTML = `
      <header>
        <div><div><p>Thread title</p></div><span data-testid="thread-detail-header-actions-menu"></span></div>
        <span id="slot-wrapper" role="group"></span>
      </header>
    `;
    const app = await loadPluginApp(() => import("./app"));
    const action = app.threadHeaderActions[0]!;
    const wrapper = document.querySelector("#slot-wrapper")!;
    const slot = renderSlot(
      action,
      {
        threadId: "thread-1",
        projectId: "project-1",
        isCompactViewport: false,
      },
      {
        rpc: {
          // Deliberately the only source: the sidebar's live view is left
          // empty, because the crumb must not depend on it having hydrated.
          trailForThread: () => ({
            section: { id: "sec_1", name: "Example" },
            project: { id: "project-1", name: "Example project", isPersonal: false },
            ancestors: [{ id: "thread-0", title: "Parent thread" }],
          }),
        },
        sidebarThreads: { projects: [], threads: [] },
        settings: { showAncestors: true },
      },
    );
    wrapper.append(slot.container);

    expect(
      await slot.findByRole("button", { name: "Example actions" }),
    ).toBeTruthy();
    expect(
      await slot.findByRole("button", { name: "Example project actions" }),
    ).toBeTruthy();
    expect(await slot.findByTitle("Parent thread")).toBeTruthy();
    slot.lifecycle.unmount();
  });

  it("leaves an anchor before each crumb for the Icons plugin to fill", async () => {
    document.body.innerHTML = `
      <header>
        <div><div><p>Thread title</p></div><span data-testid="thread-detail-header-actions-menu"></span></div>
        <span id="slot-wrapper" role="group"></span>
      </header>
    `;
    const app = await loadPluginApp(() => import("./app"));
    const action = app.threadHeaderActions[0]!;
    const wrapper = document.querySelector("#slot-wrapper")!;
    const slot = renderSlot(
      action,
      { threadId: "thread-1", projectId: "project-1", isCompactViewport: false },
      {
        rpc: {
          trailForThread: () => ({
            section: { id: "sec_1", name: "Example" },
            project: { id: "project-1", name: "Example project", isPersonal: false },
            ancestors: [],
          }),
        },
        sidebarThreads: { projects: [], threads: [] },
      },
    );
    wrapper.append(slot.container);
    await slot.findByRole("button", { name: "Example project actions" });

    // The neighbour finds its place by these attributes alone, so the pair of
    // them — kind and owner, one per crumb, in crumb order — is the contract.
    const anchors = Array.from(
      document.querySelectorAll("[data-breadcrumb-icon-anchor]"),
    ).map((node) => [
      node.getAttribute("data-breadcrumb-icon-anchor"),
      node.getAttribute("data-breadcrumb-icon-owner"),
    ]);

    expect(anchors).toEqual([
      ["section", "sec_1"],
      ["project", "project-1"],
    ]);
    slot.lifecycle.unmount();
  });

  it("draws nothing for a personal-project thread with no section or parent", async () => {
    document.body.innerHTML = `
      <header>
        <div><div><p>Thread title</p></div><span data-testid="thread-detail-header-actions-menu"></span></div>
        <span id="slot-wrapper" role="group"></span>
      </header>
    `;
    const app = await loadPluginApp(() => import("./app"));
    const action = app.threadHeaderActions[0]!;
    const wrapper = document.querySelector("#slot-wrapper")!;
    const slot = renderSlot(
      action,
      { threadId: "thread-1", projectId: "proj_personal", isCompactViewport: false },
      {
        rpc: {
          trailForThread: () => ({
            section: null,
            project: { id: "proj_personal", name: "Personal", isPersonal: true },
            ancestors: [],
          }),
        },
        sidebarThreads: { projects: [], threads: [] },
      },
    );
    wrapper.append(slot.container);
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(document.querySelector("[data-breadcrumbs-root]")).toBeNull();
    slot.lifecycle.unmount();
  });

  it("leaves the ancestors out until the setting asks for them", async () => {
    document.body.innerHTML = `
      <header>
        <div><div><p>Thread title</p></div><span data-testid="thread-detail-header-actions-menu"></span></div>
        <span id="slot-wrapper" role="group"></span>
      </header>
    `;
    const app = await loadPluginApp(() => import("./app"));
    const action = app.threadHeaderActions[0]!;
    const wrapper = document.querySelector("#slot-wrapper")!;
    // No settings at all, which is what the header sees while they load and
    // what an untouched install settles on, since the ancestors default off.
    const slot = renderSlot(
      action,
      { threadId: "thread-1", projectId: "project-1", isCompactViewport: false },
      {
        rpc: {
          trailForThread: () => ({
            section: null,
            project: { id: "project-1", name: "Example project", isPersonal: false },
            ancestors: [{ id: "thread-0", title: "Parent thread" }],
          }),
        },
        sidebarThreads: { projects: [], threads: [] },
      },
    );
    wrapper.append(slot.container);

    expect(
      await slot.findByRole("button", { name: "Example project actions" }),
    ).toBeTruthy();
    expect(slot.queryByTitle("Parent thread")).toBeNull();
    slot.lifecycle.unmount();
  });
});
