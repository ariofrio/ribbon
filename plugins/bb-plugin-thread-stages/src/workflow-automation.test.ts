import {
  createFakePluginHost,
  makeThreadResponse,
} from "@get-bb/plugin-sdk/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createWorkflowObservationState,
  isActiveThreadLifecycle,
  registerThreadWorkflow,
} from "./workflow-automation";

type ThreadChangedEvent = {
  changes: string[];
  entity: "thread";
  id?: string;
  metadata?: {
    backgroundActivityChanged?: boolean;
    hasPendingInteraction?: boolean;
  };
  type: "changed";
};

type RealtimeConnectionEvent = {
  reconnectDelayMs: number | null;
  reconnected: boolean;
  state: "connected" | "connecting" | "disconnected";
};

type RealtimeCallback = (event: never) => Promise<void> | void;

interface WorkflowThreadFixture
  extends ReturnType<typeof makeThreadResponse> {
  activity: {
    activeBackgroundCommandCount: number;
  };
  hasPendingInteraction: boolean;
}

const disposers: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(disposers.splice(0).map((dispose) => dispose()));
});

function makeWorkflowThread({
  activeBackgroundCommandCount = 0,
  hasPendingInteraction = false,
  ...overrides
}: Partial<ReturnType<typeof makeThreadResponse>> & {
  activeBackgroundCommandCount?: number;
  hasPendingInteraction?: boolean;
} = {}): WorkflowThreadFixture {
  return {
    ...makeThreadResponse(overrides),
    activity: { activeBackgroundCommandCount },
    hasPendingInteraction,
  };
}

function setup(threads: WorkflowThreadFixture[]) {
  const subscriptions = new Map<string, RealtimeCallback>();
  const list = vi.fn(
    async (
      { limit = 100, offset = 0 }: { limit?: number; offset?: number } = {},
    ) => threads.slice(offset, offset + limit),
  );
  const get = vi.fn(async ({ threadId }: { threadId: string }) => {
    const thread = threads.find(({ id }) => id === threadId);
    if (!thread) throw new Error(`Thread ${threadId} was not found`);
    return thread;
  });
  const interactions = vi.fn(async ({ threadId }: { threadId: string }) => {
    const thread = threads.find(({ id }) => id === threadId);
    return thread?.hasPendingInteraction
      ? ([{ status: "pending" }] as never)
      : [];
  });
  const timeline = vi.fn(async ({ threadId }: { threadId: string }) => {
    const thread = threads.find(({ id }) => id === threadId);
    return {
      activeBackgroundCommands:
        (thread?.activity.activeBackgroundCommandCount ?? 0) > 0
          ? [{ id: "background-command" }]
          : [],
    } as never;
  });
  const subscribe = vi.fn(
    ({ event, callback }: { event: string; callback: RealtimeCallback }) => {
      subscriptions.set(event, callback);
      return () => subscriptions.delete(event);
    },
  );
  const host = createFakePluginHost({
    pluginId: "thread-stages",
    sdk: {
      threads: { get, interactions: { list: interactions }, list, timeline },
      subscribe: subscribe as never,
    },
  });
  disposers.push(() => host.harness.lifecycle.dispose());

  const start = async () => {
    host.harness.behavior.runService("stage-automation");
    await host.harness.behavior.runSchedule(
      "stage-automation-reconciliation",
    );
  };
  const emit = async (
    event: "thread:changed" | "realtime:connection",
    payload: ThreadChangedEvent | RealtimeConnectionEvent,
  ) => {
    const callback = subscriptions.get(event);
    if (!callback) throw new Error(`No ${event} subscription registered`);
    const result = callback(payload as never);
    if (result) await result;
    else {
      await host.harness.behavior.runSchedule(
        "stage-automation-reconciliation",
      );
    }
  };

  return {
    ...host,
    emit,
    sdk: { get, interactions, list, subscribe, timeline },
    start,
  };
}

