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
