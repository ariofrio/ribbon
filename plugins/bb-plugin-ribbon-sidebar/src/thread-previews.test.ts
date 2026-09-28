import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PreviewStore } from "./preview-store";
import { registerThreadPreviews } from "./thread-previews";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

type ChangedEvent = {
  id?: string;
  changes: readonly string[];
  metadata?: { eventTypes?: readonly string[] };
};
type ListArgs = {
  threadId: string;
  order?: string;
  limit?: string;
  types?: readonly string[];
  beforeSeq?: string;
};
type Event = { seq: number; type: string; data: Record<string, unknown> };

const agentMessage = (seq: number, text: string): Event => ({
  seq,
  type: "item/completed",
  data: { item: { type: "agentMessage", id: `m${seq}`, text } },
});
const command = (seq: number): Event => ({
  seq,
  type: "item/completed",
  data: { item: { type: "commandExecution", id: `c${seq}`, command: "ls" } },
});
const userTurn = (seq: number, text: string): Event => ({
  seq,
  type: "client/turn/requested",
  data: { initiator: "user", input: [{ type: "text", text }] },
});

function fakeEventsList(threads: Record<string, Event[]>) {
  return vi.fn(async ({ threadId, order, limit, types, beforeSeq }: ListArgs) => {
    let rows = [...(threads[threadId] ?? [])];
    if (types) rows = rows.filter((row) => types.includes(row.type));
    if (beforeSeq !== undefined) rows = rows.filter((row) => row.seq < Number(beforeSeq));
    rows.sort((a, b) => (order === "desc" ? b.seq - a.seq : a.seq - b.seq));
    return rows.slice(0, Number(limit ?? 100));
  });
}

type Settings = { showMessagePreviews?: boolean };

function harness(args: {
  threads: Record<string, Event[]>;
  stored?: Record<string, { preview: string | null; sourceSeq: number | null }>;
  settings?: Settings;
}) {
  let current: Settings = args.settings ?? {};
  const settingListeners = new Set<(next: Settings) => void>();
  const settings = {
    get: async () => current,
    onChange: (listener: (next: Settings) => void) => {
      settingListeners.add(listener);
    },
  };
  let service: { start(signal: AbortSignal): unknown } | null = null;
  let changed: ((event: ChangedEvent) => void) | null = null;
  const stored = new Map(Object.entries(args.stored ?? {}));
  const set = vi.fn((threadId: string, preview: string | null, sourceSeq: number) => {
    const previous = stored.get(threadId);
    stored.set(threadId, { preview, sourceSeq });
    return previous?.preview !== preview;
  });
  const store = {
    set,
    get: (threadId: string) => stored.get(threadId),
    list: vi.fn(),
    delete: vi.fn(),
  } as unknown as PreviewStore;
  const publish = vi.fn();
  const list = fakeEventsList(args.threads);
  const threadsList = vi.fn(async (_args: { signal: AbortSignal }) =>
    Object.keys(args.threads).map((id) => ({ id })),
  );
  const timeline = vi.fn();
  const bb = {
    background: {
      service: (_name: string, registered: { start(signal: AbortSignal): unknown }) => {
        service = registered;
      },
    },
    realtime: { publish },
    log: { warn: vi.fn() },
    sdk: {
      subscribe: ({ callback }: { callback: typeof changed }) => {
        changed = callback;
        return () => { changed = null; };
      },
      threads: {
        list: threadsList,
        timeline,
        events: { list },
      },
    },
  } as unknown as BbPluginApi;
  const abort = new AbortController();
  registerThreadPreviews(bb, store, settings);
  const running = Promise.resolve(
    (service as unknown as { start(signal: AbortSignal): unknown }).start(abort.signal),
  );
  return {
    abort,
    running,
    list,
    threadsList,
    timeline,
    set,
    publish,
    emit: (event: ChangedEvent) => (changed as ((event: ChangedEvent) => void) | null)?.(event),
    subscribed: () => changed !== null,
    setSettings: (next: Settings) => {
      current = next;
      for (const listener of settingListeners) listener(next);
    },
    stop: async () => {
      abort.abort();
      await running;
    },
  };
}

