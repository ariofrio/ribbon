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
  const catalogs: Record<string, string[]> = {
    codex: ["gpt-5.6-luna"],
    "claude-code": ["claude-haiku-4-5", "claude-sonnet-5"],
  };
  const modelQueries: Array<{ hostId?: string; providerId?: string }> = [];
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
        models: async ({ hostId, providerId }: { hostId?: string; providerId?: string } = {}) => {
          modelQueries.push({ hostId, providerId });
          return {
            providers: [],
            permissionCeiling: "accept-edits",
            models: (catalogs[providerId ?? ""] ?? []).map((name) => ({
              id: name,
              model: name,
              displayName: name,
              description: "",
              supportedReasoningEfforts: [
                { reasoningEffort: "low", description: "" },
                { reasoningEffort: "medium", description: "" },
              ],
              defaultReasoningEffort: "medium",
              isDefault: false,
            })),
            selectedOnlyModels: [],
            modelLoadError: null,
          } as never;
        },
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
    catalogs,
    modelQueries,
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

async function firstTitle(title = "Build a shared calendar") {
  const h = await setup();
  await h.harness.behavior.emitThreadEvent("thread.created", { thread: h.thread });
  h.user("Calendar");
  h.endTurn();
  await h.emit();
  h.harness.inspection.sdk.stub("threads.output", async () => ({ output: JSON.stringify({ title }) }));
  h.worker.status = "idle";
  h.workerEvents.push({ seq: 1, type: "turn/completed", data: { status: "completed" } });
  await h.harness.behavior.emitThreadEvent("thread.idle", { thread: h.worker, lastAssistantText: null });
  expect(h.updates).toEqual([{ threadId: "real", title }]);
  h.worker.id = "refinement-worker";
  h.worker.status = "active";
  h.workerEvents.length = 0;
  return h;
}

async function decide(h: Awaited<ReturnType<typeof setup>>, decision: unknown) {
  h.harness.inspection.sdk.stub("threads.output", async () => ({ output: JSON.stringify(decision) }));
  h.worker.status = "idle";
  h.workerEvents.push({ seq: 1, type: "turn/completed", data: { status: "completed" } });
  await h.harness.behavior.emitThreadEvent("thread.idle", { thread: h.worker, lastAssistantText: null });
}

it("refines a generic first title once on the third user message across reloads", async () => {
  const h = await firstTitle("Calendar");
  h.user("Add team sharing");
  await h.emit();
  expect(h.spawned).toHaveLength(1);
  const next = await h.harness.lifecycle.reload(plugin);
  cleanups.push(() => next.harness.lifecycle.dispose());
  h.user("Add invitations to the shared calendar");
  await next.harness.behavior.runSchedule("title-reconciliation");
  expect(h.spawned).toHaveLength(2);
  expect(h.spawned[1]?.prompt).toContain('Current title: "Calendar"');
  expect(h.spawned[1]?.prompt).toContain("generic or materially inaccurate");
  next.harness.inspection.sdk.stub("threads.output", async () => ({ output: JSON.stringify({
    action: "rename", reason: "generic", title: "Build a shared calendar",
  }) }));
  h.worker.status = "idle";
  h.workerEvents.push({ seq: 1, type: "turn/completed", data: { status: "completed" } });
  await next.harness.behavior.runSchedule("title-reconciliation");
  expect(h.updates).toHaveLength(2);
  expect(h.thread.title).toBe("Build a shared calendar");
  const restarted = await next.harness.lifecycle.reload(plugin);
  cleanups.push(() => restarted.harness.lifecycle.dispose());
  h.user("One more detail");
  await restarted.harness.behavior.runSchedule("title-reconciliation");
  expect(h.spawned).toHaveLength(2);
  expect(h.updates).toHaveLength(2);
});

it("keeps an accurate specific title and never reassesses it on later messages", async () => {
  const h = await firstTitle();
  h.user("Add sharing");
  h.user("Include invitations");
  await h.emit();
  expect(h.spawned).toHaveLength(2);
  await decide(h, { action: "keep" });
  expect(h.updates).toHaveLength(1);
  h.user("Add reminders");
  await h.emit();
  expect(h.spawned).toHaveLength(2);
});

it("never assesses a title changed after the first pass, even if it is restored", async () => {
  const h = await firstTitle();
  h.thread.title = "My calendar project";
  await h.emit();
  h.thread.title = "Build a shared calendar";
  h.user("Add sharing");
  h.user("Include invitations");
  await h.emit();
  expect(h.spawned).toHaveLength(1);
  expect(h.updates).toHaveLength(1);
});

