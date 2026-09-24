import {
  createFakePluginHost,
  makeThreadResponse,
} from "@get-bb/plugin-sdk/testing";
import { afterEach, expect, it, vi } from "vitest";
import plugin from "./server";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
  vi.useRealTimers();
});

async function setup() {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(1_000_000);
  const thread = makeThreadResponse({
    id: "real",
    title: null,
    titleFallback: "Build a useful calendar application",
    providerId: "codex",
    environmentId: "env",
    createdAt: Date.now(),
    status: "active",
  });
  const worker = makeThreadResponse({
    id: "worker",
    title: "Title refinement",
    visibility: "hidden",
    originPluginId: "thread-titles",
    lifecycleOwnerThreadId: "real",
    status: "active",
  });
  const events: Array<Record<string, unknown>> = [];
  const spawned: Array<Record<string, unknown>> = [];
  const updates: Array<Record<string, unknown>> = [];
  const workerEvents: Array<Record<string, unknown>> = [];
  let notify: ((event: unknown) => unknown) | undefined;
  const host = createFakePluginHost({
    pluginId: "thread-titles",
    sdk: {
      subscribe: ({ callback }) => {
        notify = callback as typeof notify;
        return () => {};
      },
      threads: {
        get: async ({ threadId }) => (threadId === "real" ? thread : worker),
        events: {
          list: async ({ threadId, afterSeq, beforeSeq, limit, order }) => {
            const source = threadId === "real" ? events : workerEvents;
            const result = source.filter(
              (e) =>
                Number(e.seq) > Number(afterSeq ?? 0) &&
                Number(e.seq) < Number(beforeSeq ?? Infinity),
            );
            return (order === "desc" ? [...result].reverse() : result).slice(
              0,
              Number(limit ?? 1000),
            ) as never;
          },
        },
        spawn: async (args) => {
          spawned.push({ ...args });
          return worker;
        },
        list: async () => [],
        update: async (args) => {
          updates.push({ ...args });
          thread.title = args.title ?? null;
          return thread;
        },
        stop: async () => ({ ok: true }),
        archive: async () => ({ count: 1 }) as never,
        output: async () => ({
          output: JSON.stringify({ title: "Build a shared calendar" }),
        }),
        interactions: { list: async () => [] as never },
      },
      environments: { get: async () => ({ hostId: "host" }) as never },
      projects: {
        list: async () => [{ id: "personal", kind: "personal" }] as never,
      },
      providers: {
        models: async () => ({
          providers: [],
          permissionCeiling: "accept-edits",
          models: [
            {
              id: "gpt-5.6-luna",
              model: "gpt-5.6-luna",
              displayName: "Luna",
              description: "",
              supportedReasoningEfforts: [
                { reasoningEffort: "low", description: "" },
              ],
              defaultReasoningEffort: "low",
              isDefault: false,
            },
          ],
          selectedOnlyModels: [],
          modelLoadError: null,
        }),
      },
    },
  });
  await plugin(host.bb);
  cleanups.push(() => host.harness.lifecycle.dispose());
  const emit = () =>
    host.harness.behavior.emitThreadEvent("experimental_thread.events", {
      thread,
      sequence: events.length,
    });
  function user(text: string) {
    const seq = events.length + 1;
    events.push({
      id: `event-${seq}`,
      threadId: "real",
      seq,
      createdAt: Date.now(),
      scope: { kind: "thread" },
      type: "client/turn/requested",
      data: {
        initiator: "user",
        requestId: `request-${seq}`,
        input: [{ type: "text", text }],
      },
    });
  }
  function endTurn() {
    events.push({
      id: `completed-${events.length + 1}`,
      seq: events.length + 1,
      scope: { kind: "turn", turnId: "first-turn" },
      type: "turn/completed",
      data: { status: "completed" },
    });
  }
  return {
    ...host,
    thread,
    worker,
    events,
    workerEvents,
    spawned,
    updates,
    emit,
    user,
    endTurn,
    notify: (event: unknown) => notify?.(event),
  };
}

