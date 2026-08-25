import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  runForwardedThreadWorkflowCli,
  runThreadWorkflowCli,
} from "./cli";
import type { RibbonSidebarClient } from "./ribbon-sidebar-client";
import {
  THREAD_WORKFLOW_MIGRATIONS,
  createThreadWorkflowStore,
  type ThreadWorkflowStore,
} from "./store";

describe("thread stages CLI", () => {
  let db: Database.Database;
  let store: ThreadWorkflowStore;

  beforeEach(() => {
    db = new Database(":memory:");
    for (const migration of THREAD_WORKFLOW_MIGRATIONS) db.exec(migration);
    store = createThreadWorkflowStore(db);
  });

  afterEach(() => db.close());

  it("uses the thread-stages command and stage vocabulary in top-level help", () => {
    const result = runThreadWorkflowCli(store, ["--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("bb thread-stages [options] [command]");
    expect(result.stdout).toContain("Organize root threads into stages");
    expect(result.stdout).not.toContain("workflow stage");
    expect(result.stdout).toContain("list [options]");
    expect(result.stdout).toContain("show [options] [id]");
    expect(result.stdout).toContain("update [options] [id]");
    expect(result.stdout).not.toContain("reorder [options]");
  });

  it("shows the effective default stage as human and JSON output", () => {
    expect(runThreadWorkflowCli(store, ["show", "thr_a"])).toEqual({
      exitCode: 0,
      stdout: "Thread: thr_a\n  Stage: Idle (default)\n  Order: -\n",
    });
    const result = runThreadWorkflowCli(store, ["show", "thr_a", "--json"]);
    const task = JSON.parse(result.stdout ?? "");
    expect(task).toMatchObject({
      id: "thr_a",
      workflowStage: "Idle",
      sortKey: null,
      explicit: false,
    });
    expect(task).not.toHaveProperty("taskStatus");
  });

  it("targets the current thread with --self", () => {
    const result = runThreadWorkflowCli(store, ["show", "--self", "--json"], {
      threadId: "thr_self",
    });
    expect(JSON.parse(result.stdout ?? "").id).toBe("thr_self");
    expect(runThreadWorkflowCli(store, ["show", "thr_a", "--self"])).toMatchObject({
      exitCode: 1,
      stderr: expect.stringContaining("Cannot combine"),
    });
  });

  it("updates the stage through --stage", () => {
    const result = runThreadWorkflowCli(store, [
      "update",
      "thr_a",
      "--stage",
      "Active",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Thread thr_a updated");
    expect(store.get("thr_a")).toMatchObject({
      workflowStage: "Active",
      explicit: true,
    });
  });

  it("updates the current thread through --self", () => {
    const result = runThreadWorkflowCli(
      store,
      ["update", "--self", "--stage", "Active", "--json"],
      { threadId: "thr_self" },
    );
    expect(JSON.parse(result.stdout ?? "")).toMatchObject({
      id: "thr_self",
      workflowStage: "Active",
    });
  });

  it("lists a JSON array and filters by stage", () => {
    store.setStage("thr_a", "Active");
    store.setStage("thr_b", "Completed");

    const result = runThreadWorkflowCli(store, [
      "list",
      "--stage",
      "Active",
      "--json",
    ]);
    const tasks = JSON.parse(result.stdout ?? "");
    expect(tasks).toMatchObject([
      { id: "thr_a", workflowStage: "Active" },
    ]);
    expect(tasks[0]).not.toHaveProperty("taskStatus");
    expect(tasks[0]).not.toHaveProperty("sortKey");
  });

  it("lists threads without order keys in canonical stage order", () => {
    store.ensureThreads(["thr_todo"]);
    store.setStage("thr_backlog", "Deferred");
    store.setStage("thr_blocked", "Blocked");
    store.setStage("thr_done", "Completed");
    store.setStage("thr_working", "Active");
    store.setStage("thr_canceled", "Completed");

    const result = runThreadWorkflowCli(store, ["list"]);
    const stdout = result.stdout ?? "";
    const doneKey = store.get("thr_done").sortKey ?? "";

    expect(result.exitCode).toBe(0);
    expect(stdout).not.toContain("Order");
    expect(doneKey).not.toBe("");
    expect(stdout).not.toContain(doneKey);
    expect(stdout.indexOf("thr_backlog")).toBeLessThan(
      stdout.indexOf("thr_todo"),
    );
    expect(stdout.indexOf("thr_todo")).toBeLessThan(
      stdout.indexOf("thr_working"),
    );
    expect(stdout.indexOf("thr_working")).toBeLessThan(
      stdout.indexOf("thr_blocked"),
    );
    expect(stdout.indexOf("thr_blocked")).toBeLessThan(
      stdout.indexOf("thr_done"),
    );
    expect(stdout.indexOf("thr_done")).toBeLessThan(
      stdout.indexOf("thr_canceled"),
    );
  });

  it("limits lists to thread IDs supplied by the host", () => {
    store.ensureThreads(["thr_visible", "thr_archived"]);
    const result = runThreadWorkflowCli(store, ["list", "--json"], {
      listThreadIds: ["thr_visible"],
    });
    expect(JSON.parse(result.stdout ?? "").map((task: { id: string }) => task.id)).toEqual([
      "thr_visible",
    ]);
  });

  it("moves a thread within its stage through update", () => {
    store.ensureThreads(["thr_a", "thr_b", "thr_c"]);

    const result = runThreadWorkflowCli(store, [
      "update",
      "thr_c",
      "--after",
      "thr_a",
      "--before",
      "thr_b",
      "--json",
    ]);

    expect(result.exitCode).toBe(0);
    expect(
      store
        .listState()
        .assignments.map((assignment) => assignment.threadId),
    ).toEqual(["thr_a", "thr_c", "thr_b"]);
    expect(JSON.parse(result.stdout ?? "")).toMatchObject({
      id: "thr_c",
      workflowStage: "Idle",
    });
  });

  it("appends a thread when changing its stage without position flags", () => {
    store.ensureThreads(["thr_first", "thr_second", "thr_moved"]);
    store.setStage("thr_first", "Active");
    store.setStage("thr_second", "Active");

    const result = runThreadWorkflowCli(store, [
      "update",
      "thr_moved",
      "--stage",
      "Active",
      "--json",
    ]);

    expect(result.exitCode).toBe(0);
    expect(
      store
        .listState()
        .assignments.filter((assignment) => assignment.workflowStage === "Active")
        .map((assignment) => assignment.threadId),
    ).toEqual(["thr_first", "thr_second", "thr_moved"]);
  });

  it("preserves position when updating to the current stage without position flags", () => {
    store.ensureThreads(["thr_first", "thr_middle", "thr_last"]);
    const before = store.get("thr_middle");

    const result = runThreadWorkflowCli(store, [
      "update",
      "thr_middle",
      "--stage",
      "Idle",
      "--json",
    ]);

    expect(result.exitCode).toBe(0);
    expect(
      store.listState().assignments.map((assignment) => assignment.threadId),
    ).toEqual(["thr_first", "thr_middle", "thr_last"]);
    expect(store.get("thr_middle")).toEqual(before);
  });

  it("overrides status-change position through update", () => {
    store.ensureThreads(["thr_first", "thr_second", "thr_moved"]);
    store.setStage("thr_first", "Active");
    store.setStage("thr_second", "Active");

    const result = runThreadWorkflowCli(store, [
      "update",
      "thr_moved",
      "--stage",
      "Active",
      "--after",
      "thr_first",
      "--before",
      "thr_second",
    ]);

    expect(result.exitCode).toBe(0);
    expect(
      store
        .listState()
        .assignments.filter((assignment) => assignment.workflowStage === "Active")
        .map((assignment) => assignment.threadId),
    ).toEqual(["thr_first", "thr_moved", "thr_second"]);
  });

  it("ignores and warns about neighbors outside the destination stage", () => {
    store.ensureThreads(["thr_working", "thr_done", "thr_moved"]);
    store.setStage("thr_working", "Active");
    store.setStage("thr_done", "Completed");

    const result = runThreadWorkflowCli(store, [
      "update",
      "thr_moved",
      "--stage",
      "Active",
      "--after",
      "thr_done",
      "--json",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe(
      "Warning: --after thread thr_done is not in stage Active; ignoring --after.\n",
    );
    expect(
      store
        .listState()
        .assignments.filter((assignment) => assignment.workflowStage === "Active")
        .map((assignment) => assignment.threadId),
    ).toEqual(["thr_working", "thr_moved"]);
  });

  it("applies a valid neighbor while ignoring an invalid one", () => {
    store.ensureThreads(["thr_first", "thr_second", "thr_done", "thr_moved"]);
    store.setStage("thr_first", "Active");
    store.setStage("thr_second", "Active");
    store.setStage("thr_done", "Completed");

    const result = runThreadWorkflowCli(store, [
      "update",
      "thr_moved",
      "--stage",
      "Active",
      "--after",
      "thr_first",
      "--before",
      "thr_done",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain("ignoring --before");
    expect(store.get("thr_moved").workflowStage).toBe("Active");
    expect(store.get("thr_moved").sortKey! > store.get("thr_first").sortKey!).toBe(
      true,
    );
  });

  it("prints update-specific ordering help", () => {
    const result = runThreadWorkflowCli(store, ["help", "update"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("--after <id>");
    expect(result.stdout).toContain("--before <id>");
  });

  it("does not expose a standalone reorder command", () => {
    const result = runThreadWorkflowCli(store, ["reorder", "thr_a", "--after", "thr_b"]);
    expect(result).toMatchObject({
      exitCode: 2,
      stderr: expect.stringContaining("Unknown command: reorder"),
    });
  });

  it("returns actionable errors for missing changes and invalid stages", () => {
    expect(runThreadWorkflowCli(store, ["update", "thr_a"]).stderr).toContain(
      "Provide --stage, --after, or --before",
    );
    const invalid = runThreadWorkflowCli(store, [
      "update",
      "thr_a",
      "--stage",
      "paused",
    ]);
    expect(invalid.exitCode).toBe(1);
    expect(invalid.stderr).toContain("Deferred, Idle, Active");
  });

  it("rejects updates into a stage disabled in settings", () => {
    const result = runThreadWorkflowCli(
      store,
      ["update", "thr_a", "--stage", "Blocked"],
      { enabledStages: ["Idle", "Active", "Completed"] },
    );

    expect(result).toMatchObject({
      exitCode: 1,
      stderr: expect.stringContaining("Stage Blocked is disabled"),
    });
    expect(store.get("thr_a").workflowStage).toBe("Idle");
  });

  it("rejects stage reads and writes for child threads", () => {
    store.ensureThreads(["parent", "child"]);
    const rootIdsByThreadId = new Map<string, string | null>([
      ["parent", "parent"],
      ["child", "parent"],
    ]);

    const shown = runThreadWorkflowCli(store, ["show", "child"], { rootIdsByThreadId });
    const updated = runThreadWorkflowCli(
      store,
      ["update", "child", "--stage", "Completed"],
      { rootIdsByThreadId },
    );

    expect(shown).toMatchObject({
      exitCode: 1,
      stderr: expect.stringContaining("root thread parent"),
    });
    expect(updated.exitCode).toBe(1);
    expect(store.get("parent").workflowStage).toBe("Idle");
    expect(store.get("child").workflowStage).toBe("Idle");
  });

  it("forwards compatibility CLI reads and writes after handoff", async () => {
    const getPlacementV1 = vi.fn(async (input) => ({
      ok: true as const,
      value: {
        placement: {
          groupingKey: "plugin:thread-stages:stages" as const,
          groupId: input.threadId === "thr_after" ? "Active" : "Idle",
          threadId: input.threadId,
          enteredAtMs: 100,
          origin: "cli" as const,
        },
        revision: 4,
      },
    }));
    const listPlacementsV1 = vi.fn(async () => ({
      ok: true as const,
      value: {
        groupingKey: "plugin:thread-stages:stages" as const,
        revision: 4,
        items: [
          {
            groupingKey: "plugin:thread-stages:stages" as const,
            groupId: "Active",
            threadId: "thr_a",
            enteredAtMs: 100,
            origin: "auto" as const,
          },
        ],
      },
    }));
    const updatePlacementV1 = vi.fn(async (input) => ({
      ok: true as const,
      value: {
        placement: {
          groupingKey: "plugin:thread-stages:stages" as const,
          groupId: input.groupId,
          threadId: input.threadId,
          enteredAtMs: 200,
          origin: "cli" as const,
        },
        revision: 5,
      },
    }));
    const client = {
      getPlacementV1,
      listPlacementsV1,
      updatePlacementV1,
      invalidateGroupingCatalogV1: vi.fn(),
    } as RibbonSidebarClient;

    await expect(
      runForwardedThreadWorkflowCli(
        client,
        ["list", "--stage", "Active", "--json"],
        { listThreadIds: ["thr_a"] },
      ),
    ).resolves.toMatchObject({
      exitCode: 0,
      stdout: expect.stringContaining('"workflowStage": "Active"'),
    });
    await expect(
      runForwardedThreadWorkflowCli(client, ["show", "--self", "--json"], {
        threadId: "thr_self",
      }),
    ).resolves.toMatchObject({
      exitCode: 0,
      stdout: expect.stringContaining('"id": "thr_self"'),
    });
    await expect(
      runForwardedThreadWorkflowCli(client, [
        "update",
        "thr_a",
        "--stage",
        "Active",
        "--after",
        "thr_after",
        "--json",
      ]),
    ).resolves.toMatchObject({ exitCode: 0 });
    expect(updatePlacementV1).toHaveBeenCalledWith({
      groupingKey: "plugin:thread-stages:stages",
      groupId: "Active",
      threadId: "thr_a",
      anchor: { kind: "after", threadId: "thr_after" },
      expectedRevision: 4,
      origin: "cli",
    });
  });
});
