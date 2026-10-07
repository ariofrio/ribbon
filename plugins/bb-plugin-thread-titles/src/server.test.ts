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
    codex: ["gpt-5.4-mini", "gpt-5.6-luna", "gpt-6-luna"],
    "claude-code": ["claude-haiku-4-5", "claude-sonnet-5"],
  };
  const catalogFailures: Record<string, "error" | "throw"> = {};
  const modelQueries: Array<{ hostId?: string; providerId?: string }> = [];
  const bbTitles = { mode: "automatic" as "automatic" | "off" };
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
      system: {
        aiServices: async () => ({
          selections: {
            "thread-title": { mode: bbTitles.mode },
            "commit-message": { mode: "automatic" },
            voice: { mode: "automatic" },
          },
          services: [],
        }) as never,
      },
      projects: {
        list: async () => [{ id: "personal", kind: "personal" }] as never,
      },
      providers: {
        models: async ({ hostId, providerId }: { hostId?: string; providerId?: string } = {}) => {
          modelQueries.push({ hostId, providerId });
          if (catalogFailures[providerId ?? ""] === "throw") throw new Error("Provider unavailable");
          if (catalogFailures[providerId ?? ""] === "error") return {
            models: [], selectedOnlyModels: [], modelLoadError: { code: "missing_executable" },
          } as never;
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
    catalogFailures,
    modelQueries,
    bbTitles,
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
  await finishWorker(h, { title: "Build a calendar" });
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
  expect(h.spawned).toHaveLength(1);
  h.user("Include team invitations");
  h.endTurn();
  await h.emit();
  expect(h.spawned).toHaveLength(2);
  expect(h.spawned[1]).toMatchObject({
    visibility: "hidden",
    lifecycleOwnerThreadId: "real",
    providerId: "codex",
  });
  expect(h.spawned[1]?.prompt).toContain("shared calendars");
  expect(h.spawned[1]?.prompt).toContain("calendar.ts");
  vi.setSystemTime(Date.now() + 300_000);
  await h.harness.behavior.runSchedule("title-reconciliation");
  expect(h.spawned).toHaveLength(2);
});

it("applies a completed result once while the source remains active", async () => {
  const h = await setup();
  await h.harness.behavior.emitThreadEvent("thread.created", {
    thread: h.thread,
  });
  h.thread.title = "Build a calendar";
  h.user("Build a useful calendar application");
  await h.emit();
  expect(h.spawned).toHaveLength(1);
  await finishWorker(h, { title: "Build a calendar" });
  h.harness.inspection.sdk.stub("threads.output", async () => ({
    output: JSON.stringify({ title: "Build a shared calendar" }),
  }));
  h.endTurn();
  await h.emit();
  expect(h.spawned).toHaveLength(2);
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
  expect(h.spawned).toHaveLength(2);
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
  await finishWorker(h, { title: "Build a calendar" });
  vi.setSystemTime(Date.now() + 86_400_000);
  const next = await h.harness.lifecycle.reload(plugin);
  cleanups.push(() => next.harness.lifecycle.dispose());
  await next.harness.behavior.runSchedule("title-reconciliation");
  expect(h.spawned).toHaveLength(1);
  h.user("Add sharing");
  await next.harness.behavior.runSchedule("title-reconciliation");
  expect(h.spawned).toHaveLength(1);
  h.endTurn();
  const restarted = await next.harness.lifecycle.reload(plugin);
  cleanups.push(() => restarted.harness.lifecycle.dispose());
  await restarted.harness.behavior.runSchedule("title-reconciliation");
  expect(h.spawned).toHaveLength(2);
  expect(h.spawned[1]?.prompt).toContain('Current title: "Build a calendar"');
  await restarted.harness.behavior.runSchedule("title-reconciliation");
  expect(h.spawned).toHaveLength(2);
});