describe("thread previews", () => {
  it.each([false, true])("stops during the initial settings read (shown=%s)", async (shown) => {
    const h = harness({ threads: {}, settings: { showMessagePreviews: shown } });
    await h.stop();
    expect(h.subscribed()).toBe(false);
  }, 500);

  it("observes a setting change during the initial settings read", async () => {
    const h = harness({
      threads: { "thread-a": [userTurn(1, "Prompt")] },
      settings: { showMessagePreviews: false },
    });
    h.setSettings({ showMessagePreviews: true });
    await vi.waitFor(() => expect(h.set).toHaveBeenCalledWith("thread-a", "Prompt", 1));
    await h.stop();
  });

  it("can restart after hiding previews cancels the initial thread listing", async () => {
    const h = harness({ threads: { "thread-a": [userTurn(1, "Prompt")] } });
    const finished = vi.fn();
    void h.running.then(finished, finished);
    h.threadsList.mockImplementationOnce(({ signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(new Error("Aborted")), { once: true });
    }));
    await vi.waitFor(() => expect(h.threadsList).toHaveBeenCalled());
    h.setSettings({ showMessagePreviews: false });
    await vi.waitFor(() => expect(h.subscribed()).toBe(false));
    h.setSettings({ showMessagePreviews: true });
    await vi.waitFor(() => expect(h.set).toHaveBeenCalledWith("thread-a", "Prompt", 1));
    expect(finished).not.toHaveBeenCalled();
    await h.stop();
  });

  it("does not store or publish an in-flight preview after stopping", async () => {
    vi.useFakeTimers();
    const h = harness({ threads: { "thread-a": [userTurn(1, "Prompt")] } });
    let finishRead!: (events: Event[]) => void;
    h.list.mockImplementationOnce(() => new Promise((resolve) => { finishRead = resolve; }));
    await vi.runAllTimersAsync();
    expect(h.list).toHaveBeenCalled();
    const stopped = h.stop();
    finishRead([userTurn(1, "Prompt")]);
    await stopped;
    await vi.runAllTimersAsync();
    expect(h.set).not.toHaveBeenCalled();
    expect(h.publish).not.toHaveBeenCalled();
  });

  it("derives previews from message events instead of building timelines", async () => {
    const h = harness({
      threads: {
        "thread-a": [userTurn(1, "Start"), command(2), agentMessage(3, "Latest output"), command(4)],
        "thread-b": [userTurn(1, "Only a prompt")],
      },
    });
    await vi.waitFor(() => expect(h.set).toHaveBeenCalledTimes(2));
    expect(h.set).toHaveBeenCalledWith("thread-a", "Latest output", 4);
    expect(h.set).toHaveBeenCalledWith("thread-b", "Only a prompt", 1);
    expect(h.timeline).not.toHaveBeenCalled();
    for (const call of h.list.mock.calls) {
      expect(Number(call[0].limit)).toBeLessThanOrEqual(20);
    }
    await h.stop();
  });

  it("skips threads whose stored preview already covers the latest event", async () => {
    const h = harness({
      threads: {
        "thread-a": [userTurn(1, "Start"), agentMessage(2, "Same")],
        "thread-b": [userTurn(1, "Start"), agentMessage(2, "Changed"), agentMessage(3, "Newer")],
        "thread-c": [userTurn(1, "Never computed")],
      },
      stored: {
        "thread-a": { preview: "Same", sourceSeq: 2 },
        "thread-b": { preview: "Changed", sourceSeq: 2 },
        "thread-c": { preview: "Legacy", sourceSeq: null },
      },
    });
    await vi.waitFor(() => expect(h.set).toHaveBeenCalledTimes(2));
    expect(h.set).toHaveBeenCalledWith("thread-b", "Newer", 3);
    expect(h.set).toHaveBeenCalledWith("thread-c", "Never computed", 1);
    expect(h.list.mock.calls.filter(([call]) => call.threadId === "thread-a")).toHaveLength(1);
    await h.stop();
  });

  it("pages past long tool runs and stops once a user message is newer", async () => {
    const commands = Array.from({ length: 125 }, (_, i) => command(10 + i));
    const h = harness({
      threads: {
        "thread-a": [userTurn(1, "Prompt"), agentMessage(2, "Old reply"), ...commands],
        "thread-b": [
          agentMessage(1, "Reply"),
          ...Array.from({ length: 30 }, (_, i) => command(2 + i)),
          userTurn(32, "Follow-up"),
        ],
      },
    });
    await vi.waitFor(() => expect(h.set).toHaveBeenCalledTimes(2));
    expect(h.set).toHaveBeenCalledWith("thread-a", "Old reply", 134);
    expect(h.set).toHaveBeenCalledWith("thread-b", "Follow-up", 32);
    const itemPages = (threadId: string) =>
      h.list.mock.calls.filter(([call]) => call.threadId === threadId && call.types?.includes("item/completed"));
    expect(itemPages("thread-a")).toHaveLength(7);
    expect(itemPages("thread-b")).toHaveLength(1);
    await h.stop();
  });

  it("serializes refreshes, ignores deltas, and publishes on change", async () => {
    const threads = { "thread-a": [userTurn(1, "Start"), agentMessage(2, "Latest output")] };
    const h = harness({ threads });
    let inFlight = 0;
    let peak = 0;
    h.list.mockImplementation(async (args: ListArgs) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await Promise.resolve();
      inFlight -= 1;
      return fakeEventsList(threads)(args);
    });
    await vi.waitFor(() => expect(h.set).toHaveBeenCalledWith("thread-a", "Latest output", 2));
    expect(peak).toBe(1);

    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
    const scheduledBeforeDelta = setTimeoutSpy.mock.calls.length;
    h.emit({
      id: "thread-a",
      changes: ["events-appended"],
      metadata: { eventTypes: ["item/agentMessage/delta"] },
    });
    expect(setTimeoutSpy).toHaveBeenCalledTimes(scheduledBeforeDelta);

    threads["thread-a"].push(command(3), agentMessage(4, "Newer output"));
    const before = h.set.mock.calls.length;
    h.emit({
      id: "thread-a",
      changes: ["events-appended"],
      metadata: { eventTypes: ["item/completed"] },
    });
    await vi.waitFor(() => expect(h.set.mock.calls.length).toBeGreaterThan(before));
    expect(h.set).toHaveBeenLastCalledWith("thread-a", "Newer output", 4);
    await vi.waitFor(() =>
      expect(h.publish).toHaveBeenCalledWith("previews-changed", { threadId: "thread-a" }),
    );
    await h.stop();
  });

  it("keeps the latest visible prompt when a newer system prompt is suppressed", async () => {
    const h = harness({
      threads: {
        "thread-a": [
          agentMessage(1, "Earlier reply"),
          userTurn(2, "Visible follow-up"),
          {
            ...userTurn(3, "Hidden system prompt"),
            data: {
              initiator: "system",
              systemMessageSubject: { kind: "tool-call", suppress: true },
              input: [{ type: "text", text: "Hidden system prompt" }],
            },
          },
        ],
      },
    });
    await vi.waitFor(() => expect(h.set).toHaveBeenCalledWith("thread-a", "Visible follow-up", 3));
    await h.stop();
  });

  it("does nothing while previews are hidden and starts when they are shown", async () => {
    vi.useFakeTimers();
    const h = harness({
      threads: { "thread-a": [userTurn(1, "Start"), agentMessage(2, "Reply")] },
      settings: { showMessagePreviews: false },
    });
    await vi.runAllTimersAsync();
    expect(h.list).not.toHaveBeenCalled();
    expect(h.subscribed()).toBe(false);

    h.setSettings({ showMessagePreviews: true });
    await vi.runAllTimersAsync();
    expect(h.set).toHaveBeenCalledWith("thread-a", "Reply", 2);
    expect(h.subscribed()).toBe(true);

    h.setSettings({ showMessagePreviews: false });
    await vi.runAllTimersAsync();
    expect(h.subscribed()).toBe(false);
    const calls = h.list.mock.calls.length;
    h.emit({
      id: "thread-a",
      changes: ["events-appended"],
      metadata: { eventTypes: ["item/completed"] },
    });
    await vi.runAllTimersAsync();
    expect(h.list.mock.calls.length).toBe(calls);
    await h.stop();
  });
});