function threadChanged(
  id: string,
  changes: string[],
  metadata?: ThreadChangedEvent["metadata"],
): ThreadChangedEvent {
  return {
    changes,
    entity: "thread",
    id,
    ...(metadata ? { metadata } : {}),
    type: "changed",
  };
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

  it("builds one cold index, then handles an activity event in O(1) calls", async () => {
    const threads = Array.from({ length: 128 }, (_, index) =>
      makeWorkflowThread({ id: `thread-${index}` }),
    );
    const observedWorking = new Map(
      threads.map(({ id }) => [id, false] as const),
    );
    const host = setup(threads);
    const updateStage = vi.fn(async () => {});
    registerThreadWorkflow(host.bb, updateStage, observedWorking);

    await host.start();

    expect(host.sdk.list).toHaveBeenCalledTimes(2);
    expect(host.sdk.get).not.toHaveBeenCalled();
    expect(host.sdk.interactions).not.toHaveBeenCalled();
    expect(host.sdk.timeline).not.toHaveBeenCalled();

    threads[127] = makeWorkflowThread({ id: "thread-127", status: "active" });
    await host.emit(
      "thread:changed",
      threadChanged("thread-127", ["status-changed"]),
    );

    expect(host.sdk.list).toHaveBeenCalledTimes(2);
    expect(host.sdk.get).toHaveBeenCalledTimes(1);
    expect(host.sdk.interactions).not.toHaveBeenCalled();
    expect(host.sdk.timeline).not.toHaveBeenCalled();
    expect(updateStage).toHaveBeenCalledTimes(1);
    expect(updateStage).toHaveBeenCalledWith("thread-127", "Active");
  });

  it("coalesces a burst by thread id", async () => {
    const threads = [makeWorkflowThread({ id: "root" })];
    const host = setup(threads);
    const updateStage = vi.fn(async () => {});
    registerThreadWorkflow(
      host.bb,
      updateStage,
      new Map([["root", false]]),
    );
    await host.start();

    threads[0] = makeWorkflowThread({ id: "root", status: "active" });
    const callback = host.sdk.subscribe.mock.calls.find(
      ([subscription]) => subscription.event === "thread:changed",
    )?.[0].callback as RealtimeCallback;
    const results = Array.from({ length: 25 }, () =>
      callback(threadChanged("root", ["status-changed"]) as never),
    );
    await Promise.all(results.filter(Boolean));

    expect(host.sdk.get).toHaveBeenCalledTimes(1);
    expect(host.sdk.list).toHaveBeenCalledTimes(1);
    expect(updateStage).toHaveBeenCalledTimes(1);
  });

  it("uses the newest interaction signal when coalescing a burst", async () => {
    const threads = [makeWorkflowThread({ id: "root", status: "active" })];
    const host = setup(threads);
    const updateStage = vi.fn(async () => {});
    registerThreadWorkflow(
      host.bb,
      updateStage,
      new Map([["root", true]]),
    );
    await host.start();

    const callback = host.sdk.subscribe.mock.calls.find(
      ([subscription]) => subscription.event === "thread:changed",
    )?.[0].callback as RealtimeCallback;
    const first = callback(
      threadChanged("root", ["interactions-changed"], {
        hasPendingInteraction: true,
      }) as never,
    );
    const second = callback(
      threadChanged("root", ["interactions-changed"]) as never,
    );
    await Promise.all([first, second].filter(Boolean));

    expect(host.sdk.interactions).toHaveBeenCalledTimes(1);
    expect(updateStage).not.toHaveBeenCalled();
  });

  it("updates only the affected root for lifecycle, background, and interaction edges", async () => {
    const threads = [
      makeWorkflowThread({ id: "root" }),
      makeWorkflowThread({ id: "child", parentThreadId: "root" }),
      makeWorkflowThread({ id: "other" }),
    ];
    const host = setup(threads);
    const updateStage = vi.fn(async () => {});
    registerThreadWorkflow(
      host.bb,
      updateStage,
      new Map([
        ["root", false],
        ["other", false],
      ]),
    );
    await host.start();

    threads[1] = makeWorkflowThread({
      activeBackgroundCommandCount: 1,
      id: "child",
      parentThreadId: "root",
    });
    await host.emit(
      "thread:changed",
      threadChanged("child", [], { backgroundActivityChanged: true }),
    );
    expect(updateStage).toHaveBeenLastCalledWith("root", "Active");
    expect(host.sdk.timeline).toHaveBeenCalledTimes(1);

    threads[1] = makeWorkflowThread({
      activeBackgroundCommandCount: 1,
      hasPendingInteraction: true,
      id: "child",
      parentThreadId: "root",
    });
    await host.emit(
      "thread:changed",
      threadChanged("child", ["interactions-changed"], {
        hasPendingInteraction: true,
      }),
    );
    expect(updateStage).toHaveBeenLastCalledWith("root", "Idle");
    expect(host.sdk.interactions).not.toHaveBeenCalled();
    expect(updateStage).not.toHaveBeenCalledWith("child", expect.anything());
    expect(updateStage).not.toHaveBeenCalledWith("other", expect.anything());
  });

  it("keeps a root active while another member is working", async () => {
    const threads = [
      makeWorkflowThread({ id: "root", status: "active" }),
      makeWorkflowThread({
        activeBackgroundCommandCount: 1,
        id: "child",
        parentThreadId: "root",
      }),
    ];
    const host = setup(threads);
    const updateStage = vi.fn(async () => {});
    registerThreadWorkflow(
      host.bb,
      updateStage,
      new Map([["root", true]]),
    );
    await host.start();

    threads[0] = makeWorkflowThread({
      hasPendingInteraction: true,
      id: "root",
      status: "active",
    });
    await host.emit(
      "thread:changed",
      threadChanged("root", ["interactions-changed"], {
        hasPendingInteraction: true,
      }),
    );

    expect(updateStage).not.toHaveBeenCalled();
  });

  it("repairs missed events after reconnect without reading timelines", async () => {
    const threads = [makeWorkflowThread({ id: "root" })];
    const host = setup(threads);
    const updateStage = vi.fn(async () => {});
    registerThreadWorkflow(
      host.bb,
      updateStage,
      new Map([["root", false]]),
    );
    await host.start();

    threads[0] = makeWorkflowThread({
      activeBackgroundCommandCount: 1,
      id: "root",
    });
    await host.emit("realtime:connection", {
      reconnectDelayMs: null,
      reconnected: true,
      state: "connected",
    });

    expect(host.sdk.list).toHaveBeenCalledTimes(2);
    expect(host.sdk.timeline).not.toHaveBeenCalled();
    expect(updateStage).toHaveBeenCalledWith("root", "Active");
  });

  it("uses O(N) only to repair topology changes", async () => {
    const threads = [
      makeWorkflowThread({ id: "root-a" }),
      makeWorkflowThread({ id: "root-b" }),
    ];
    const host = setup(threads);
    const updateStage = vi.fn(async () => {});
    registerThreadWorkflow(
      host.bb,
      updateStage,
      new Map([
        ["root-a", false],
        ["root-b", false],
      ]),
    );
    await host.start();

    threads[1] = makeWorkflowThread({
      id: "root-b",
      parentThreadId: "root-a",
      status: "active",
    });
    await host.emit(
      "thread:changed",
      threadChanged("root-b", ["parent-changed"]),
    );

    expect(host.sdk.list).toHaveBeenCalledTimes(2);
    expect(host.sdk.get).not.toHaveBeenCalled();
    expect(host.sdk.interactions).not.toHaveBeenCalled();
    expect(host.sdk.timeline).not.toHaveBeenCalled();
    expect(updateStage).toHaveBeenCalledWith("root-a", "Active");
  });

  it("retries a failed Ribbon edge without rescanning threads", async () => {
    const threads = [makeWorkflowThread({ id: "root" })];
    const host = setup(threads);
    const updateStage = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("Ribbon is starting"))
      .mockResolvedValue(undefined);
    registerThreadWorkflow(
      host.bb,
      updateStage,
      new Map([["root", false]]),
    );
    await host.start();

    threads[0] = makeWorkflowThread({ id: "root", status: "active" });
    await host.emit(
      "thread:changed",
      threadChanged("root", ["status-changed"]),
    );
    expect(updateStage).toHaveBeenCalledTimes(1);

    await host.harness.behavior.runSchedule(
      "stage-automation-reconciliation",
    );

    expect(updateStage).toHaveBeenCalledTimes(2);
    expect(host.sdk.list).toHaveBeenCalledTimes(1);
    expect(host.sdk.get).toHaveBeenCalledTimes(1);
    expect(host.sdk.timeline).not.toHaveBeenCalled();
  });

  it("retries a failed targeted read without a full repair", async () => {
    const threads = [makeWorkflowThread({ id: "root" })];
    const host = setup(threads);
    const updateStage = vi.fn(async () => {});
    registerThreadWorkflow(
      host.bb,
      updateStage,
      new Map([["root", false]]),
    );
    await host.start();
    host.sdk.get.mockRejectedValueOnce(new Error("host reconnecting"));

    threads[0] = makeWorkflowThread({ id: "root", status: "active" });
    await host.emit(
      "thread:changed",
      threadChanged("root", ["status-changed"]),
    );
    expect(updateStage).not.toHaveBeenCalled();

    await host.harness.behavior.runSchedule(
      "stage-automation-reconciliation",
    );

    expect(host.sdk.list).toHaveBeenCalledTimes(1);
    expect(host.sdk.get).toHaveBeenCalledTimes(2);
    expect(updateStage).toHaveBeenCalledWith("root", "Active");
  });

  it("does not replay a persisted idle edge after the plugin reloads", async () => {
    const threads = [makeWorkflowThread({ id: "root" })];
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
    const updateStage = vi.fn(async () => {});
    registerThreadWorkflow(
      host.bb,
      updateStage,
      createWorkflowObservationState(database),
    );

    await host.start();

    expect(updateStage).not.toHaveBeenCalled();
  });
});
