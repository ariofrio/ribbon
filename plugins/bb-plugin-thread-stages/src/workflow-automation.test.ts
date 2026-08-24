import type { BbPluginApi } from "@get-bb/plugin-sdk";
import Database from "better-sqlite3";
import { describe, expect, it, vi } from "vitest";
import {
  THREAD_WORKFLOW_MIGRATIONS,
  createThreadWorkflowStore,
} from "./store";
import {
  isActiveThreadLifecycle,
  registerThreadWorkflow,
} from "./workflow-automation";

describe("task workflow", () => {
  it.each([
    ["starting", true],
    ["active", true],
    ["stopping", true],
    ["idle", false],
    ["error", false],
  ] as const)("maps %s to isActive=%s", (status, expected) => {
    expect(isActiveThreadLifecycle(status)).toBe(expected);
  });

  it("applies lifecycle events without overriding a manual move while work continues", async () => {
    const db = new Database(":memory:");
    for (const migration of THREAD_WORKFLOW_MIGRATIONS) db.exec(migration);
    const store = createThreadWorkflowStore(db);
    const handlers = new Map<string, (payload: never) => unknown>();
    const services = new Map<string, { start(signal: AbortSignal): unknown }>();
    const publish = vi.fn();
    let pendingInteractions: Array<{ status: string }> = [];
    const bb = {
      events: {
        on: (event: string, handler: (payload: never) => unknown) => {
          handlers.set(event, handler);
        },
      },
      background: {
        service: (
          name: string,
          service: { start(signal: AbortSignal): unknown },
        ) => services.set(name, service),
      },
      realtime: { publish },
      log: { warn: vi.fn() },
      sdk: {
        threads: {
          interactions: { list: async () => pendingInteractions },
          timeline: async () => ({ activeBackgroundCommands: [] }),
        },
      },
    } as unknown as BbPluginApi;

    try {
      registerThreadWorkflow(bb, store);
      expect(services.has("stage-automation")).toBe(true);

      await handlers.get("thread.active")?.({
        thread: { id: "thr_a", status: "active" },
      } as never);
      expect(store.get("thr_a").workflowStage).toBe("Active");

      store.setStage("thr_a", "Blocked");
      await handlers.get("thread.active")?.({
        thread: { id: "thr_a", status: "active" },
      } as never);
      expect(store.get("thr_a").workflowStage).toBe("Blocked");
      expect(publish).toHaveBeenCalledTimes(1);
    } finally {
      db.close();
    }
  });

  it("removes stale task state instead of observing a child thread", async () => {
    const db = new Database(":memory:");
    for (const migration of THREAD_WORKFLOW_MIGRATIONS) db.exec(migration);
    const store = createThreadWorkflowStore(db);
    const handlers = new Map<string, (payload: never) => unknown>();
    const publish = vi.fn();
    const bb = {
      events: {
        on: (event: string, handler: (payload: never) => unknown) => {
          handlers.set(event, handler);
        },
      },
      background: { service: () => undefined },
      realtime: { publish },
      log: { warn: vi.fn() },
      sdk: {
        threads: { interactions: { list: vi.fn() } },
      },
    } as unknown as BbPluginApi;

    try {
      store.ensureThreads(["child"]);
      store.setStage("child", "Completed");
      registerThreadWorkflow(bb, store);

      await handlers.get("thread.active")?.({
        thread: {
          id: "child",
          parentThreadId: "parent",
          status: "active",
        },
      } as never);

      expect(store.get("child").explicit).toBe(false);
      expect(bb.sdk.threads.interactions.list).not.toHaveBeenCalled();
      expect(publish).toHaveBeenCalledWith("state-changed", {
        threadId: "child",
      });
    } finally {
      db.close();
    }
  });

  it("treats a thread waiting on the user as Idle while it stays active", async () => {
    const db = new Database(":memory:");
    for (const migration of THREAD_WORKFLOW_MIGRATIONS) db.exec(migration);
    const store = createThreadWorkflowStore(db);
    const handlers = new Map<string, (payload: never) => unknown>();
    let pendingInteractions: Array<{ status: string }> = [];
    const bb = {
      events: {
        on: (event: string, handler: (payload: never) => unknown) => {
          handlers.set(event, handler);
        },
      },
      background: { service: () => undefined },
      realtime: { publish: vi.fn() },
      log: { warn: vi.fn() },
      sdk: {
        threads: {
          interactions: { list: async () => pendingInteractions },
          timeline: async () => ({ activeBackgroundCommands: [] }),
        },
      },
    } as unknown as BbPluginApi;

    try {
      registerThreadWorkflow(bb, store);
      await handlers.get("thread.active")?.({
        thread: { id: "thr_a", status: "active" },
      } as never);
      expect(store.get("thr_a").workflowStage).toBe("Active");

      pendingInteractions = [{ status: "pending" }];
      await handlers.get("thread.active")?.({
        thread: { id: "thr_a", status: "active" },
      } as never);
      expect(store.get("thr_a").workflowStage).toBe("Idle");

      // Answering it puts the thread back to work without a status change.
      pendingInteractions = [];
      await handlers.get("thread.active")?.({
        thread: { id: "thr_a", status: "active" },
      } as never);
      expect(store.get("thr_a").workflowStage).toBe("Active");
    } finally {
      db.close();
    }
  });

  it("ignores interactions that are no longer pending", async () => {
    const db = new Database(":memory:");
    for (const migration of THREAD_WORKFLOW_MIGRATIONS) db.exec(migration);
    const store = createThreadWorkflowStore(db);
    const handlers = new Map<string, (payload: never) => unknown>();
    const bb = {
      events: {
        on: (event: string, handler: (payload: never) => unknown) => {
          handlers.set(event, handler);
        },
      },
      background: { service: () => undefined },
      realtime: { publish: vi.fn() },
      log: { warn: vi.fn() },
      sdk: {
        threads: {
          interactions: {
            list: async () => [{ status: "resolving" }, { status: "resolved" }],
          },
        },
      },
    } as unknown as BbPluginApi;

    try {
      registerThreadWorkflow(bb, store);
      await handlers.get("thread.active")?.({
        thread: { id: "thr_a", status: "active" },
      } as never);
      expect(store.get("thr_a").workflowStage).toBe("Active");
    } finally {
      db.close();
    }
  });

  it("reconciles starting and stopping through thread status changes", async () => {
    const db = new Database(":memory:");
    for (const migration of THREAD_WORKFLOW_MIGRATIONS) db.exec(migration);
    const store = createThreadWorkflowStore(db);
    let changed = null as
      | ((event: { id?: string; changes: readonly string[] }) => void)
      | null;
    let lifecycleStatus = "stopping" as "stopping" | "idle";
    let pendingInteractions: Array<{ status: string }> = [];
    let service = null as { start(signal: AbortSignal): unknown } | null;
    const bb = {
      events: { on: () => undefined },
      background: {
        service: (
          _name: string,
          registered: { start(signal: AbortSignal): unknown },
        ) => {
          service = registered;
        },
      },
      realtime: { publish: vi.fn() },
      log: { warn: vi.fn() },
      sdk: {
        subscribe: ({ callback }: { callback: typeof changed }) => {
          changed = callback;
          return () => undefined;
        },
        threads: {
          interactions: { list: async () => pendingInteractions },
          list: async () => [],
          get: async ({ threadId }: { threadId: string }) => ({
            id: threadId,
            status: lifecycleStatus,
          }),
          timeline: async () => ({ activeBackgroundCommands: [] }),
        },
      },
    } as unknown as BbPluginApi;

    const abort = new AbortController();
    try {
      registerThreadWorkflow(bb, store);
      const running = Promise.resolve(service?.start(abort.signal));
      await vi.waitFor(() => expect(changed).not.toBeNull());

      changed?.({ id: "thr_a", changes: ["status-changed"] });
      await vi.waitFor(() =>
        expect(store.get("thr_a").workflowStage).toBe("Active"),
      );

      pendingInteractions = [{ status: "pending" }];
      changed?.({ id: "thr_a", changes: ["interactions-changed"] });
      await vi.waitFor(() =>
        expect(store.get("thr_a").workflowStage).toBe("Idle"),
      );

      pendingInteractions = [];
      lifecycleStatus = "idle";
      changed?.({ id: "thr_a", changes: ["status-changed"] });
      await vi.waitFor(() =>
        expect(store.get("thr_a").workflowStage).toBe("Idle"),
      );

      abort.abort();
      await running;
    } finally {
      abort.abort();
      db.close();
    }
  });

  it("keeps an idle thread Active while a background command is running", async () => {
    const db = new Database(":memory:");
    for (const migration of THREAD_WORKFLOW_MIGRATIONS) db.exec(migration);
    const store = createThreadWorkflowStore(db);
    let changed = null as
      | ((event: {
          id?: string;
          changes: readonly string[];
          metadata?: { backgroundActivityChanged?: boolean };
        }) => void)
      | null;
    let activeBackgroundCommands: unknown[] | null = [{}];
    let service = null as { start(signal: AbortSignal): unknown } | null;
    const warn = vi.fn();
    const bb = {
      events: { on: () => undefined },
      background: {
        service: (
          _name: string,
          registered: { start(signal: AbortSignal): unknown },
        ) => {
          service = registered;
        },
      },
      realtime: { publish: vi.fn() },
      log: { warn },
      sdk: {
        subscribe: ({ callback }: { callback: typeof changed }) => {
          changed = callback;
          return () => undefined;
        },
        threads: {
          interactions: { list: async () => [] },
          list: async () => [],
          get: async ({ threadId }: { threadId: string }) => ({
            id: threadId,
            status: "idle",
          }),
          timeline: async () => {
            if (activeBackgroundCommands === null) {
              throw new Error("timeline unavailable");
            }
            return { activeBackgroundCommands };
          },
        },
      },
    } as unknown as BbPluginApi;

    const abort = new AbortController();
    try {
      registerThreadWorkflow(bb, store);
      const running = Promise.resolve(service?.start(abort.signal));
      await vi.waitFor(() => expect(changed).not.toBeNull());

      changed?.({
        id: "thr_a",
        changes: ["events-appended"],
        metadata: { backgroundActivityChanged: true },
      });
      await vi.waitFor(() =>
        expect(store.get("thr_a").workflowStage).toBe("Active"),
      );

      activeBackgroundCommands = null;
      changed?.({
        id: "thr_a",
        changes: ["events-appended"],
        metadata: { backgroundActivityChanged: true },
      });
      await vi.waitFor(() =>
        expect(warn).toHaveBeenCalledWith(
          expect.stringContaining("timeline unavailable"),
        ),
      );
      expect(store.get("thr_a").workflowStage).toBe("Active");

      activeBackgroundCommands = [];
      changed?.({
        id: "thr_a",
        changes: ["events-appended"],
        metadata: { backgroundActivityChanged: true },
      });
      await vi.waitFor(() =>
        expect(store.get("thr_a").workflowStage).toBe("Idle"),
      );

      abort.abort();
      await running;
    } finally {
      abort.abort();
      db.close();
    }
  });
});
