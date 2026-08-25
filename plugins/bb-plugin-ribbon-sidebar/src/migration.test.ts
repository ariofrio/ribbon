import Database from "better-sqlite3";
import { afterEach, describe, expect, it, vi } from "vitest";
import { migrateThreadStages } from "./migration";
import {
  RIBBON_SIDEBAR_MIGRATIONS,
  createPlacementStore,
} from "./placement-store";

const groupingKey = "plugin:thread-stages:stages" as const;
const grouping = {
  groupingKey,
  singularLabel: "Stage",
  pluralLabel: "Stages",
  defaultGroupId: "Idle",
  groups: [
    { id: "Idle", label: "Idle", acceptsAssignments: true },
    { id: "Active", label: "Active", acceptsAssignments: true },
  ],
  membership: { kind: "ribbon" as const },
};

function snapshot(revision: number, groupId: "Idle" | "Active") {
  return {
    sourcePluginId: "thread-stages" as const,
    sourceSchema: 1 as const,
    installationId: "a".repeat(32),
    revision,
    placements: [
      {
        groupingId: "stages",
        threadId: "thread-a",
        groupId,
        enteredAtMs: 200,
        updatedAtMs: 300,
        previousGroupId: groupId === "Active" ? "Idle" : undefined,
        origin: "ui" as const,
        orders: [
          { groupId: "Idle", sortKey: "A", updatedAtMs: 100 },
          { groupId: "Active", sortKey: "B", updatedAtMs: 300 },
        ],
      },
      {
        groupingId: "stages",
        threadId: "thread-b",
        groupId: "Idle",
        enteredAtMs: 100,
        updatedAtMs: 100,
        origin: "auto" as const,
        orders: [{ groupId: "Idle", sortKey: "B", updatedAtMs: 100 }],
      },
    ].map((placement) => {
      const { previousGroupId, ...required } = placement;
      return previousGroupId === undefined
        ? required
        : { ...required, previousGroupId };
    }),
  };
}

describe("Thread stages migration", () => {
  const databases: Database.Database[] = [];

  afterEach(() => {
    for (const database of databases.splice(0)) database.close();
  });

  it("verifies the import before acknowledgement and retries a changed snapshot", async () => {
    const database = new Database(":memory:");
    databases.push(database);
    for (const migration of RIBBON_SIDEBAR_MIGRATIONS) database.exec(migration);
    const store = createPlacementStore(database, {
      grouping: (key) => (key === groupingKey ? grouping : null),
      groupings: () => [grouping],
      now: () => 999,
    });
    store.reconcileRoots(["thread-a", "thread-b"], []);
    const snapshots = [snapshot(1, "Idle"), snapshot(2, "Active")];
    const getPlacementMigrationSnapshotV1 = vi.fn(async () => snapshots.shift()!);
    const acknowledgementObservations: string[][] = [];
    const acknowledgePlacementMigrationV1 = vi
      .fn()
      .mockImplementationOnce(async () => {
        const listed = store.listPlacements({ groupingKey });
        if (!listed.ok) throw new Error(listed.error.message);
        acknowledgementObservations.push(
          listed.value.items.map(({ groupId, threadId }) => `${groupId}:${threadId}`),
        );
        return { transferred: false };
      })
      .mockImplementationOnce(async () => {
        const listed = store.listPlacements({ groupingKey });
        if (!listed.ok) throw new Error(listed.error.message);
        acknowledgementObservations.push(
          listed.value.items.map(({ groupId, threadId }) => `${groupId}:${threadId}`),
        );
        return { transferred: true };
      });

    await expect(
      migrateThreadStages(store, {
        getPlacementMigrationSnapshotV1,
        acknowledgePlacementMigrationV1,
      }),
    ).resolves.toEqual({
      installationId: "a".repeat(32),
      revision: 2,
      imported: true,
    });
    expect(acknowledgementObservations).toEqual([
      ["Idle:thread-a", "Idle:thread-b"],
      ["Idle:thread-b", "Active:thread-a"],
    ]);
    expect(acknowledgePlacementMigrationV1.mock.calls).toEqual([
      [{ installationId: "a".repeat(32), revision: 1 }],
      [{ installationId: "a".repeat(32), revision: 2 }],
    ]);

    expect(
      store.getPlacement({ groupingKey, threadId: "thread-a" }),
    ).toMatchObject({
      ok: true,
      value: {
        placement: {
          groupId: "Active",
          enteredAtMs: 200,
          previousGroupId: "Idle",
          origin: "ui",
        },
      },
    });
  });

  it("is idempotent for the same source installation and revision", async () => {
    const database = new Database(":memory:");
    databases.push(database);
    for (const migration of RIBBON_SIDEBAR_MIGRATIONS) database.exec(migration);
    const store = createPlacementStore(database, {
      grouping: (key) => (key === groupingKey ? grouping : null),
      groupings: () => [grouping],
    });
    store.reconcileRoots(["thread-a", "thread-b"], []);
    const source = snapshot(1, "Active");
    const client = {
      getPlacementMigrationSnapshotV1: vi.fn(async () => source),
      acknowledgePlacementMigrationV1: vi.fn(async () => ({
        transferred: true,
      })),
    };

    expect(await migrateThreadStages(store, client)).toMatchObject({
      imported: true,
    });
    const revisionAfterImport = store.getPlacement({
      groupingKey,
      threadId: "thread-a",
    });
    expect(await migrateThreadStages(store, client)).toMatchObject({
      imported: false,
    });
    expect(
      store.getPlacement({ groupingKey, threadId: "thread-a" }),
    ).toEqual(revisionAfterImport);
  });

  it.each([
    [
      "assignment",
      `CREATE TRIGGER corrupt_imported_assignment
       AFTER INSERT ON group_assignment
       WHEN NEW.thread_id = 'thread-a'
       BEGIN
         UPDATE group_assignment SET origin = 'auto'
         WHERE grouping_key = NEW.grouping_key AND thread_id = NEW.thread_id;
       END`,
    ],
    [
      "order",
      `CREATE TRIGGER corrupt_imported_order
       AFTER INSERT ON group_order
       WHEN NEW.thread_id = 'thread-a' AND NEW.group_id = 'Active'
       BEGIN
         UPDATE group_order SET sort_key = 'corrupt'
         WHERE grouping_key = NEW.grouping_key
           AND group_id = NEW.group_id
           AND thread_id = NEW.thread_id;
       END`,
    ],
  ])("rejects a corrupted imported %s before acknowledgement", (_kind, trigger) => {
    const database = new Database(":memory:");
    databases.push(database);
    for (const migration of RIBBON_SIDEBAR_MIGRATIONS) database.exec(migration);
    database.exec(trigger);
    const store = createPlacementStore(database, {
      grouping: (key) => (key === groupingKey ? grouping : null),
      groupings: () => [grouping],
    });
    store.reconcileRoots(["thread-a", "thread-b"], []);

    expect(() => store.importThreadStagesSnapshot(snapshot(1, "Active"))).toThrow(
      `Migration verification failed for ${groupingKey}.`,
    );
    expect(
      database
        .prepare("SELECT COUNT(*) AS count FROM migration_import")
        .get(),
    ).toEqual({ count: 0 });
  });
});
