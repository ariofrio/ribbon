import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import plugin from "./server";

const disposeHosts: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(disposeHosts.splice(0).map((dispose) => dispose()));
});

function createPluginHarness() {
  const host = createFakePluginHost({ pluginId: "icons" });
  plugin(host.bb);
  disposeHosts.push(() => host.harness.lifecycle.dispose());
  return host.harness;
}

describe("icon plugin API", () => {
  it("registers its RPC methods and cleanup service", () => {
    const harness = createPluginHarness();

    expect(harness.inspection.registrations.rpcMethods).toEqual([
      "listIconCatalog",
      "listIcons",
      "listPlacements",
      "setIcon",
      "clearIcon",
    ]);
    expect(harness.inspection.registrations.services).toHaveLength(1);
    expect(harness.inspection.registrations.services[0]?.name).toBe(
      "icon-cleanup",
    );
  });

  it("persists a project icon through the schema-validated RPC boundary", async () => {
    const harness = createPluginHarness();

    const updated = await harness.behavior.callRpc("setIcon", {
      kind: "project",
      id: "proj_example",
      icon: "folder-01",
      color: "purple",
    });

    expect(updated).toMatchObject({
      icons: [
        {
          kind: "project",
          id: "proj_example",
          icon: "folder-01",
          color: "purple",
        },
      ],
    });
    expect(harness.inspection.realtimeSignals).toEqual([
      {
        channel: "icons-changed",
        payload: { kind: "project", id: "proj_example" },
      },
    ]);
  });

  it("keeps a section's icon apart from a project's", async () => {
    const harness = createPluginHarness();

    await harness.behavior.callRpc("setIcon", {
      kind: "project",
      id: "shared",
      icon: "folder-01",
      color: null,
    });
    const updated = (await harness.behavior.callRpc("setIcon", {
      kind: "section",
      id: "shared",
      icon: "rocket",
      color: "teal",
    })) as { icons: Array<{ kind: string; id: string; icon: string }> };

    expect(
      updated.icons.map(({ kind, id, icon }) => ({ kind, id, icon })),
    ).toEqual([
      { kind: "project", id: "shared", icon: "folder-01" },
      { kind: "section", id: "shared", icon: "rocket" },
    ]);
  });

  it("ships a drawing for the section default so consumers need no catalog", async () => {
    const harness = createPluginHarness();

    const view = (await harness.behavior.callRpc("listIcons", null)) as {
      defaults: { project: unknown[]; personal: unknown[]; section: unknown[] };
    };

    expect(view.defaults.section.length).toBeGreaterThan(0);
    expect(view.defaults.section).not.toEqual(view.defaults.project);
  });

  it("rejects edits to the personal project's fixed icon", async () => {
    const harness = createPluginHarness();

    await expect(
      harness.behavior.callRpc("setIcon", {
        kind: "project",
        id: "proj_personal",
        icon: "folder-01",
        color: null,
      }),
    ).rejects.toMatchObject({ code: "handler_error" });
    expect(harness.inspection.realtimeSignals).toEqual([]);
  });

  it("lets a section named like the personal project keep an icon", async () => {
    const harness = createPluginHarness();

    await expect(
      harness.behavior.callRpc("setIcon", {
        kind: "section",
        id: "proj_personal",
        icon: "rocket",
        color: null,
      }),
    ).resolves.toMatchObject({
      icons: [{ kind: "section", id: "proj_personal", icon: "rocket" }],
    });
  });

  it("rejects an owner kind it does not know", async () => {
    const harness = createPluginHarness();

    await expect(
      harness.behavior.callRpc("setIcon", {
        kind: "machine",
        id: "host_a",
        icon: "rocket",
        color: null,
      }),
    ).rejects.toMatchObject({ code: "invalid_input" });
  });
});

describe("the project list the drawing needs", () => {
  /**
   * The list is filled by the cleanup service at plugin start rather than on
   * the read path, so a test that wants it has to start that service — which
   * is also the order a client sees.
   */
  function hostWithProjects(list: () => Promise<unknown>) {
    const host = createFakePluginHost({
      pluginId: "icons",
      // The service reads the list and then waits on project changes, so both
      // halves need standing in for.
      sdk: { projects: { list }, subscribe: () => () => {} },
    });
    plugin(host.bb);
    disposeHosts.push(() => host.harness.lifecycle.dispose());
    return host.harness;
  }

  it("carries bb's projects, which some rows name and never identify", async () => {
    const harness = hostWithProjects(async () => [
      { id: "proj_personal", name: "Personal" },
      { id: "proj_a", name: "Storefront" },
    ]);

    harness.behavior.runService("icon-cleanup");

    await vi.waitFor(async () =>
      expect(await harness.behavior.callRpc("listIcons", null)).toMatchObject({
        projects: [
          { id: "proj_personal", name: "Personal" },
          { id: "proj_a", name: "Storefront" },
        ],
      }),
    );
  });

  it("asks for the personal project, which bb leaves out by default", async () => {
    const harness = hostWithProjects(async () => []);

    harness.behavior.runService("icon-cleanup");

    await vi.waitFor(() =>
      expect(
        harness.sdk.calls.find((call) => call.path === "projects.list")?.args,
      ).toEqual([{ includePersonal: true }]),
    );
  });

  it("answers before that list lands rather than waiting for it", async () => {
    const harness = hostWithProjects(
      () => new Promise(() => {}) as Promise<unknown>,
    );

    harness.behavior.runService("icon-cleanup");

    // The read never resolves; the answer still arrives, without the projects.
    await expect(
      harness.behavior.callRpc("listIcons", null),
    ).resolves.toMatchObject({ projects: [] });
  });

  it("reports no projects rather than failing when bb cannot list them", async () => {
    const harness = hostWithProjects(async () => {
      throw new Error("offline");
    });

    harness.behavior.runService("icon-cleanup");

    await expect(
      harness.behavior.callRpc("listIcons", null),
    ).resolves.toMatchObject({ projects: [] });
  });

  it("says nothing about the list it reads at start, which changed nothing", async () => {
    const harness = hostWithProjects(async () => [
      { id: "proj_a", name: "Storefront" },
    ]);

    harness.behavior.runService("icon-cleanup");
    await vi.waitFor(() =>
      expect(
        harness.sdk.calls.some((call) => call.path === "projects.list"),
      ).toBe(true),
    );

    expect(harness.inspection.realtimeSignals).toEqual([]);
  });
});

describe("icon placements", () => {
  it("defaults every placement on, so an update never hides an icon", async () => {
    const harness = createPluginHarness();

    await expect(
      harness.behavior.callRpc("listPlacements", null),
    ).resolves.toEqual({
      showInThreadHeader: true,
      showInSidebar: true,
      showInComposer: true,
    });
  });

  it("reports a placement the user turned off", async () => {
    const host = createFakePluginHost({
      pluginId: "icons",
      settings: { showInSidebar: false },
    });
    plugin(host.bb);
    disposeHosts.push(() => host.harness.lifecycle.dispose());

    await expect(
      host.harness.behavior.callRpc("listPlacements", null),
    ).resolves.toEqual({
      showInThreadHeader: true,
      showInSidebar: false,
      showInComposer: true,
    });
  });
});