it("refines once after the first turn ends, including assistant and tool content", async () => {
  const h = await setup();
  await h.harness.behavior.emitThreadEvent("thread.created", {
    thread: h.thread,
  });
  h.user("Build a useful calendar application");
  h.thread.title = "Build a calendar";
  await h.emit();
  h.events.push({
    id: "answer",
    threadId: "real",
    seq: 2,
    createdAt: Date.now(),
    type: "item/completed",
    data: {
      item: {
        id: "a",
        type: "agentMessage",
        text: "We can support shared calendars.",
      },
    },
  });
  h.events.push({
    id: "tool",
    threadId: "real",
    seq: 3,
    createdAt: Date.now(),
    type: "item/completed",
    data: {
      item: {
        id: "t",
        type: "commandExecution",
        command: "ls",
        aggregatedOutput: "calendar.ts",
      },
    },
  });
  h.user("Add sharing");
  await h.emit();
  expect(h.spawned).toHaveLength(0);
  h.user("Include team invitations");
  h.endTurn();
  await h.emit();
  expect(h.spawned).toHaveLength(1);
  expect(h.spawned[0]).toMatchObject({
    visibility: "hidden",
    lifecycleOwnerThreadId: "real",
    providerId: "codex",
  });
  expect(h.spawned[0]?.prompt).toContain("shared calendars");
  expect(h.spawned[0]?.prompt).toContain("calendar.ts");
  vi.setSystemTime(Date.now() + 300_000);
  await h.harness.behavior.runSchedule("title-reconciliation");
  expect(h.spawned).toHaveLength(1);
});

it("applies a completed result once while the source remains active", async () => {
  const h = await setup();
  await h.harness.behavior.emitThreadEvent("thread.created", {
    thread: h.thread,
  });
  h.thread.title = "Build a calendar";
  h.user("Build a useful calendar application");
  await h.emit();
  expect(h.spawned).toHaveLength(0);
  h.endTurn();
  await h.emit();
  expect(h.spawned).toHaveLength(1);
  h.worker.status = "idle";
  h.workerEvents.push({
    id: "completed",
    seq: 1,
    type: "turn/completed",
    data: { status: "completed" },
  });
  await h.harness.behavior.emitThreadEvent("thread.idle", {
    thread: h.worker,
    lastAssistantText: null,
  });
  expect(h.updates).toEqual([
    { threadId: "real", title: "Build a shared calendar" },
  ]);
  const next = await h.harness.lifecycle.reload(plugin);
  cleanups.push(() => next.harness.lifecycle.dispose());
  await next.harness.behavior.runSchedule("title-reconciliation");
  expect(h.spawned).toHaveLength(1);
  expect(h.updates).toHaveLength(1);
});

it("keeps the baseline across restart and recovers the end of the first turn", async () => {
  const h = await setup();
  await h.harness.behavior.emitThreadEvent("thread.created", {
    thread: h.thread,
  });
  h.thread.title = "Build a calendar";
  h.user("Build a useful calendar application");
  await h.emit();
  vi.setSystemTime(Date.now() + 86_400_000);
  const next = await h.harness.lifecycle.reload(plugin);
  cleanups.push(() => next.harness.lifecycle.dispose());
  await next.harness.behavior.runSchedule("title-reconciliation");
  expect(h.spawned).toHaveLength(0);
  h.user("Add sharing");
  await next.harness.behavior.runSchedule("title-reconciliation");
  expect(h.spawned).toHaveLength(0);
  h.endTurn();
  const restarted = await next.harness.lifecycle.reload(plugin);
  cleanups.push(() => restarted.harness.lifecycle.dispose());
  await restarted.harness.behavior.runSchedule("title-reconciliation");
  expect(h.spawned).toHaveLength(1);
  expect(h.spawned[0]?.prompt).toContain('Current title: "Build a calendar"');
  await restarted.harness.behavior.runSchedule("title-reconciliation");
  expect(h.spawned).toHaveLength(1);
});

