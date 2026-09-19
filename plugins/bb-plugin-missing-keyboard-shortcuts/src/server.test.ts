import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import plugin from "./server";

const disposeHosts: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(disposeHosts.splice(0).map((dispose) => dispose()));
});

function serverHarness(options: {
  archivedAt: number | null;
  sourceThreadId?: string | null;
}) {
  const getTabs = vi.fn(async () => ({
    revision: 4,
    tabs: [
      { id: "info", kind: "thread-info" },
      {
        id: "side-tab",
        kind: "plugin-panel",
        pluginId: "side-chat",
      },
    ],
  }));
  const updateTabs = vi.fn(async () => ({ revision: 5, tabs: [] }));
  const host = createFakePluginHost({
    pluginId: "missing-keyboard-shortcuts",
    sdk: {
      threads: {
        get: async () => ({
          archivedAt: options.archivedAt,
          originKind: "fork",
          originPluginId: "side-chat",
          sourceThreadId: options.sourceThreadId ?? "thr_parent",
          visibility: "hidden",
        }),
        tabs: { get: getTabs, update: updateTabs },
      },
    },
  });
  plugin(host.bb);
  disposeHosts.push(() => host.harness.lifecycle.dispose());
  return { getTabs, harness: host.harness, updateTabs };
}

describe("validateSideChat RPC", () => {
  it("keeps a live child belonging to the requested parent", async () => {
    const { harness, updateTabs } = serverHarness({ archivedAt: null });

    await expect(
      harness.behavior.callRpc("validateSideChat", {
        childThreadId: "thr_child",
        parentThreadId: "thr_parent",
        tabId: "side-tab",
      }),
    ).resolves.toEqual({ reusable: true });
    expect(updateTabs).not.toHaveBeenCalled();
  });

  it("prunes an archived child's persisted tab", async () => {
    const { harness, updateTabs } = serverHarness({ archivedAt: 123 });

    await expect(
      harness.behavior.callRpc("validateSideChat", {
        childThreadId: "thr_child",
        parentThreadId: "thr_parent",
        tabId: "side-tab",
      }),
    ).resolves.toEqual({ reusable: false });
    expect(updateTabs).toHaveBeenCalledWith({
      expectedRevision: 4,
      tabs: [{ id: "info", kind: "thread-info" }],
      threadId: "thr_parent",
    });
  });

  it("rejects malformed requests before reading thread state", async () => {
    const { getTabs, harness } = serverHarness({ archivedAt: null });

    await expect(
      harness.behavior.callRpc("validateSideChat", {
        childThreadId: "",
        parentThreadId: "thr_parent",
        tabId: "side-tab",
      }),
    ).rejects.toMatchObject({ code: "invalid_input" });
    expect(getTabs).not.toHaveBeenCalled();
  });
});