it("skips a renamed title both before generation and before applying", async () => {
  const h = await setup();
  await h.harness.behavior.emitThreadEvent("thread.created", {
    thread: h.thread,
  });
  h.thread.title = "Build a calendar";
  h.user("Build a useful calendar application");
  await h.emit();
  await finishWorker(h, { title: "Build a calendar" });
  h.thread.title = "My chosen name";
  h.user("Second");
  h.user("Third");
  h.endTurn();
  vi.setSystemTime(Date.now() + 300_000);
  await h.harness.behavior.runSchedule("title-reconciliation");
  expect(h.spawned).toHaveLength(1);
  h.thread.title = "Build a calendar";
  await h.harness.behavior.runSchedule("title-reconciliation");
  expect(h.spawned).toHaveLength(1);
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

function answers(h: Awaited<ReturnType<typeof setup>>, count: number) {
  for (let i = 0; i < count; i++) {
    const seq = h.events.length + 1;
    h.events.push({
      id: `answer-${seq}`,
      threadId: "real",
      seq,
      createdAt: Date.now(),
      scope: { kind: "turn", turnId: "first-turn" },
      type: "item/completed",
      data: { item: { id: `a${seq}`, type: "agentMessage", text: `Assistant response ${seq}` } },
    });
  }
}

it("titles an oversized transcript from the opening that fits", async () => {
  const h = await setup();
  await h.harness.behavior.setSettings({ maxTranscriptBytes: 1_000 });
  await h.harness.behavior.emitThreadEvent("thread.created", {
    thread: h.thread,
  });
  h.thread.title = "Build a calendar";
  h.user("Build a useful calendar application");
  answers(h, 40);
  h.endTurn();
  await h.emit();
  expect(h.spawned).toHaveLength(1);
  const prompt = String(h.spawned[0]?.prompt);
  expect(prompt).toContain("Build a useful calendar application");
  expect(prompt).toContain("Assistant response 2");
  expect(prompt).not.toContain("Assistant response 41");
  expect(prompt).toContain("cut off after its first 1000 bytes");
});

it("skips a transcript whose first message alone exceeds the size limit", async () => {
  const h = await setup();
  await h.harness.behavior.setSettings({ maxTranscriptBytes: 1_000 });
  await h.harness.behavior.emitThreadEvent("thread.created", {
    thread: h.thread,
  });
  h.thread.title = "Build a calendar";
  h.user("x".repeat(2_000));
  h.endTurn();
  await h.emit();
  expect(h.spawned).toHaveLength(0);
});

it("starts the first title mid-turn once the transcript reaches a quarter of the size limit", async () => {
  const h = await setup();
  await h.harness.behavior.setSettings({ maxTranscriptBytes: 40_000 });
  await h.harness.behavior.emitThreadEvent("thread.created", {
    thread: h.thread,
  });
  h.thread.title = "Build a calendar";
  h.user("Build a useful calendar application");
  await h.emit();
  await finishWorker(h, { title: "Build a calendar" });
  answers(h, 100);
  await h.emit();
  expect(h.spawned).toHaveLength(1);
  answers(h, 100);
  await h.emit();
  expect(h.spawned).toHaveLength(2);
  expect(h.thread.status).toBe("active");
  expect(h.spawned[1]?.prompt).toContain("Assistant response 201");
  expect(h.spawned[1]?.prompt).not.toContain("cut off");
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

// bb's own title step at creation: it records the outcome, then stores the title.
function bbTitle(h: Awaited<ReturnType<typeof setup>>, title: string | null) {
  const seq = h.events.length + 1;
  h.events.push({
    id: `provisioning-${seq}`,
    threadId: "real",
    seq,
    createdAt: Date.now(),
    scope: { kind: "thread" },
    type: "system/thread-provisioning",
    data: {
      entries: [{ type: "step", key: "metadata-completed", status: "completed", metadata: { titleGenerated: title !== null } }],
    },
  });
}

async function finishWorker(h: Awaited<ReturnType<typeof setup>>, output: unknown) {
  h.harness.inspection.sdk.stub("threads.output", async () => ({ output: JSON.stringify(output) }));
  h.worker.status = "idle";
  h.workerEvents.push({ seq: 1, type: "turn/completed", data: { status: "completed" } });
  await h.harness.behavior.emitThreadEvent("thread.idle", { thread: h.worker, lastAssistantText: null });
  h.worker.id = `${h.worker.id}-next`;
  h.worker.status = "active";
  h.workerEvents.length = 0;
}

it("titles the first message once bb has stored its title, then again after the first turn", async () => {
  const h = await setup();
  await h.harness.behavior.emitThreadEvent("thread.created", { thread: h.thread });
  h.user("Update branch from origin/main and install plugins from this worktree");
  await h.emit();
  bbTitle(h, "Update from origin/main and install worktree");
  await h.emit();
  expect(h.spawned).toHaveLength(0);
  h.thread.title = "Update from origin/main and install worktree";
  await h.emit();
  expect(h.spawned).toHaveLength(1);
  expect(h.spawned[0]?.pluginMetadata).toMatchObject({ phase: "message" });
  expect(h.spawned[0]?.prompt).toContain('Current title: "Update from origin/main and install worktree"');
  expect(h.spawned[0]?.prompt).toContain("44 characters, over the 40-character limit");
  await finishWorker(h, { title: "Install plugins from worktree" });
  expect(h.updates).toEqual([{ threadId: "real", title: "Install plugins from worktree" }]);
  h.endTurn();
  await h.emit();
  expect(h.spawned).toHaveLength(2);
  expect(h.spawned[1]?.pluginMetadata).toMatchObject({ phase: "initial" });
  expect(h.spawned[1]?.prompt).toContain('Current title: "Install plugins from worktree"');
});

it("titles the first message from bb's fallback when bb generated no title", async () => {
  const h = await setup();
  await h.harness.behavior.emitThreadEvent("thread.created", { thread: h.thread });
  h.user("Build a useful calendar application");
  bbTitle(h, null);
  await h.emit();
  expect(h.spawned).toHaveLength(1);
  expect(h.spawned[0]?.prompt).toContain('Current title: "Build a useful calendar application"');
  await finishWorker(h, { title: "Build a calendar app" });
  expect(h.updates).toEqual([{ threadId: "real", title: "Build a calendar app" }]);
});

it("still titles the first turn after the first-message pass fails", async () => {
  const h = await setup();
  await h.harness.behavior.emitThreadEvent("thread.created", { thread: h.thread });
  h.user("Build a useful calendar application");
  bbTitle(h, null);
  await h.emit();
  expect(h.spawned).toHaveLength(1);
  await finishWorker(h, { title: "" });
  expect(h.updates).toHaveLength(0);
  h.endTurn();
  await h.emit();
  expect(h.spawned).toHaveLength(2);
  expect(h.spawned[1]?.pluginMetadata).toMatchObject({ phase: "initial" });
});

it("never titles again after a rename during the first-message pass", async () => {
  const h = await setup();
  await h.harness.behavior.emitThreadEvent("thread.created", { thread: h.thread });
  h.user("Build a useful calendar application");
  bbTitle(h, "Build a calendar");
  h.thread.title = "Build a calendar";
  await h.emit();
  expect(h.spawned).toHaveLength(1);
  h.thread.title = "My calendar";
  await finishWorker(h, { title: "Build a calendar app" });
  h.endTurn();
  h.user("Second");
  h.user("Third");
  await h.emit();
  await h.harness.behavior.runSchedule("title-reconciliation");
  expect(h.updates).toHaveLength(0);
  expect(h.spawned).toHaveLength(1);
});

it("titles the first message right away when bb's own titles are off", async () => {
  const h = await setup();
  await h.harness.behavior.emitThreadEvent("thread.created", { thread: h.thread });
  h.user("Build a useful calendar application");
  await h.emit();
  expect(h.spawned).toHaveLength(0);
  h.bbTitles.mode = "off";
  await h.emit();
  expect(h.spawned).toHaveLength(1);
  expect(h.spawned[0]?.pluginMetadata).toMatchObject({ phase: "message" });
  expect(h.spawned[0]?.prompt).toContain('Current title: "Build a useful calendar application"');
});

it("skips the first-message pass when the first turn ends before bb stores a title", async () => {
  const h = await setup();
  await h.harness.behavior.emitThreadEvent("thread.created", { thread: h.thread });
  h.user("Build a useful calendar application");
  h.endTurn();
  await h.emit();
  expect(h.spawned).toHaveLength(1);
  expect(h.spawned[0]?.pluginMetadata).toMatchObject({ phase: "initial" });
});

it("skips the first-message pass when it is turned off", async () => {
  const h = await setup();
  await h.harness.behavior.setSettings({ titleFirstMessage: false });
  await h.harness.behavior.emitThreadEvent("thread.created", { thread: h.thread });
  h.user("Build a useful calendar application");
  bbTitle(h, "Build a calendar");
  h.thread.title = "Build a calendar";
  await h.emit();
  expect(h.spawned).toHaveLength(0);
  h.endTurn();
  await h.emit();
  expect(h.spawned).toHaveLength(1);
  expect(h.spawned[0]?.pluginMetadata).toMatchObject({ phase: "initial" });
});

it("goes from the first-message pass to the third-message review when the first-turn pass is off", async () => {
  const h = await setup();
  await h.harness.behavior.setSettings({ titleFirstTurn: false });
  await h.harness.behavior.emitThreadEvent("thread.created", { thread: h.thread });
  h.user("Build a useful calendar application");
  bbTitle(h, null);
  await h.emit();
  expect(h.spawned).toHaveLength(1);
  await finishWorker(h, { title: "Build a calendar app" });
  h.endTurn();
  await h.emit();
  expect(h.spawned).toHaveLength(1);
  h.user("Add sharing");
  h.user("Include invitations");
  await h.emit();
  expect(h.spawned).toHaveLength(2);
  expect(h.spawned[1]?.pluginMetadata).toMatchObject({ phase: "refinement" });
  expect(h.spawned[1]?.prompt).toContain('Current title: "Build a calendar app"');
});

it("waits for the first turn to end when early titling is off", async () => {
  const h = await setup();
  await h.harness.behavior.setSettings({ maxTranscriptBytes: 40_000, titleFirstMessage: false, titleLongFirstTurnEarly: false });
  await h.harness.behavior.emitThreadEvent("thread.created", { thread: h.thread });
  h.thread.title = "Build a calendar";
  h.user("Build a useful calendar application");
  answers(h, 200);
  await h.emit();
  expect(h.spawned).toHaveLength(0);
  h.endTurn();
  await h.emit();
  expect(h.spawned).toHaveLength(1);
});

it("never reviews on the third message when that review is off", async () => {
  const h = await setup();
  await h.harness.behavior.setSettings({ reviewOnThirdMessage: false });
  await h.harness.behavior.emitThreadEvent("thread.created", { thread: h.thread });
  h.user("Calendar");
  h.endTurn();
  await h.emit();
  expect(h.spawned).toHaveLength(1);
  await finishWorker(h, { title: "Build a shared calendar" });
  h.user("Add sharing");
  h.user("Include invitations");
  await h.emit();
  await h.harness.behavior.runSchedule("title-reconciliation");
  expect(h.spawned).toHaveLength(1);
  expect(h.harness.inspection.logEntries.map((entry) => entry.message)).toContain(
    "Thread real: title refinement skipped (Third-message review turned off)",
  );
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
  expect(h.spawned[1]?.prompt).toContain("generic, materially inaccurate, or longer than 40 characters");
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

it("shortens a title over the length limit on the third user message", async () => {
  const h = await firstTitle();
  await h.harness.behavior.setSettings({ maxTitleLength: 20 });
  h.user("Add sharing");
  h.user("Include invitations");
  await h.emit();
  expect(h.spawned).toHaveLength(2);
  expect(h.spawned[1]?.prompt).toContain("23 characters, over the 20-character limit");
  await decide(h, { action: "rename", reason: "too-long", title: "Shared calendar" });
  expect(h.updates).toHaveLength(2);
  expect(h.thread.title).toBe("Shared calendar");
});

it("retries once instead of keeping a title over the length limit", async () => {
  const h = await firstTitle();
  await h.harness.behavior.setSettings({ maxTitleLength: 20 });
  h.user("Add sharing");
  h.user("Include invitations");
  await h.emit();
  await decide(h, { action: "keep" });
  await h.harness.behavior.runSchedule("title-reconciliation");
  expect(h.spawned).toHaveLength(3);
  expect(h.updates).toHaveLength(1);
});

it("rejects a too-long rename of a title within the length limit", async () => {
  const h = await firstTitle();
  h.user("Add sharing");
  h.user("Include invitations");
  await h.emit();
  await decide(h, { action: "rename", reason: "too-long", title: "Shared calendar" });
  await h.harness.behavior.runSchedule("title-reconciliation");
  expect(h.spawned).toHaveLength(2);
  expect(h.updates).toHaveLength(1);
});

it("asks for a title within the length limit and retries an over-long one once on the same model", async () => {
  const h = await setup();
  const long = "Update from origin/main and install worktree plugins";
  await firstTurn(h);
  expect(h.spawned[0]?.prompt).toContain("at most 40 characters");
  h.harness.inspection.sdk.stub("threads.output", async () => ({ output: JSON.stringify({ title: long }) }));
  h.worker.status = "idle";
  h.workerEvents.push({ seq: 1, type: "turn/completed", data: { status: "completed" } });
  await h.harness.behavior.emitThreadEvent("thread.idle", { thread: h.worker, lastAssistantText: null });
  await h.harness.behavior.runSchedule("title-reconciliation");
  expect(h.updates).toHaveLength(0);
  expect(h.spawned.map((spawn) => spawn.model)).toEqual(["gpt-6-luna", "gpt-6-luna"]);
  expect(h.spawned[1]?.prompt).toContain(`A previous reply, ${JSON.stringify(long)}, is longer than 40 characters`);
  await recoverWorker(h);
  h.worker.status = "idle";
  h.workerEvents.push({ seq: 1, type: "turn/completed", data: { status: "completed" } });
  await h.harness.behavior.emitThreadEvent("thread.idle", { thread: h.worker, lastAssistantText: null });
  await h.harness.behavior.runSchedule("title-reconciliation");
  expect(h.updates).toHaveLength(0);
  expect(h.spawned).toHaveLength(2);
});

it("tells the first pass when the current title is over the length limit", async () => {
  const h = await setup();
  await h.harness.behavior.emitThreadEvent("thread.created", { thread: h.thread });
  h.thread.title = "Update from origin/main and install worktree";
  h.user("Update branch from origin/main and install plugins from this worktree");
  h.endTurn();
  await h.emit();
  expect(h.spawned[0]?.prompt).toContain("44 characters, over the 40-character limit");
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

it("suggests the newest Codex Luna model until a model is selected", async () => {
  const h = await setup();
  expect(await h.harness.behavior.callRpc("selection.get", null)).toEqual({
    selection: null,
    suggestion: {
      providerId: "codex",
      model: "gpt-6-luna",
      reasoningLevel: "low",
    },
    automaticName: "gpt-6-luna",
  });
  expect(h.modelQueries.at(-1)?.hostId).toBeUndefined();
});

it("titles every thread with the newest Codex Luna model by default", async () => {
  const h = await setup();
  h.thread.providerId = "claude-code";
  await firstTurn(h);
  expect(h.spawned[0]).toMatchObject({
    providerId: "codex",
    model: "gpt-6-luna",
    reasoningLevel: "low",
    environment: { type: "host", hostId: "host" },
  });
});

it("uses the next Luna model when the thread's machine lacks the newest", async () => {
  const h = await setup();
  h.catalogs.codex = ["gpt-5.4-mini", "gpt-5.6-luna"];
  await firstTurn(h);
  expect(h.spawned[0]).toMatchObject({
    providerId: "codex",
    model: "gpt-5.6-luna",
  });
});

it("skips a thread whose machine offers no Codex Luna model", async () => {
  const h = await setup();
  h.catalogs.codex = ["gpt-5.4-mini"];
  await firstTurn(h);
  expect(h.spawned).toHaveLength(0);
});

it.each([
  { name: "a provider-defined tier", serviceTier: "priority" },
  { name: "a long provider-defined tier", serviceTier: `provider:${"tier-".repeat(30)}` },
])("runs title workers with $name on the thread's host", async ({ serviceTier }) => {
  const h = await setup();
  const selection = {
    providerId: "claude-code",
    model: "claude-sonnet-5",
    reasoningLevel: "medium",
    serviceTier,
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

it("uses the automatic model when the selected model is unavailable on the thread's host", async () => {
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
  expect(h.spawned).toHaveLength(1);
  expect(h.spawned[0].model).toBe("gpt-6-luna");
  vi.setSystemTime(Date.now() + 300_000);
  h.catalogs["claude-code"] = ["claude-sonnet-5"];
  await h.harness.behavior.runSchedule("title-reconciliation");
  expect(h.spawned).toHaveLength(1);
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
    model: "gpt-6-luna",
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

async function failWorker(
  h: Awaited<ReturnType<typeof setup>>,
  category: string,
) {
  h.worker.status = "error";
  h.workerEvents.push(
    { seq: h.workerEvents.length + 1, type: "provider/error", data: { errorInfo: { category, httpStatusCode: 429, providerCode: null } } },
    { seq: h.workerEvents.length + 2, type: "turn/completed", data: { status: "failed" } },
  );
  await h.harness.behavior.emitThreadEvent("thread.failed", {
    thread: h.worker,
    error: null,
  });
}

async function recoverWorker(h: Awaited<ReturnType<typeof setup>>) {
  h.worker.id = "fallback-worker";
  h.worker.status = "active";
  h.workerEvents.length = 0;
}

it("retries once on the next Luna model after a transient failure", async () => {
  const h = await setup();
  await firstTurn(h);
  await failWorker(h, "rate-limit");
  vi.setSystemTime(Date.now() + 900_000);
  await h.harness.behavior.runSchedule("title-reconciliation");
  expect(h.spawned.map((spawn) => spawn.model)).toEqual([
    "gpt-6-luna",
    "gpt-5.6-luna",
  ]);
  await recoverWorker(h);
  h.worker.status = "idle";
  h.workerEvents.push({ seq: 1, type: "turn/completed", data: { status: "completed" } });
  await h.harness.behavior.emitThreadEvent("thread.idle", {
    thread: h.worker,
    lastAssistantText: null,
  });
  expect(h.updates).toEqual([
    { threadId: "real", title: "Build a shared calendar" },
  ]);
});

it("falls back after the worker times out, then never a third time", async () => {
  const h = await setup();
  await firstTurn(h);
  await h.harness.behavior.runSchedule("title-reconciliation");
  vi.setSystemTime(Date.now() + 120_000);
  await h.harness.behavior.runSchedule("title-reconciliation");
  await h.harness.behavior.runSchedule("title-reconciliation");
  expect(h.spawned.map((spawn) => spawn.model)).toEqual([
    "gpt-6-luna",
    "gpt-5.6-luna",
  ]);
  await recoverWorker(h);
  await failWorker(h, "overloaded");
  vi.setSystemTime(Date.now() + 300_000);
  await h.harness.behavior.runSchedule("title-reconciliation");
  expect(h.spawned).toHaveLength(2);
});

it("does not fall back after a permanent failure", async () => {
  const h = await setup();
  await firstTurn(h);
  await failWorker(h, "unauthorized");
  await h.harness.behavior.runSchedule("title-reconciliation");
  expect(h.spawned).toHaveLength(1);


});

it("recovers a lost fallback spawn without adopting the failed worker", async () => {
  const h = await setup();
  await firstTurn(h);
  await failWorker(h, "rate-limit");
  vi.setSystemTime(Date.now() + 900_000);
  h.harness.inspection.sdk.stub("threads.spawn", async () => {
    throw new Error("connection reset");
  });
  await h.harness.behavior.runSchedule("title-reconciliation");
  const next = await h.harness.lifecycle.reload(plugin);
  cleanups.push(() => next.harness.lifecycle.dispose());
  next.harness.inspection.sdk.stub("threads.list", async ({ offset }) =>
    (offset ? [] : [h.worker]) as never,
  );
  await next.harness.behavior.runSchedule("title-reconciliation");
  expect(h.updates).toHaveLength(0);
  expect(h.spawned).toHaveLength(1);
  expect(next.harness.inspection.logEntries.map((entry) => entry.message)).toContain(
    "Thread real: title refinement skipped (Interrupted before worker creation could be confirmed)",
  );
});


it("falls back from a selected Codex model after the reset, across restart", async () => {
  const h = await setup();
  await h.harness.behavior.callRpc("selection.set", {
    selection: { providerId: "codex", model: "gpt-6-luna", reasoningLevel: "medium" },
  });
  await h.harness.behavior.emitThreadEvent("thread.created", { thread: h.thread });
  h.user("Continue from @thread:earlier");
  h.endTurn();
  await h.emit();
  const reset = Date.now() + 3_600_000;
  h.workerEvents.push({ seq: 1, type: "provider/rateLimits/updated", data: {
    rateLimits: { kind: "subscription-window", status: "blocked", windows: [
      { status: "blocked", resetsAtMs: reset },
    ] },
  } });
  await failWorker(h, "rate-limit");
  expect(h.harness.inspection.sdk.callsTo("threads.archive")).toHaveLength(1);
  const next = await h.harness.lifecycle.reload(plugin);
  cleanups.push(() => next.harness.lifecycle.dispose());
  vi.setSystemTime(reset);
  await next.harness.behavior.runSchedule("title-reconciliation");
  expect(h.spawned).toHaveLength(1);
  await recoverWorker(h);
  vi.setSystemTime(reset + 15_000);
  await next.harness.behavior.runSchedule("title-reconciliation");
  expect(h.spawned.map((s) => s.model)).toEqual(["gpt-6-luna", "gpt-5.6-luna"]);
  h.worker.status = "idle";
  h.workerEvents.push({ seq: 1, type: "turn/completed", data: { status: "completed" } });
  await next.harness.behavior.runSchedule("title-reconciliation");
  expect(h.thread.title).toBe("Build a shared calendar");
});

it("tries the selected model then both automatic models and keeps the saved selection", async () => {
  const h = await setup();
  const selection = { providerId: "claude-code", model: "claude-sonnet-5", reasoningLevel: "medium", serviceTier: "fast" };
  await h.harness.behavior.callRpc("selection.set", { selection });
  await firstTurn(h);
  await failWorker(h, "overloaded");

  await recoverWorker(h);
  await h.harness.behavior.runSchedule("title-reconciliation");
  await failWorker(h, "overloaded");
  await recoverWorker(h);
  h.worker.id = "automatic-worker";
  vi.setSystemTime(Date.now() + 60_000);
  await h.harness.behavior.runSchedule("title-reconciliation");
  expect(h.spawned.map((s) => s.model)).toEqual(["claude-sonnet-5", "gpt-6-luna", "gpt-5.6-luna"]);
  expect(h.spawned[2]).toMatchObject({ providerId: "codex", reasoningLevel: "low" });
  expect(h.spawned[2]).not.toHaveProperty("serviceTier");
  await failWorker(h, "overloaded");
  vi.setSystemTime(Date.now() + 3_600_000);
  await h.harness.behavior.runSchedule("title-reconciliation");
  expect(h.spawned).toHaveLength(3);
  expect(h.harness.inspection.sdk.callsTo("threads.archive")).toHaveLength(3);
  expect(await h.harness.behavior.callRpc("selection.get", null)).toMatchObject({ selection });
});

it("recovers an untitled thread on its third message after temporary failures exhaust the first-turn budget", async () => {
  const h = await setup();
  await h.harness.behavior.callRpc("selection.set", {
    selection: { providerId: "claude-code", model: "claude-sonnet-5", reasoningLevel: "low" },
  });
  await h.harness.behavior.emitThreadEvent("thread.created", { thread: h.thread });
  h.user("Continue from @thread:earlier");
  h.endTurn();
  await h.emit();
  await failWorker(h, "overloaded");
  vi.setSystemTime(Date.now() + 60_000);
  await recoverWorker(h);
  await h.harness.behavior.runSchedule("title-reconciliation");
  await failWorker(h, "overloaded");
  await recoverWorker(h);
  h.worker.id = "automatic-worker";
  vi.setSystemTime(Date.now() + 60_000);
  await h.harness.behavior.runSchedule("title-reconciliation");
  await failWorker(h, "overloaded");
  h.user("Add calendar sharing");
  await h.emit();
  expect(h.spawned).toHaveLength(3);
  h.user("Show everyone's availability");
  await recoverWorker(h);
  h.worker.id = "review-worker";
  vi.setSystemTime(Date.now() + 60_000);
  await h.emit();
  expect(h.spawned).toHaveLength(4);
  expect(h.spawned[3].model).toBe("claude-sonnet-5");
  h.worker.status = "idle";
  h.workerEvents.push({ seq: 1, type: "turn/completed", data: { status: "completed" } });
  await h.harness.behavior.runSchedule("title-reconciliation");
  expect(h.thread.title).toBe("Build a shared calendar");
});

it("honors a user rename while a selected-model retry is waiting", async () => {
  const h = await setup();
  await h.harness.behavior.callRpc("selection.set", {
    selection: { providerId: "claude-code", model: "claude-sonnet-5", reasoningLevel: "low" },
  });
  await h.harness.behavior.emitThreadEvent("thread.created", { thread: h.thread });
  h.user("Continue from @thread:earlier");
  h.endTurn();
  await h.emit();
  await failWorker(h, "rate-limit");
  h.thread.title = "My chosen title";
  vi.setSystemTime(Date.now() + 900_000);
  await h.harness.behavior.runSchedule("title-reconciliation");
  h.user("More context");
  h.user("Still more context");
  await h.emit();
  expect(h.spawned).toHaveLength(1);
  expect(h.updates).toHaveLength(0);
});

it("backs off unknown rate limits and preserves provider cooldown through later phases", async () => {
  const h = await setup();
  await h.harness.behavior.callRpc("selection.set", {
    selection: { providerId: "codex", model: "gpt-6-luna", reasoningLevel: "low" },
  });
  await firstTurn(h);
  await failWorker(h, "rate-limit");
  vi.setSystemTime(Date.now() + 899_999);
  await h.harness.behavior.runSchedule("title-reconciliation");
  expect(h.spawned).toHaveLength(1);
  vi.setSystemTime(Date.now() + 1);
  await recoverWorker(h);
  await h.harness.behavior.runSchedule("title-reconciliation");
  expect(h.spawned[1].model).toBe("gpt-5.6-luna");
  await failWorker(h, "rate-limit");
  h.user("More context");
  h.user("Third message");
  await h.emit();
  expect(h.spawned).toHaveLength(2);
  const next = await h.harness.lifecycle.reload(plugin);
  cleanups.push(() => next.harness.lifecycle.dispose());
  vi.setSystemTime(Date.now() + 900_000);
  await recoverWorker(h);
  h.worker.id = "review-worker";
  await next.harness.behavior.runSchedule("title-reconciliation");
  expect(h.spawned[2].model).toBe("gpt-6-luna");
});

it("finishes interrupted worker retirement before spawning fallback after reload", async () => {
  const h = await setup();
  await h.harness.behavior.callRpc("selection.set", {
    selection: { providerId: "claude-code", model: "claude-sonnet-5", reasoningLevel: "low" },
  });
  await firstTurn(h);
  h.harness.inspection.sdk.stub("threads.archive", async () => { throw new Error("offline"); });
  await failWorker(h, "rate-limit");
  expect(h.spawned).toHaveLength(1);
  const next = await h.harness.lifecycle.reload(plugin);
  cleanups.push(() => next.harness.lifecycle.dispose());
  const retired: string[] = [];
  next.harness.inspection.sdk.stub("threads.archive", async ({ threadId }) => {
    retired.push(threadId);
    return { count: 1 } as never;
  });
  await next.harness.behavior.runSchedule("title-reconciliation");
  expect(retired).toEqual(["worker"]);
  expect(h.spawned.map((s) => s.model)).toEqual(["claude-sonnet-5", "gpt-6-luna"]);
  await recoverWorker(h);
  h.worker.status = "idle";
  h.workerEvents.push({ seq: 1, type: "turn/completed", data: { status: "completed" } });
  await next.harness.behavior.runSchedule("title-reconciliation");
  expect(h.thread.title).toBe("Build a shared calendar");
});

it("falls back across providers on permanent errors and protects renames during fallback", async () => {
  for (const category of ["unauthorized", "rate-limit"]) {
    const h = await setup();
    await h.harness.behavior.callRpc("selection.set", {
      selection: { providerId: "claude-code", model: "claude-sonnet-5", reasoningLevel: "low" },
    });
    await firstTurn(h);
    await failWorker(h, category);
    await recoverWorker(h);
    await h.harness.behavior.runSchedule("title-reconciliation");
    expect(h.spawned).toHaveLength(2);
    expect(h.spawned[1].providerId).toBe("codex");
    h.thread.title = "My chosen title";
    await finishWorker(h, { title: "Unwanted title" });
    h.user("More context");
    h.user("Third message");
    await h.emit();
    expect(h.thread.title).toBe("My chosen title");
    expect(h.updates).toHaveLength(0);
  }
});

it("recovers a legacy untitled selected-model failure on the third message only when transient", async () => {
  for (const category of ["rate-limit", "unauthorized"]) {
    const h = await setup();
    await h.harness.behavior.callRpc("selection.set", {
      selection: { providerId: "claude-code", model: "claude-sonnet-5", reasoningLevel: "low" },
    });
    await h.harness.behavior.emitThreadEvent("thread.created", { thread: h.thread });
    h.user("Continue from @thread:earlier");
    h.endTurn();
    await h.emit();
    h.workerEvents.push({ seq: 1, type: "provider/error", data: { errorInfo: { category } } });
    h.worker.archivedAt = Date.now();
    const db = h.bb.storage.database();
    const row = db.prepare("SELECT data FROM title_jobs WHERE thread_id = ?").get("real") as { data: string };
    const job = JSON.parse(row.data);
    delete job.choices;
    delete job.choiceIndex;
    Object.assign(job, { automatic: false, state: "skipped", cleaned: true, reason: "Title worker failed" });
    db.prepare("UPDATE title_jobs SET state = ?, data = ? WHERE thread_id = ?").run("skipped", JSON.stringify(job), "real");
    const next = await h.harness.lifecycle.reload(plugin);
    cleanups.push(() => next.harness.lifecycle.dispose());
    await next.harness.behavior.runSchedule("title-reconciliation");
    h.user("More context");
    h.user("Third message");
    vi.setSystemTime(Date.now() + 900_000);
    await recoverWorker(h);
    h.worker.archivedAt = null;
    await next.harness.behavior.runSchedule("title-reconciliation");
    expect(h.spawned).toHaveLength(category === "rate-limit" ? 2 : 1);
  }
});

it("stores a generated title even when it matches the prompt-derived fallback", async () => {
  const h = await setup();
  h.thread.titleFallback = "Build a shared calendar";
  await h.harness.behavior.emitThreadEvent("thread.created", { thread: h.thread });
  h.user("Build a shared calendar");
  h.endTurn();
  await h.emit();
  await finishWorker(h, { title: "Build a shared calendar" });
  expect(h.thread.title).toBe("Build a shared calendar");
});

it("does not replenish the model stack after an overlong reply", async () => {
  const h = await setup();
  await h.harness.behavior.callRpc("selection.set", {
    selection: { providerId: "claude-code", model: "claude-sonnet-5", reasoningLevel: "low" },
  });
  await firstTurn(h);
  await finishWorker(h, { title: "A".repeat(41) });
  await recoverWorker(h);
  await h.harness.behavior.runSchedule("title-reconciliation");
  await failWorker(h, "connection-failed");
  await recoverWorker(h);
  h.worker.id = "automatic-worker";
  await h.harness.behavior.runSchedule("title-reconciliation");
  await failWorker(h, "overloaded");
  vi.setSystemTime(Date.now() + 60_000);
  await recoverWorker(h);
  h.worker.id = "last-worker";
  await h.harness.behavior.runSchedule("title-reconciliation");
  await finishWorker(h, { title: "B".repeat(41) });
  await h.harness.behavior.runSchedule("title-reconciliation");
  expect(h.spawned.map((s) => s.model)).toEqual([
    "claude-sonnet-5", "claude-sonnet-5", "gpt-6-luna", "gpt-5.6-luna",
  ]);
  expect(h.updates).toHaveLength(0);
});

it("finishes a first-message fallback before starting a fresh first-turn stack", async () => {
  const h = await setup();
  await h.harness.behavior.callRpc("selection.set", {
    selection: { providerId: "claude-code", model: "claude-sonnet-5", reasoningLevel: "low" },
  });
  await h.harness.behavior.emitThreadEvent("thread.created", { thread: h.thread });
  h.user("Build a calendar");
  bbTitle(h, "Build a calendar");
  h.thread.title = "Build a calendar";
  await h.emit();
  await failWorker(h, "overloaded");
  h.endTurn();
  await recoverWorker(h);
  await h.harness.behavior.runSchedule("title-reconciliation");
  expect(h.spawned[1].pluginMetadata).toMatchObject({ phase: "message" });
  await finishWorker(h, { title: "Build a shared calendar" });
  vi.setSystemTime(Date.now() + 60_000);
  await recoverWorker(h);
  h.worker.id = "initial-worker";
  await h.harness.behavior.runSchedule("title-reconciliation");
  expect(h.spawned[2]).toMatchObject({ model: "claude-sonnet-5", pluginMetadata: { phase: "initial" } });
});


it.each(["error", "throw"] as const)("runs the selected model when the automatic catalog fails with %s", async (failure) => {
  const h = await setup();
  h.catalogFailures.codex = failure;
  await h.harness.behavior.callRpc("selection.set", {
    selection: { providerId: "claude-code", model: "claude-sonnet-5", reasoningLevel: "low" },
  });
  await firstTurn(h);
  expect(h.spawned).toHaveLength(1);
  expect(h.spawned[0].model).toBe("claude-sonnet-5");
  await finishWorker(h, { title: "Build a shared calendar" });
  expect(h.thread.title).toBe("Build a shared calendar");
});