it("skips a renamed title both before generation and before applying", async () => {
  const h = await setup();
  await h.harness.behavior.emitThreadEvent("thread.created", {
    thread: h.thread,
  });
  h.thread.title = "Build a calendar";
  h.user("Build a useful calendar application");
  await h.emit();
  h.thread.title = "My chosen name";
  h.user("Second");
  h.user("Third");
  h.endTurn();
  vi.setSystemTime(Date.now() + 300_000);
  await h.harness.behavior.runSchedule("title-reconciliation");
  expect(h.spawned).toHaveLength(0);
  h.thread.title = "Build a calendar";
  await h.harness.behavior.runSchedule("title-reconciliation");
  expect(h.spawned).toHaveLength(0);
});

it("does not overwrite a rename made while generation is running", async () => {
  const h = await setup();
  await h.harness.behavior.emitThreadEvent("thread.created", {
    thread: h.thread,
  });
  h.thread.title = "Build a calendar";
  h.user("First");
  h.user("Second");
  h.user("Third");
  h.endTurn();
  await h.emit();
  h.thread.title = "Keep my title";
  h.worker.status = "idle";
  h.workerEvents.push({
    seq: 1,
    type: "turn/completed",
    data: { status: "completed" },
  });
  await h.harness.behavior.emitThreadEvent("thread.idle", {
    thread: h.worker,
    lastAssistantText: null,
  });
  expect(h.updates).toHaveLength(0);
});

it("does not invent an initial title after a restart during naming", async () => {
  const h = await setup();
  await h.harness.behavior.emitThreadEvent("thread.created", {
    thread: h.thread,
  });
  h.user("First");
  await h.emit();
  h.thread.title = "Possibly renamed while offline";
  h.user("Second");
  h.user("Third");
  h.endTurn();
  const next = await h.harness.lifecycle.reload(plugin);
  cleanups.push(() => next.harness.lifecycle.dispose());
  vi.setSystemTime(Date.now() + 300_000);
  await next.harness.behavior.runSchedule("title-reconciliation");
  expect(h.spawned).toHaveLength(0);
});

it("does not repeat a worker after losing the spawn response", async () => {
  const h = await setup();
  h.harness.inspection.sdk.stub("threads.spawn", async () => {
    h.spawned.push({});
    throw new Error("connection lost after creation");
  });
  h.harness.inspection.sdk.stub("threads.list", async ({ offset }) =>
    offset === 0 ? [h.worker] : [],
  );
  await h.harness.behavior.emitThreadEvent("thread.created", {
    thread: h.thread,
  });
  h.thread.title = "Build a calendar";
  h.user("First");
  h.user("Second");
  h.user("Third");
  h.endTurn();
  await h.emit();
  await h.harness.behavior.runSchedule("title-reconciliation");
  await h.harness.behavior.runSchedule("title-reconciliation");
  expect(h.spawned).toHaveLength(1);
});

it("does not repeat an ambiguous title write", async () => {
  const h = await setup();
  h.harness.inspection.sdk.stub("threads.update", async (args) => {
    h.updates.push(args as Record<string, unknown>);
    throw new Error("lost acknowledgement");
  });
  await h.harness.behavior.emitThreadEvent("thread.created", {
    thread: h.thread,
  });
  h.thread.title = "Build a calendar";
  h.user("First");
  h.user("Second");
  h.user("Third");
  h.endTurn();
  await h.emit();
  h.worker.status = "idle";
  h.workerEvents.push({
    seq: 1,
    type: "turn/completed",
    data: { status: "completed" },
  });
  await h.harness.behavior.emitThreadEvent("thread.idle", {
    thread: h.worker,
    lastAssistantText: null,
  });
  await h.harness.behavior.runSchedule("title-reconciliation");
  expect(h.updates).toHaveLength(1);
});

it("includes all history pages and distinct items whose IDs recur in different turns", async () => {
  const h = await setup();
  await h.harness.behavior.emitThreadEvent("thread.created", {
    thread: h.thread,
  });
  h.thread.title = "Build a calendar";
  h.user("First");
  for (let i = 0; i < 510; i++)
    h.events.push({
      id: `row-${i}`,
      seq: h.events.length + 1,
      createdAt: Date.now(),
      scope: { kind: "turn", turnId: `turn-${i}` },
      type: "item/completed",
      data: {
        item: {
          id: "message",
          type: "agentMessage",
          text: `Assistant response ${i}`,
        },
      },
    });
  h.user("Second");
  h.user("Third");
  h.endTurn();
  await h.emit();
  expect(h.spawned[0]?.prompt).toContain("Assistant response 0");
  expect(h.spawned[0]?.prompt).toContain("Assistant response 509");
});

