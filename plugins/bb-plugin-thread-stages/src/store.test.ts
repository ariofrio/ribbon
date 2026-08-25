import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PlacementOwnershipTransferredError,
  THREAD_WORKFLOW_MIGRATIONS,
  createThreadWorkflowStore,
  type ThreadWorkflowStore,
} from "./store";

describe("thread status store", () => {
  it("keeps assignments only for root task threads", () => {
    const db = new Database(":memory:");
    for (const migration of THREAD_WORKFLOW_MIGRATIONS) db.exec(migration);
    const store = createThreadWorkflowStore(db);

    try {
      store.ensureThreads(["parent", "child"]);
      store.setStage("child", "Active");
      store.setPreview("child", "Child output");

      const state = store.syncRootThreads(["parent"], ["child"]);

      expect(state.assignments.map(({ threadId }) => threadId)).toEqual([
        "parent",
      ]);
      expect(store.get("child")).toMatchObject({
        explicit: false,
        workflowStage: "Idle",
      });
      expect(store.listPreviews()).toContainEqual({
        threadId: "child",
        preview: "Child output",
      });
    } finally {
      db.close();
    }
  });

  let db: Database.Database;
  let store: ThreadWorkflowStore;

  beforeEach(() => {
    db = new Database(":memory:");
    for (const migration of THREAD_WORKFLOW_MIGRATIONS) db.exec(migration);
    store = createThreadWorkflowStore(db);
  });

  afterEach(() => db.close());

  it("returns Idle for a thread with no explicit assignment", () => {
    expect(store.get("thr_new")).toEqual({
      threadId: "thr_new",
      workflowStage: "Idle",
      sortKey: null,
      updatedAt: null,
      explicit: false,
    });
  });

  it("materializes missing threads in their supplied order", () => {
    const first = store.ensureThreads(["thr_a", "thr_b", "thr_c"]);
    const initialKeys = first.assignments.map((assignment) => assignment.sortKey);

    expect(first.assignments.map((assignment) => assignment.threadId)).toEqual([
      "thr_a",
      "thr_b",
      "thr_c",
    ]);
    expect(initialKeys).toEqual([...initialKeys].sort());
    expect(store.ensureThreads(["thr_a", "thr_b", "thr_c"])).toEqual(first);
  });

  it("lists canonical workflow stages and fractional order within each group", () => {
    store.ensureThreads(["thr_todo_first", "thr_todo_second"]);
    store.setStage("thr_canceled", "Completed");
    store.setStage("thr_blocked", "Blocked");
    store.setStage("thr_done", "Completed");
    store.setStage("thr_working_first", "Active");
    store.setStage("thr_working_second", "Active");
    store.setStage("thr_backlog", "Deferred");

    expect(
      store.listState().assignments.map((assignment) => assignment.threadId),
    ).toEqual([
      "thr_backlog",
      "thr_todo_first",
      "thr_todo_second",
      "thr_working_first",
      "thr_working_second",
      "thr_blocked",
      "thr_canceled",
      "thr_done",
    ]);
  });

  it("carries stored Deferred assignments through the legacy Backlog migration", () => {
    const migrationDb = new Database(":memory:");
    try {
      for (const migration of THREAD_WORKFLOW_MIGRATIONS.slice(0, 6)) {
        migrationDb.exec(migration);
      }
      migrationDb
        .prepare(
          "INSERT INTO thread_organization(thread_id, status, position, updated_at, sort_key, moved_by, previous_status, previous_sort_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .run("thr_legacy", "Deferred", 1024, 1, "a1", "app", "Deferred", "a0");

      for (const migration of THREAD_WORKFLOW_MIGRATIONS.slice(6)) {
        migrationDb.exec(migration);
      }

      const migrated = createThreadWorkflowStore(migrationDb);
      expect(migrated.get("thr_legacy").workflowStage).toBe("Deferred");
      expect(migrated.listUndoCandidates()).toMatchObject([
        { threadId: "thr_legacy", previousStage: "Deferred" },
      ]);
    } finally {
      migrationDb.close();
    }
  });

  it("renames stored Waiting assignments to Blocked", () => {
    const migrationDb = new Database(":memory:");
    try {
      for (const migration of THREAD_WORKFLOW_MIGRATIONS.slice(0, 7)) {
        migrationDb.exec(migration);
      }
      migrationDb
        .prepare(
          "INSERT INTO thread_organization(thread_id, status, position, updated_at, sort_key, moved_by, previous_status, previous_sort_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .run("thr_legacy", "Waiting", 1024, 1, "a1", "app", "Waiting", "a0");

      for (const migration of THREAD_WORKFLOW_MIGRATIONS.slice(7)) {
        migrationDb.exec(migration);
      }

      const migrated = createThreadWorkflowStore(migrationDb);
      expect(migrated.get("thr_legacy").workflowStage).toBe("Blocked");
      expect(migrated.listUndoCandidates()).toMatchObject([
        { threadId: "thr_legacy", previousStage: "Blocked" },
      ]);
    } finally {
      migrationDb.close();
    }
  });

  it("migrates every legacy stage into the five-stage model", () => {
    const migrationDb = new Database(":memory:");
    try {
      for (const migration of THREAD_WORKFLOW_MIGRATIONS.slice(0, 8)) {
        migrationDb.exec(migration);
      }
      const insert = migrationDb.prepare(
        "INSERT INTO thread_organization(thread_id, status, position, updated_at, sort_key, moved_by, previous_status, previous_sort_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      );
      for (const [index, status] of [
        "Backlog",
        "To do",
        "Working",
        "Blocked",
        "Done",
        "Canceled",
      ].entries()) {
        insert.run(
          `thr_${index}`,
          status,
          index,
          index,
          `a${index}`,
          "app",
          status,
          `z${index}`,
        );
      }

      for (const migration of THREAD_WORKFLOW_MIGRATIONS.slice(8)) {
        migrationDb.exec(migration);
      }
      const migrated = createThreadWorkflowStore(migrationDb);

      expect(
        migrated.listState().assignments.map((assignment) => [
          assignment.threadId,
          assignment.workflowStage,
        ]),
      ).toEqual([
        ["thr_0", "Deferred"],
        ["thr_1", "Idle"],
        ["thr_2", "Active"],
        ["thr_3", "Blocked"],
        ["thr_4", "Completed"],
        ["thr_5", "Completed"],
      ]);
    } finally {
      migrationDb.close();
    }
  });

  it("backfills stage-entry age from existing assignment timestamps", () => {
    const migrationDb = new Database(":memory:");
    try {
      for (const migration of THREAD_WORKFLOW_MIGRATIONS.slice(0, 9)) {
        migrationDb.exec(migration);
      }
      migrationDb
        .prepare(
          "INSERT INTO thread_organization(thread_id, status, position, updated_at, sort_key) VALUES (?, ?, ?, ?, ?)",
        )
        .run("thr_existing", "Completed", 0, 123, "a");
      for (const migration of THREAD_WORKFLOW_MIGRATIONS.slice(9)) {
        migrationDb.exec(migration);
      }

      expect(
        createThreadWorkflowStore(migrationDb).listCompletedBefore(124),
      ).toEqual([{ threadId: "thr_existing", enteredAt: 123 }]);
    } finally {
      migrationDb.close();
    }
  });

  it("places status changes at the bottom and preserves idempotent keys", () => {
    store.ensureThreads(["thr_a", "thr_b"]);
    store.setStage("thr_b", "Active");
    const firstKey = store.get("thr_b").sortKey;
    store.setStage("thr_b", "Active");
    expect(store.get("thr_b").sortKey).toBe(firstKey);

    store.setStage("thr_a", "Active");
    const working = store
      .listState()
      .assignments.filter((assignment) => assignment.workflowStage === "Active");
    expect(working.map((assignment) => assignment.threadId)).toEqual([
      "thr_b",
      "thr_a",
    ]);
    expect(working[0]?.sortKey < (working[1]?.sortKey ?? "")).toBe(true);
  });

  it("ages Completed threads from stage entry, not later reordering", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(1_000);
      store.setStage("thr_a", "Completed");
      store.setStage("thr_b", "Completed");

      vi.setSystemTime(5_000);
      store.reorderThread({
        threadId: "thr_a",
        workflowStage: "Completed",
        previousThreadId: "thr_b",
        nextThreadId: null,
      });
      expect(store.listCompletedBefore(2_000).map(({ threadId }) => threadId)).toEqual([
        "thr_a",
        "thr_b",
      ]);

      store.setStage("thr_a", "Idle");
      store.setStage("thr_a", "Completed");
      expect(store.listCompletedBefore(2_000).map(({ threadId }) => threadId)).toEqual([
        "thr_b",
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("moves a task to Active only when it enters a working lifecycle", () => {
    store.ensureThreads(["thr_a"]);

    store.observeActiveState("thr_a", true);
    expect(store.get("thr_a").workflowStage).toBe("Active");

    store.setStage("thr_a", "Blocked");
    store.observeActiveState("thr_a", true);
    expect(store.get("thr_a").workflowStage).toBe("Blocked");
  });

  it("moves an Active task to Idle when work stops without undoing an override", () => {
    store.observeActiveState("thr_finished", true);
    store.observeActiveState("thr_finished", false);
    expect(store.get("thr_finished").workflowStage).toBe("Idle");

    store.observeActiveState("thr_overridden", true);
    store.setStage("thr_overridden", "Deferred");
    store.observeActiveState("thr_overridden", false);
    expect(store.get("thr_overridden").workflowStage).toBe("Deferred");
  });

  it.each(["Deferred", "Blocked", "Completed"] as const)(
    "leaves a thread in %s across later lifecycle changes",
    (stage) => {
      store.setStage("thr_a", stage);

      store.observeActiveState("thr_a", true);
      expect(store.get("thr_a").workflowStage).toBe(stage);

      store.observeActiveState("thr_a", false);
      expect(store.get("thr_a").workflowStage).toBe(stage);

      store.observeActiveState("thr_a", true);
      expect(store.get("thr_a").workflowStage).toBe(stage);
    },
  );

  it("persists the lifecycle edge across store recreation", () => {
    store.observeActiveState("thr_a", true);
    store.setStage("thr_a", "Completed");

    const reloadedStore = createThreadWorkflowStore(db);
    reloadedStore.observeActiveState("thr_a", true);

    expect(reloadedStore.get("thr_a").workflowStage).toBe("Completed");
  });

  it("reconciles a previously unobserved idle Active task to Idle", () => {
    store.setStage("thr_a", "Active");

    store.observeActiveState("thr_a", false);

    expect(store.get("thr_a").workflowStage).toBe("Idle");
  });

  it("persists one derived message preview per thread", () => {
    expect(store.setPreview("thr_a", "Latest message")).toBe(true);
    expect(store.setPreview("thr_a", "Latest message")).toBe(false);
    expect(store.setPreview("thr_b", null)).toBe(true);

    expect(store.listPreviews()).toEqual([
      { threadId: "thr_a", preview: "Latest message" },
      { threadId: "thr_b", preview: null },
    ]);
  });

  it("changes only the moved row's key when reordering between neighbors", () => {
    store.ensureThreads(["thr_a", "thr_b", "thr_c"]);
    const before = new Map(
      store.listState().assignments.map((assignment) => [
        assignment.threadId,
        assignment.sortKey,
      ]),
    );

    const after = store.reorderThread({
      threadId: "thr_c",
      workflowStage: "Idle",
      previousThreadId: "thr_a",
      nextThreadId: "thr_b",
    });

    expect(after.assignments.map((assignment) => assignment.threadId)).toEqual([
      "thr_a",
      "thr_c",
      "thr_b",
    ]);
    expect(store.get("thr_a").sortKey).toBe(before.get("thr_a"));
    expect(store.get("thr_b").sortKey).toBe(before.get("thr_b"));
    expect(store.get("thr_c").sortKey).not.toBe(before.get("thr_c"));
  });

  it("preserves position when reordering within the same status without neighbors", () => {
    store.ensureThreads(["thr_a", "thr_b", "thr_c"]);
    const before = store.get("thr_b");

    const after = store.reorderThread({
      threadId: "thr_b",
      workflowStage: "Idle",
      previousThreadId: null,
      nextThreadId: null,
    });

    expect(after.assignments.map((assignment) => assignment.threadId)).toEqual([
      "thr_a",
      "thr_b",
      "thr_c",
    ]);
    expect(store.get("thr_b")).toEqual(before);
  });

  it("changes status and order in one transaction", () => {
    store.ensureThreads(["thr_a", "thr_b"]);
    store.setStage("thr_b", "Active");

    const after = store.reorderThread({
      threadId: "thr_a",
      workflowStage: "Active",
      previousThreadId: "thr_b",
      nextThreadId: null,
    });

    expect(
      after.assignments
        .filter((assignment) => assignment.workflowStage === "Active")
        .map((assignment) => assignment.threadId),
    ).toEqual(["thr_b", "thr_a"]);
  });

  it("materializes an unassigned moved thread during an ordered status change", () => {
    store.ensureThreads(["thr_before", "thr_after"]);
    store.setStage("thr_before", "Active");
    store.setStage("thr_after", "Active");

    const after = store.reorderThread({
      threadId: "thr_new",
      workflowStage: "Active",
      previousThreadId: "thr_before",
      nextThreadId: "thr_after",
    });

    expect(
      after.assignments
        .filter((assignment) => assignment.workflowStage === "Active")
        .map((assignment) => assignment.threadId),
    ).toEqual(["thr_before", "thr_new", "thr_after"]);
  });

  it("rejects stale, reversed, and self-referential neighbors", () => {
    store.ensureThreads(["thr_a", "thr_b", "thr_c"]);
    const before = store.listState();

    expect(() =>
      store.reorderThread({
        threadId: "thr_c",
        workflowStage: "Idle",
        previousThreadId: "thr_missing",
        nextThreadId: null,
      }),
    ).toThrow("changed");
    expect(() =>
      store.reorderThread({
        threadId: "thr_c",
        workflowStage: "Idle",
        previousThreadId: "thr_b",
        nextThreadId: "thr_a",
      }),
    ).toThrow("sort before");
    expect(() =>
      store.reorderThread({
        threadId: "thr_c",
        workflowStage: "Idle",
        previousThreadId: "thr_c",
        nextThreadId: null,
      }),
    ).toThrow("own neighbor");
    expect(store.listState()).toEqual(before);
  });

  it("migrates integer positions to lexicographically equivalent keys", () => {
    const migrationDb = new Database(":memory:");
    try {
      migrationDb.exec(THREAD_WORKFLOW_MIGRATIONS[0] ?? "");
      migrationDb
        .prepare(
          "INSERT INTO thread_organization(thread_id, status, position, updated_at) VALUES (?, ?, ?, ?)",
        )
        .run("thr_b", "Waiting", 2048, 1);
      migrationDb
        .prepare(
          "INSERT INTO thread_organization(thread_id, status, position, updated_at) VALUES (?, ?, ?, ?)",
        )
        .run("thr_a", "Waiting", 1024, 1);
      migrationDb.exec(THREAD_WORKFLOW_MIGRATIONS[1] ?? "");
      for (const migration of THREAD_WORKFLOW_MIGRATIONS.slice(2)) {
        migrationDb.exec(migration);
      }

      const migrated = createThreadWorkflowStore(migrationDb).listState();
      expect(migrated.assignments).toMatchObject([
        { threadId: "thr_a", sortKey: "0000000000001024" },
        { threadId: "thr_b", sortKey: "0000000000002048" },
      ]);
    } finally {
      migrationDb.close();
    }
  });

  it("renames stored To Do assignments to Idle", () => {
    const migrationDb = new Database(":memory:");
    try {
      // The first four migrations predate the Idle rename.
      for (const migration of THREAD_WORKFLOW_MIGRATIONS.slice(0, 4)) {
        migrationDb.exec(migration);
      }
      migrationDb
        .prepare(
          "INSERT INTO thread_organization(thread_id, status, position, updated_at, sort_key) VALUES (?, ?, ?, ?, ?)",
        )
        .run("thr_legacy", "To Do", 1024, 1, "a1");
      migrationDb
        .prepare(
          "INSERT INTO thread_organization(thread_id, status, position, updated_at, sort_key) VALUES (?, ?, ?, ?, ?)",
        )
        .run("thr_blocked", "Waiting", 2048, 1, "a2");
      for (const migration of THREAD_WORKFLOW_MIGRATIONS.slice(4)) {
        migrationDb.exec(migration);
      }

      const migrated = createThreadWorkflowStore(migrationDb);
      expect(migrated.listState().assignments).toMatchObject([
        { threadId: "thr_legacy", workflowStage: "Idle", sortKey: "a1" },
        { threadId: "thr_blocked", workflowStage: "Blocked", sortKey: "a2" },
      ]);
      expect(() =>
        migrationDb
          .prepare("UPDATE thread_organization SET status = ? WHERE thread_id = ?")
          .run("To Do", "thr_legacy"),
      ).toThrow();
    } finally {
      migrationDb.close();
    }
  });

  it("records where each move came from and what it left behind", () => {
    store.ensureThreads(["thr_a", "thr_b"]);
    const before = store.get("thr_a");

    store.setStage("thr_a", "Completed", "app");

    expect(store.listUndoCandidates()).toEqual([
      {
        threadId: "thr_a",
        previousStage: "Idle",
        previousSortKey: before.sortKey,
        updatedAt: expect.any(Number),
      },
    ]);
  });

  it("offers only app moves into a filed status as undo candidates", () => {
    store.ensureThreads(["thr_app", "thr_cli", "thr_auto", "thr_todo"]);
    store.setStage("thr_app", "Deferred", "app");
    store.setStage("thr_cli", "Completed", "cli");
    store.observeActiveState("thr_auto", true);
    store.setStage("thr_todo", "Idle", "app");

    expect(
      store.listUndoCandidates().map(({ threadId }) => threadId),
    ).toEqual(["thr_app"]);
  });

  it("lists undo candidates newest first", () => {
    store.ensureThreads(["thr_a", "thr_b"]);
    vi.useFakeTimers();
    try {
      vi.setSystemTime(1_000);
      store.setStage("thr_a", "Completed", "app");
      vi.setSystemTime(2_000);
      store.setStage("thr_b", "Completed", "app");
    } finally {
      vi.useRealTimers();
    }

    expect(
      store.listUndoCandidates().map(({ threadId }) => threadId),
    ).toEqual(["thr_b", "thr_a"]);
  });

  it("restores a task to the position it held in Idle", () => {
    store.ensureThreads(["thr_a", "thr_b", "thr_c"]);
    const original = store.get("thr_b").sortKey;
    store.setStage("thr_b", "Completed", "app");

    const [candidate] = store.listUndoCandidates();
    store.restoreToIdle("thr_b", candidate?.previousSortKey ?? null);

    expect(store.get("thr_b")).toMatchObject({
      workflowStage: "Idle",
      sortKey: original,
    });
    expect(
      store
        .listState()
        .assignments.filter(({ workflowStage }) => workflowStage === "Idle")
        .map(({ threadId }) => threadId),
    ).toEqual(["thr_a", "thr_b", "thr_c"]);
    expect(store.listUndoCandidates()).toEqual([]);
  });

  it("appends a restored task that never sat in Idle", () => {
    store.ensureThreads(["thr_a", "thr_b"]);
    store.setStage("thr_b", "Blocked", "app");
    store.setStage("thr_b", "Completed", "app");

    store.restoreToIdle("thr_b", null);

    expect(
      store
        .listState()
        .assignments.filter(({ workflowStage }) => workflowStage === "Idle")
        .map(({ threadId }) => threadId),
    ).toEqual(["thr_a", "thr_b"]);
  });

  it("removes organization state for deleted threads", () => {
    store.observeActiveState("thr_a", true);
    store.setStage("thr_a", "Deferred");

    expect(store.delete("thr_a")).toBe(true);
    expect(store.delete("thr_a")).toBe(false);
    expect(store.listState()).toEqual({ assignments: [] });

    store.observeActiveState("thr_a", true);
    expect(store.get("thr_a").workflowStage).toBe("Active");
  });

  it("returns a normalized migration snapshot with durable identity and retained order", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(1_000);
      store.ensureThreads(["thr_a", "thr_b"]);
      const idleOrder = store.get("thr_a").sortKey;

      vi.setSystemTime(2_000);
      store.setStage("thr_a", "Active", "app");
      vi.setSystemTime(3_000);
      store.reorderThread({
        threadId: "thr_a",
        workflowStage: "Active",
        previousThreadId: null,
        nextThreadId: null,
        source: "app",
      });

      const snapshot = store.getPlacementMigrationSnapshot();
      expect(snapshot).toMatchObject({
        sourcePluginId: "thread-stages",
        sourceSchema: 1,
        installationId: expect.stringMatching(/^[a-f0-9]{32}$/),
        revision: 2,
        placements: [
          {
            groupingId: "stages",
            threadId: "thr_b",
            groupId: "Idle",
            enteredAtMs: 1_000,
            updatedAtMs: 1_000,
            origin: "auto",
          },
          {
            groupingId: "stages",
            threadId: "thr_a",
            groupId: "Active",
            enteredAtMs: 2_000,
            updatedAtMs: 2_000,
            previousGroupId: "Idle",
            origin: "ui",
            orders: expect.arrayContaining([
              { groupId: "Idle", sortKey: idleOrder, updatedAtMs: 1_000 },
              {
                groupId: "Active",
                sortKey: expect.any(String),
                updatedAtMs: 2_000,
              },
            ]),
          },
        ],
      });

      expect(
        createThreadWorkflowStore(db).getPlacementMigrationSnapshot()
          .installationId,
      ).toBe(snapshot.installationId);
    } finally {
      vi.useRealTimers();
    }
  });

  it("increments the migration revision once for every committed placement mutation", () => {
    const revision = () => store.getPlacementMigrationSnapshot().revision;

    expect(revision()).toBe(0);
    store.ensureThreads(["thr_a", "thr_b"]);
    expect(revision()).toBe(1);
    store.ensureThreads(["thr_a", "thr_b"]);
    store.setStage("thr_a", "Idle");
    store.setPreview("thr_a", "not placement state");
    expect(revision()).toBe(1);

    store.setStage("thr_a", "Active", "cli");
    expect(revision()).toBe(2);
    store.reorderThread({
      threadId: "thr_b",
      workflowStage: "Active",
      previousThreadId: "thr_a",
      nextThreadId: null,
    });
    expect(revision()).toBe(3);
    store.delete("thr_a");
    expect(revision()).toBe(4);
  });

  it("transfers ownership only for a matching installation and revision", () => {
    store.ensureThreads(["thr_a"]);
    const snapshot = store.getPlacementMigrationSnapshot();

    expect(
      store.acknowledgePlacementMigration({
        installationId: "0".repeat(32),
        revision: snapshot.revision,
      }),
    ).toEqual({ transferred: false });
    expect(
      store.acknowledgePlacementMigration({
        installationId: snapshot.installationId,
        revision: snapshot.revision - 1,
      }),
    ).toEqual({ transferred: false });
    expect(store.placementOwnership()).toBe("thread-stages");

    expect(
      store.acknowledgePlacementMigration({
        installationId: snapshot.installationId,
        revision: snapshot.revision,
      }),
    ).toEqual({ transferred: true });
    expect(store.placementOwnership()).toBe("ribbon-sidebar");
    expect(
      store.acknowledgePlacementMigration({
        installationId: snapshot.installationId,
        revision: snapshot.revision,
      }),
    ).toEqual({ transferred: true });
  });

  it("makes every legacy placement mutation read-only after handoff", () => {
    store.ensureThreads(["thr_a"]);
    const snapshot = store.getPlacementMigrationSnapshot();
    store.acknowledgePlacementMigration(snapshot);

    const mutations = [
      () => store.ensureThreads(["thr_b"]),
      () => store.syncRootThreads(["thr_a"], []),
      () => store.removeRootThread("thr_a"),
      () => store.setStage("thr_a", "Completed"),
      () => store.restoreToIdle("thr_a", null),
      () => store.observeActiveState("thr_a", true),
      () =>
        store.reorderThread({
          threadId: "thr_a",
          workflowStage: "Idle",
          previousThreadId: null,
          nextThreadId: null,
        }),
      () => store.delete("thr_a"),
    ];
    for (const mutate of mutations) {
      expect(mutate).toThrow(PlacementOwnershipTransferredError);
    }

    expect(store.getPlacementMigrationSnapshot()).toEqual(snapshot);
  });

  it("serializes revision CAS and the ownership barrier across connections", () => {
    const directory = mkdtempSync(join(tmpdir(), "thread-stages-handoff-"));
    const databasePath = join(directory, "state.sqlite");
    const firstDb = new Database(databasePath);
    const secondDb = new Database(databasePath);
    try {
      for (const migration of THREAD_WORKFLOW_MIGRATIONS) {
        firstDb.exec(migration);
      }
      const first = createThreadWorkflowStore(firstDb);
      const second = createThreadWorkflowStore(secondDb);
      first.ensureThreads(["thr_a"]);
      const staleSnapshot = first.getPlacementMigrationSnapshot();

      second.setStage("thr_a", "Active", "app");
      expect(first.acknowledgePlacementMigration(staleSnapshot)).toEqual({
        transferred: false,
      });

      const currentSnapshot = second.getPlacementMigrationSnapshot();
      expect(first.acknowledgePlacementMigration(currentSnapshot)).toEqual({
        transferred: true,
      });
      expect(() => second.setStage("thr_a", "Idle", "app")).toThrow(
        PlacementOwnershipTransferredError,
      );
      expect(second.getPlacementMigrationSnapshot()).toEqual(currentSnapshot);
    } finally {
      secondDb.close();
      firstDb.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
