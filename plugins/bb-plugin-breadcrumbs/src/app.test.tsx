// @vitest-environment jsdom
import {
  loadPluginApp,
  renderSlot,
} from "@get-bb/plugin-sdk/testing/app";
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