it("does not start again after a destructive history edit during generation", async () => {
  const h = await setup();
  await h.harness.behavior.emitThreadEvent("thread.created", {
    thread: h.thread,
  });
  h.thread.title = "Build a calendar";
  h.user("First");
  h.user("Second");
  h.user("Third");
  h.endTurn();
  await h.emit();
  h.events[0]!.data = {
    initiator: "user",
    requestId: "replacement",
    input: [{ type: "text", text: "Changed objective" }],
  };
  await h.notify({ id: "real", changes: ["history-rewritten"] });
  h.worker.status = "idle";
  h.workerEvents.push({
    seq: 1,
    type: "turn/completed",
    data: { status: "completed" },
  });
  await h.harness.behavior.emitThreadEvent("thread.idle", {
    thread: h.worker,
    lastAssistantText: null,
  });
  expect(h.updates).toHaveLength(0);
  expect(h.spawned).toHaveLength(1);
});

it("skips oversized transcripts rather than truncating the full conversation", async () => {
  const h = await setup();
  await h.harness.behavior.setSettings({ maxTranscriptBytes: 1_000 });
  await h.harness.behavior.emitThreadEvent("thread.created", {
    thread: h.thread,
  });
  h.thread.title = "Build a calendar";
  h.user("x".repeat(2_000));
  h.user("Second");
  h.user("Third");
  h.endTurn();
  await h.emit();
  expect(h.spawned).toHaveLength(0);
});

it("waits for the first turn to end and reconciles a missed completion event", async () => {
  const h = await setup();
  vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
  vi.setSystemTime(1_000_000);
  await h.harness.behavior.emitThreadEvent("thread.created", {
    thread: h.thread,
  });
  h.user("First");
  await h.emit();
  const service = h.harness.behavior.runService("title-jobs");
  try {
    await vi.advanceTimersByTimeAsync(600_000);
    expect(h.spawned).toHaveLength(0);
    h.user("Second");
    await h.emit();
    await vi.advanceTimersByTimeAsync(600_000);
    expect(h.spawned).toHaveLength(0);
    h.user("Third");
    await vi.advanceTimersByTimeAsync(5_000);
    expect(h.spawned).toHaveLength(0);
    h.endTurn();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(h.spawned).toHaveLength(1);
    expect(h.thread.status).toBe("active");
  } finally {
    service.controller.abort();
    await service.done;
  }
});

it("ignores threads supplied with titles and hidden workers", async () => {
  const h = await setup();
  h.thread.title = "My chosen title";
  await h.harness.behavior.emitThreadEvent("thread.created", {
    thread: h.thread,
  });
  await h.harness.behavior.emitThreadEvent("thread.created", {
    thread: h.worker,
  });
  h.user("First");
  h.user("Second");
  h.user("Third");
  h.endTurn();
  await h.emit();
  expect(h.spawned).toHaveLength(0);
});

it("rejects tool-using workers instead of applying their result", async () => {
  const h = await setup();
  await h.harness.behavior.emitThreadEvent("thread.created", {
    thread: h.thread,
  });
  h.user("First");
  h.user("Second");
  h.user("Third");
  h.endTurn();
  await h.emit();
  h.workerEvents.push({
    seq: 1,
    type: "item/started",
    data: { item: { id: "tool", type: "commandExecution", command: "ls" } },
  });
  await h.harness.behavior.emitThreadEvent("experimental_thread.events", {
    thread: h.worker,
    sequence: 1,
  });
  h.worker.status = "idle";
  h.workerEvents.push({
    seq: 2,
    type: "turn/completed",
    data: { status: "completed" },
  });
  await h.harness.behavior.runSchedule("title-reconciliation");
  expect(h.updates).toHaveLength(0);
  expect(h.spawned).toHaveLength(1);
});