describe("createSideChat RPC", () => {
  it("forwards to the Side chat plugin through the bb SDK", async () => {
    const callRpc = vi.fn(async () => ({ threadId: "thr_child" }));
    const host = createFakePluginHost({
      pluginId: "missing-keyboard-shortcuts",
      sdk: {
        plugins: { callRpc },
        threads: {
          tabs: {
            get: async () => ({ revision: 0, tabs: [] }),
            update: async () => ({ revision: 1, tabs: [] }),
          },
        },
      },
    });
    plugin(host.bb);
    disposeHosts.push(() => host.harness.lifecycle.dispose());

    await expect(
      host.harness.behavior.callRpc("createSideChat", {
        sourceThreadId: "thr_parent",
      }),
    ).resolves.toEqual({ threadId: "thr_child" });
    expect(callRpc).toHaveBeenCalledWith(
      expect.objectContaining({
        pluginId: "side-chat",
        method: "createSideChat",
        input: { sourceThreadId: "thr_parent", anchorText: "" },
      }),
    );
  });

  it("reads but does not mutate tabs persisted by the public client panel API", async () => {
    const callRpc = vi.fn(async () => ({ threadId: "thr_child" }));
    const getTabs = vi.fn(async () => ({
      revision: 3,
      tabs: [{ id: "info", kind: "thread-info" }],
    }));
    const updateTabs = vi.fn(async () => ({ revision: 4, tabs: [] }));
    const host = createFakePluginHost({
      pluginId: "missing-keyboard-shortcuts",
      sdk: {
        plugins: { callRpc },
        threads: { tabs: { get: getTabs, update: updateTabs } },
      },
    });
    plugin(host.bb);
    disposeHosts.push(() => host.harness.lifecycle.dispose());

    await host.harness.behavior.callRpc("createSideChat", {
      sourceThreadId: "thr_parent",
    });

    expect(getTabs).toHaveBeenCalledWith({ threadId: "thr_parent" });
    expect(updateTabs).not.toHaveBeenCalled();
  });

  it("reuses a live side chat from the public thread tab store", async () => {
    const callRpc = vi.fn(async () => ({ threadId: "thr_new" }));
    const paramsJson = JSON.stringify({
      sourceMessageText: "",
      sourceSeqEnd: null,
      sourceThreadId: "thr_parent",
      threadId: "thr_existing",
    });
    const host = createFakePluginHost({
      pluginId: "missing-keyboard-shortcuts",
      sdk: {
        plugins: { callRpc },
        threads: {
          get: async () => ({
            archivedAt: null,
            originKind: "fork",
            originPluginId: "side-chat",
            sourceThreadId: "thr_parent",
            visibility: "hidden",
          }),
          tabs: {
            get: async () => ({
              revision: 1,
              tabs: [
                {
                  actionId: "side-chat",
                  id: "existing-side-chat",
                  kind: "plugin-panel",
                  paramsJson,
                  pluginId: "missing-keyboard-shortcuts",
                  title: "Side chat",
                },
              ],
            }),
            update: vi.fn(),
          },
        },
      },
    });
    plugin(host.bb);
    disposeHosts.push(() => host.harness.lifecycle.dispose());

    await expect(
      host.harness.behavior.callRpc("createSideChat", {
        sourceThreadId: "thr_parent",
      }),
    ).resolves.toEqual({ threadId: "thr_existing" });
    expect(callRpc).not.toHaveBeenCalled();
  });

  it("rejects an empty source thread before asking bb", async () => {
    const callRpc = vi.fn(async () => ({ threadId: "thr_child" }));
    const host = createFakePluginHost({
      pluginId: "missing-keyboard-shortcuts",
      sdk: { plugins: { callRpc } },
    });
    plugin(host.bb);
    disposeHosts.push(() => host.harness.lifecycle.dispose());

    await expect(
      host.harness.behavior.callRpc("createSideChat", { sourceThreadId: "" }),
    ).rejects.toMatchObject({ code: "invalid_input" });
    expect(callRpc).not.toHaveBeenCalled();
  });
});

describe("sendToMain RPC", () => {
  it("forwards a side-chat reply through the public plugin RPC client", async () => {
    const callRpc = vi.fn(async () => ({ ok: true as const }));
    const host = createFakePluginHost({
      pluginId: "missing-keyboard-shortcuts",
      sdk: { plugins: { callRpc } },
    });
    plugin(host.bb);
    disposeHosts.push(() => host.harness.lifecycle.dispose());

    await expect(
      host.harness.behavior.callRpc("sendToMain", {
        senderThreadId: "thr_side",
        sourceThreadId: "thr_main",
        text: "Use this answer",
      }),
    ).resolves.toEqual({ ok: true });
    expect(callRpc).toHaveBeenCalledWith(
      expect.objectContaining({
        input: {
          senderThreadId: "thr_side",
          sourceThreadId: "thr_main",
          text: "Use this answer",
        },
        method: "sendToMain",
        pluginId: "side-chat",
      }),
    );
  });
});
