import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PreviewStore } from "./preview-store";
import { registerThreadPreviews } from "./thread-previews";

afterEach(() => vi.restoreAllMocks());

describe("thread previews", () => {
  it("serializes timeline refreshes, persists changes, and ignores deltas", async () => {
    type ChangedEvent = {
      id?: string;
      changes: readonly string[];
      metadata?: { eventTypes?: readonly string[] };
    };
    let service: { start(signal: AbortSignal): unknown } | null = null;
    let changed: ((event: ChangedEvent) => void) | null = null;
    const set = vi.fn(() => true);
    const store = { set, list: vi.fn(), delete: vi.fn() } as PreviewStore;
    const publish = vi.fn();
    let inFlight = 0;
    let peakInFlight = 0;
    const timeline = vi.fn(async () => {
      inFlight += 1;
      peakInFlight = Math.max(peakInFlight, inFlight);
      await Promise.resolve();
      inFlight -= 1;
      return {
        rows: [
          {
            kind: "conversation",
            role: "assistant",
            text: "Latest output",
            sourceSeqEnd: 2,
          },
        ],
      };
    });
    const bb = {
      background: {
        service: (
          _name: string,
          registered: { start(signal: AbortSignal): unknown },
        ) => {
          service = registered;
        },
      },
      realtime: { publish },
      log: { warn: vi.fn() },
      sdk: {
        subscribe: ({ callback }: { callback: typeof changed }) => {
          changed = callback;
          return () => undefined;
        },
        threads: {
          list: async () => [{ id: "thread-a" }, { id: "thread-b" }],
          timeline,
        },
      },
    } as unknown as BbPluginApi;
    const abort = new AbortController();

    registerThreadPreviews(bb, store);
    expect(service).not.toBeNull();
    const registeredService = service as unknown as {
      start(signal: AbortSignal): unknown;
    };
    const running = Promise.resolve(registeredService.start(abort.signal));
    await vi.waitFor(() => expect(timeline).toHaveBeenCalledTimes(2));
    expect(peakInFlight).toBe(1);
    expect(set).toHaveBeenCalledWith("thread-a", "Latest output");

    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
    const scheduledBeforeDelta = setTimeoutSpy.mock.calls.length;
    const emitChanged = changed as unknown as (event: ChangedEvent) => void;
    emitChanged({
      id: "thread-a",
      changes: ["events-appended"],
      metadata: { eventTypes: ["item/agentMessage/delta"] },
    });
    expect(setTimeoutSpy).toHaveBeenCalledTimes(scheduledBeforeDelta);
    expect(timeline).toHaveBeenCalledTimes(2);

    emitChanged({
      id: "thread-a",
      changes: ["events-appended"],
      metadata: { eventTypes: ["item/completed"] },
    });
    await vi.waitFor(() => expect(timeline).toHaveBeenCalledTimes(3));
    await vi.waitFor(() =>
      expect(publish).toHaveBeenCalledWith("previews-changed", {
        threadId: null,
      }),
    );
    abort.abort();
    await running;
  });
});
