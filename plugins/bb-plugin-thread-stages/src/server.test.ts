import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { expect, it, vi } from "vitest";
import plugin from "./server";

it("preserves the old stage and reorder RPCs as a one-way compatibility bridge", async () => {
  const callRpc = vi.fn(async ({ method }: { method: string }) =>
    method === "setWorkflowStage"
      ? { destination: { kind: "stay" } }
      : { assignments: [] },
  );
  const { bb, harness } = createFakePluginHost({
    pluginId: "thread-stages",
    sdk: { plugins: { callRpc } },
  });
  await plugin(bb);
  try {
    const input = { threadId: "root", workflowStage: "Completed" };
    expect(await harness.behavior.callRpc("setWorkflowStage", input)).toEqual({
      destination: { kind: "stay" },
    });
    expect(callRpc).toHaveBeenCalledWith(
      expect.objectContaining({
        pluginId: "ribbon-sidebar",
        method: "setWorkflowStage",
        input,
      }),
    );
    // Callers from before the rename still name Idle and Blocked.
    await harness.behavior.callRpc("setWorkflowStage", {
      threadId: "root",
      workflowStage: "Blocked",
    });
    expect(callRpc).toHaveBeenLastCalledWith(
      expect.objectContaining({
        method: "setWorkflowStage",
        input: { threadId: "root", workflowStage: "BlockedOnThirdParty" },
      }),
    );
    await harness.behavior.callRpc("setWorkflowStage", {
      threadId: "root",
      workflowStage: "Idle",
    });
    expect(callRpc).toHaveBeenLastCalledWith(
      expect.objectContaining({
        method: "setWorkflowStage",
        input: { threadId: "root", workflowStage: "Active" },
      }),
    );
    const reorder = { threadId: "root", scope: "step", direction: -1 };
    await harness.behavior.callRpc("reorderThread", reorder);
    expect(callRpc).toHaveBeenCalledWith(
      expect.objectContaining({
        pluginId: "ribbon-sidebar",
        method: "reorderThread",
        input: reorder,
      }),
    );
    expect(
      await harness.behavior.callRpc("getPlacementMigrationSnapshotV1", null),
    ).toMatchObject({ placements: [] });
  } finally {
    await harness.lifecycle.dispose();
  }
});

it("offers stages as mentions that tell the agent how to place a thread", async () => {
  const getSettings = vi.fn(async () => ({
    ok: true,
    schema: {},
    values: { showDeferredStage: false },
  }));
  const { bb, harness } = createFakePluginHost({
    pluginId: "thread-stages",
    sdk: { plugins: { getSettings } },
  });
  await plugin(bb);
  try {
    const provider = harness.inspection.registrations.mentionProviders.find(
      ({ id }) => id === "stage",
    );
    expect(provider).toBeDefined();
    const search = async (query: string) =>
      (
        await provider!.search({
          trigger: "@",
          query,
          projectId: null,
          threadId: null,
        })
      ).map(({ id, title }) => ({ id, title }));

    expect(await search("")).toEqual([]);
    expect(await search("bl")).toEqual([
      { id: "blockedonotheragent", title: "Blocked on other agent" },
      { id: "blockedonthirdparty", title: "Blocked on third party" },
    ]);
    expect(await search("third")).toEqual([
      { id: "blockedonthirdparty", title: "Blocked on third party" },
    ]);
    expect(await search("stage")).toEqual([
      { id: "active", title: "Active" },
      { id: "blockedonotheragent", title: "Blocked on other agent" },
      { id: "blockedonthirdparty", title: "Blocked on third party" },
      { id: "completed", title: "Completed" },
    ]);
    expect(await search("def")).toEqual([]);
    expect(getSettings).toHaveBeenCalledWith({ pluginId: "ribbon-sidebar" });

    const { context } = await provider!.resolve("blockedonthirdparty");
    expect(context).toContain(
      "@Blocked on third party is the Blocked on third party workflow stage",
    );
    expect(context).toContain(
      "bb sidebar place <thread> --to plugin:thread-stages:stages/BlockedOnThirdParty",
    );
    expect(context).toContain("Waiting on the user is Active");
    // Children have their own stage, so place the thread itself.
    expect(context).not.toContain("place its root");

    // Messages sent before the rename still resolve.
    expect((await provider!.resolve("idle")).context).toContain(
      "@Active is the Active workflow stage",
    );
    const retired = (await provider!.resolve("blocked")).context;
    expect(retired).toContain("stages/BlockedOnOtherAgent");
    expect(retired).toContain("stages/BlockedOnThirdParty");
    expect(retired).toContain("Waiting on the user is Active");
    expect(() => provider!.resolve("nowhere")).toThrow();
  } finally {
    await harness.lifecycle.dispose();
  }
});

it("offers every stage when Ribbon's settings are unavailable", async () => {
  const { bb, harness } = createFakePluginHost({
    pluginId: "thread-stages",
    sdk: {
      plugins: {
        getSettings: async () => {
          throw new Error("not installed");
        },
      },
    },
  });
  await plugin(bb);
  try {
    const provider = harness.inspection.registrations.mentionProviders.find(
      ({ id }) => id === "stage",
    );
    const results = await provider!.search({
      trigger: "@",
      query: "stage",
      projectId: null,
      threadId: null,
    });
    expect(results.map(({ title }) => title)).toEqual([
      "Deferred",
      "Active",
      "Blocked on other agent",
      "Blocked on third party",
      "Completed",
    ]);
  } finally {
    await harness.lifecycle.dispose();
  }
});
