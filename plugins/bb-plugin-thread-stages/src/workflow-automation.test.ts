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
          list: async () => [
            { id: "thr_a", parentThreadId: null, status: "active" },
          ],
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

  it("removes stale stage state from a child thread", async () => {
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
        threads: {
          interactions: { list: vi.fn() },
          list: async () => [
            { id: "parent", parentThreadId: null, status: "idle" },
            { id: "child", parentThreadId: "parent", status: "idle" },
          ],
        },
      },
    } as unknown as BbPluginApi;

    try {
      store.ensureThreads(["child"]);
      store.setStage("child", "Completed");
      registerThreadWorkflow(bb, store);

      await handlers.get("thread.idle")?.({
        thread: {
          id: "child",
          parentThreadId: "parent",
          status: "idle",
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

  it("keeps a root Active while any descendant is active", async () => {
    const db = new Database(":memory:");
    for (const migration of THREAD_WORKFLOW_MIGRATIONS) db.exec(migration);
    const store = createThreadWorkflowStore(db);
    const handlers = new Map<string, (payload: never) => unknown>();
    const publish = vi.fn();
    const threads = [
      { id: "root", parentThreadId: null, status: "idle" },
      { id: "child", parentThreadId: "root", status: "idle" },
      { id: "active-a", parentThreadId: "child", status: "active" },
      { id: "active-b", parentThreadId: "root", status: "active" },
    ];
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
        threads: {
          interactions: { list: async () => [] },
          list: async () => threads,
        },
      },
    } as unknown as BbPluginApi;

    try {
      registerThreadWorkflow(bb, store);

      await handlers.get("thread.active")?.({ thread: threads[2] } as never);
      expect(store.get("root").workflowStage).toBe("Active");
      expect(store.get("child").explicit).toBe(false);
      expect(store.get("active-a").explicit).toBe(false);
      expect(store.get("active-b").explicit).toBe(false);

      store.setStage("root", "Completed");
      await handlers.get("thread.active")?.({ thread: threads[2] } as never);
      expect(store.get("root").workflowStage).toBe("Completed");
      store.setStage("root", "Active");

      threads[2] = { ...threads[2], status: "idle" };
      await handlers.get("thread.idle")?.({ thread: threads[2] } as never);
      expect(store.get("root").workflowStage).toBe("Active");

      threads[3] = { ...threads[3], status: "idle" };
      await handlers.get("thread.idle")?.({ thread: threads[3] } as never);
      expect(store.get("root").workflowStage).toBe("Idle");
      expect(publish).toHaveBeenCalledTimes(2);
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
          list: async () => [
            { id: "thr_a", parentThreadId: null, status: "active" },
          ],
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
          list: async () => [
            { id: "thr_a", parentThreadId: null, status: "active" },
          ],
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
          list: async () => [
            {
              id: "thr_a",
              parentThreadId: null,
              status: lifecycleStatus,
            },
          ],
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
});