it("preserves a title changed while the third-message assessment is running", async () => {
  const h = await firstTitle("Calendar");
  h.user("Add sharing");
  h.user("Include invitations");
  await h.emit();
  expect(h.spawned).toHaveLength(2);
  h.thread.title = "My title";
  await decide(h, { action: "rename", reason: "generic", title: "Build a shared calendar" });
  expect(h.updates).toHaveLength(1);
  expect(h.thread.title).toBe("My title");
});

it("rejects a third-message rename without a permitted reason", async () => {
  const h = await firstTitle();
  h.user("Add sharing");
  h.user("Include invitations");
  await h.emit();
  expect(h.spawned).toHaveLength(2);
  await decide(h, { action: "rename", reason: "sounds better", title: "Develop shared calendars" });
  expect(h.updates).toHaveLength(1);
});

it("recovers the second worker without mistaking the archived first worker for it", async () => {
  const h = await firstTitle("Calendar");
  const initial = makeThreadResponse({ ...h.worker, id: "worker", archivedAt: Date.now() });
  h.harness.inspection.sdk.stub("threads.get", async ({ threadId }) =>
    threadId === "real" ? h.thread : threadId === "worker" ? initial : h.worker,
  );
  h.harness.inspection.sdk.stub("threads.spawn", async (args) => {
    h.spawned.push({ ...(args as Record<string, unknown>) });
    throw new Error("lost second worker acknowledgement");
  });
  h.harness.inspection.sdk.stub("threads.list", async ({ offset }) => offset === 0 ? [initial, h.worker] : []);
  h.user("Add sharing");
  h.user("Include invitations");
  await h.emit();
  await h.harness.behavior.runSchedule("title-reconciliation");
  await decide(h, { action: "rename", reason: "generic", title: "Build a shared calendar" });
  expect(h.spawned).toHaveLength(2);
  expect(h.updates).toHaveLength(2);
  expect(h.thread.title).toBe("Build a shared calendar");
});

async function firstTurn(h: Awaited<ReturnType<typeof setup>>) {
  await h.harness.behavior.emitThreadEvent("thread.created", {
    thread: h.thread,
  });
  h.thread.title = "Build a calendar";
  h.user("Build a useful calendar application");
  h.endTurn();
  await h.emit();
}

it("suggests the automatic choice until a model is selected", async () => {
  const h = await setup();
  expect(await h.harness.behavior.callRpc("selection.get", null)).toEqual({
    selection: null,
    suggestion: {
      providerId: "claude-code",
      model: "claude-haiku-4-5",
      reasoningLevel: "low",
    },
  });
  expect(h.modelQueries.at(-1)?.hostId).toBeUndefined();
});

it("runs every title worker on the selected model on the thread's host", async () => {
  const h = await setup();
  const selection = {
    providerId: "claude-code",
    model: "claude-sonnet-5",
    reasoningLevel: "medium",
    serviceTier: "fast",
  };
  await h.harness.behavior.callRpc("selection.set", { selection });
  expect(await h.harness.behavior.callRpc("selection.get", null)).toMatchObject(
    { selection },
  );
  await firstTurn(h);
  expect(h.spawned).toHaveLength(1);
  expect(h.spawned[0]).toMatchObject({
    ...selection,
    environment: { type: "host", hostId: "host" },
  });
  expect(h.modelQueries.at(-1)).toEqual({
    hostId: "host",
    providerId: "claude-code",
  });
});

it("skips when the selected model is unavailable on the thread's host", async () => {
  const h = await setup();
  await h.harness.behavior.callRpc("selection.set", {
    selection: {
      providerId: "claude-code",
      model: "claude-sonnet-5",
      reasoningLevel: "medium",
    },
  });
  h.catalogs["claude-code"] = ["claude-haiku-4-5"];
  await firstTurn(h);
  expect(h.spawned).toHaveLength(0);
  vi.setSystemTime(Date.now() + 300_000);
  h.catalogs["claude-code"] = ["claude-sonnet-5"];
  await h.harness.behavior.runSchedule("title-reconciliation");
  expect(h.spawned).toHaveLength(0);
});

it("returns to the automatic choice when the selection is cleared", async () => {
  const h = await setup();
  await h.harness.behavior.callRpc("selection.set", {
    selection: {
      providerId: "claude-code",
      model: "claude-sonnet-5",
      reasoningLevel: "medium",
    },
  });
  await h.harness.behavior.callRpc("selection.set", { selection: null });
  await firstTurn(h);
  expect(h.spawned[0]).toMatchObject({
    providerId: "codex",
    model: "gpt-5.6-luna",
    reasoningLevel: "low",
  });
  expect(h.spawned[0]).not.toHaveProperty("serviceTier");
});

it("rejects a selection that names no model", async () => {
  const h = await setup();
  await expect(
    h.harness.behavior.callRpc("selection.set", {
      selection: { providerId: "codex", model: "", reasoningLevel: "low" },
    }),
  ).rejects.toThrow();
});
