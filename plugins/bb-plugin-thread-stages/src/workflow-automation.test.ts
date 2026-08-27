import { createFakePluginHost, makeThreadResponse } from "@get-bb/plugin-sdk/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createWorkflowObservationState,
  isActiveThreadLifecycle,
  registerThreadWorkflow,
} from "./workflow-automation";

const disposers: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(disposers.splice(0).map((dispose) => dispose()));
});

function setup(threads: Array<ReturnType<typeof makeThreadResponse>>) {
  const host = createFakePluginHost({
    pluginId: "thread-stages",
    sdk: {
      threads: {
        list: vi.fn(async () => threads),
        interactions: { list: vi.fn(async () => []) },
        timeline: vi.fn(async () => ({ activeBackgroundCommands: [] }) as never),
      },
      subscribe: vi.fn(() => () => {}),
    },
  });
  disposers.push(() => host.harness.lifecycle.dispose());
  return host;
}

describe("stage automation", () => {
  it.each([
    ["starting", true],
    ["active", true],
    ["stopping", true],
    ["idle", false],
    ["error", false],
  ] as const)("maps %s to isActive=%s", (status, expected) => {
    expect(isActiveThreadLifecycle(status)).toBe(expected);
  });

  it("emits only lifecycle edges so manual stages remain untouched", async () => {
    const threads = [makeThreadResponse({ id: "root", status: "active" })];
    const host = setup(threads);
    const updateStage = vi.fn(async () => {});
    registerThreadWorkflow(host.bb, updateStage);

    await host.harness.behavior.emitThreadEvent("thread.active", {
      thread: threads[0]!,
    });
    await host.harness.behavior.emitThreadEvent("thread.active", {
      thread: threads[0]!,
    });
    expect(updateStage).toHaveBeenCalledTimes(1);
    expect(updateStage).toHaveBeenLastCalledWith("root", "Active");

    threads[0] = makeThreadResponse({ id: "root", status: "idle" });
    await host.harness.behavior.emitThreadEvent("thread.idle", {
      thread: threads[0],
      lastAssistantText: null,
    });
    expect(updateStage).toHaveBeenLastCalledWith("root", "Idle");
  });

  it("does not replay a persisted idle edge after the plugin reloads", async () => {
    const threads = [makeThreadResponse({ id: "root", status: "idle" })];
    const host = setup(threads);
    const database = host.bb.storage.database();
    host.bb.storage.migrate(database, [
      `CREATE TABLE thread_task_workflow (
        thread_id TEXT PRIMARY KEY,
        is_working INTEGER NOT NULL CHECK (is_working IN (0, 1)),
        updated_at INTEGER NOT NULL
      )`,
    ]);
    createWorkflowObservationState(database).set("root", false);
    const observedWorking = createWorkflowObservationState(database);
    const updateStage = vi.fn(async () => {});
    registerThreadWorkflow(host.bb, updateStage, observedWorking);

    await host.harness.behavior.emitThreadEvent("thread.idle", {
      thread: threads[0]!,
      lastAssistantText: null,
    });
    expect(updateStage).not.toHaveBeenCalled();
  });

  it("assigns a root from activity anywhere in its hierarchy", async () => {
    const threads = [
      makeThreadResponse({ id: "root", status: "idle" }),
      makeThreadResponse({
        id: "child",
        parentThreadId: "root",
        status: "active",
      }),
    ];
    const host = setup(threads);
    const updateStage = vi.fn(async () => {});
    registerThreadWorkflow(host.bb, updateStage);

    await host.harness.behavior.emitThreadEvent("thread.active", {
      thread: threads[1]!,
    });
    expect(updateStage).toHaveBeenCalledWith("root", "Active");
    expect(updateStage).not.toHaveBeenCalledWith("child", expect.anything());
  });

  it("retries an edge after Ribbon is temporarily unavailable", async () => {
    const threads = [makeThreadResponse({ id: "root", status: "active" })];
    const host = setup(threads);
    const updateStage = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("Ribbon is starting"))
      .mockResolvedValue(undefined);
    registerThreadWorkflow(host.bb, updateStage);

    await host.harness.behavior.emitThreadEvent("thread.active", {
      thread: threads[0]!,
    });
    await host.harness.behavior.emitThreadEvent("thread.active", {
      thread: threads[0]!,
    });
    expect(updateStage).toHaveBeenCalledTimes(2);
  });
});
