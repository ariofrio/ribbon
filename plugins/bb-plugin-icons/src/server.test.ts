import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import plugin from "./server";

const disposeHosts: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(disposeHosts.splice(0).map((dispose) => dispose()));
});

function createPluginHarness(personalProjectId = "proj_mine") {
  const host = createFakePluginHost({
    pluginId: "icons",
    sdk: {
      projects: {
        list: vi.fn(async () => [
          { id: personalProjectId, kind: "personal" },
          { id: "proj_other", kind: "standard" },
        ]),
      },
    },
  });
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
        id: "proj_mine",
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
        id: "proj_mine",
        icon: "rocket",
        color: null,
      }),
    ).resolves.toMatchObject({
      icons: [{ kind: "section", id: "proj_mine", icon: "rocket" }],
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

describe("icon placements", () => {
  it("defaults both placements on, so an update never hides an icon", async () => {
    const harness = createPluginHarness();

    await expect(
      harness.behavior.callRpc("listPlacements", null),
    ).resolves.toEqual({ showInThreadHeader: true, showInSidebar: true });
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
    ).resolves.toEqual({ showInThreadHeader: true, showInSidebar: false });
  });
});

describe("the personal project's icon", () => {
  it("names the personal project the way bb does", async () => {
    const harness = createPluginHarness();

    await expect(harness.behavior.callRpc("listIcons", null)).resolves.toMatchObject(
      { personalProjectId: "proj_mine" },
    );
  });

  it("lets an ordinary project keep an id that only looks personal", async () => {
    const harness = createPluginHarness();

    await expect(
      harness.behavior.callRpc("setIcon", {
        kind: "project",
        id: "proj_personal",
        icon: "rocket",
        color: null,
      }),
    ).resolves.toMatchObject({ icons: [{ id: "proj_personal" }] });
  });
});

describe("when bb cannot say which project is personal", () => {
  function unavailableHarness() {
    const host = createFakePluginHost({
      pluginId: "icons",
      sdk: {
        projects: {
          list: vi.fn(async () => {
            throw new Error("projects unavailable");
          }),
        },
      },
    });
    plugin(host.bb);
    disposeHosts.push(() => host.harness.lifecycle.dispose());
    return host.harness;
  }

  it("still draws the icons it has", async () => {
    const harness = unavailableHarness();

    await expect(
      harness.behavior.callRpc("listIcons", null),
    ).resolves.toMatchObject({ personalProjectId: null });
  });

  it("still refuses to write one, rather than guessing", async () => {
    const harness = unavailableHarness();

    await expect(
      harness.behavior.callRpc("setIcon", {
        kind: "project",
        id: "proj_mine",
        icon: "rocket",
        color: null,
      }),
    ).rejects.toMatchObject({ code: "handler_error" });
  });
});
