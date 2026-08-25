import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import {
  RIBBON_SIDEBAR_MIGRATIONS,
  createPlacementStore,
  type GroupingDescriptor,
} from "./placement-store";

const stages: GroupingDescriptor = {
  groupingKey: "plugin:thread-stages:stages",
  singularLabel: "Stage",
  pluralLabel: "Stages",
  defaultGroupId: "Idle",
  groups: [
    { id: "Idle", label: "Idle", acceptsAssignments: true },
    { id: "Active", label: "Active", acceptsAssignments: true },
    { id: "Unavailable", label: "Unavailable", acceptsAssignments: false },
  ],
  membership: { kind: "ribbon" },
};

describe("placement persistence", () => {
  const databases: Database.Database[] = [];

  afterEach(() => {
    for (const database of databases.splice(0)) database.close();
  });

  it("reconciles visible roots to provider defaults in stable BB order", () => {
    const database = new Database(":memory:");
    databases.push(database);
    for (const migration of RIBBON_SIDEBAR_MIGRATIONS) database.exec(migration);
    const store = createPlacementStore(database, {
      grouping: (key) =>
        key === stages.groupingKey ? stages : null,
      groupings: () => [stages],
      now: () => 1_234,
    });

    expect(store.reconcileRoots(["thread-b", "thread-a"], [])).toEqual({
      changedGroupingKeys: ["plugin:thread-stages:stages"],
    });
    expect(
      store.listPlacements({ groupingKey: stages.groupingKey }),
    ).toEqual({
      ok: true,
      value: {
        groupingKey: stages.groupingKey,
        revision: 1,
        items: [
          {
            groupingKey: stages.groupingKey,
            groupId: "Idle",
            threadId: "thread-b",
            enteredAtMs: 1_234,
            origin: "auto",
          },
          {
            groupingKey: stages.groupingKey,
            groupId: "Idle",
            threadId: "thread-a",
            enteredAtMs: 1_234,
            origin: "auto",
          },
        ],
      },
    });
  });

  it("retains absent placement but removes placement from new children", () => {
    const database = new Database(":memory:");
    databases.push(database);
    for (const migration of RIBBON_SIDEBAR_MIGRATIONS) database.exec(migration);
    let now = 1_000;
    const store = createPlacementStore(database, {
      grouping: (key) => (key === stages.groupingKey ? stages : null),
      groupings: () => [stages],
      now: () => now,
    });

    store.reconcileRoots(["thread-a"], []);
    expect(
      store.getPlacement({
        groupingKey: stages.groupingKey,
        threadId: "thread-a",
      }),
    ).toMatchObject({
      ok: true,
      value: { revision: 1, placement: { enteredAtMs: 1_000 } },
    });

    expect(store.reconcileRoots([], [])).toEqual({ changedGroupingKeys: [] });
    expect(
      store.getPlacement({
        groupingKey: stages.groupingKey,
        threadId: "thread-a",
      }),
    ).toMatchObject({ ok: false, error: { code: "THREAD_INELIGIBLE" } });

    now = 2_000;
    expect(store.reconcileRoots(["thread-a"], [])).toEqual({
      changedGroupingKeys: [],
    });
    expect(
      store.getPlacement({
        groupingKey: stages.groupingKey,
        threadId: "thread-a",
      }),
    ).toMatchObject({
      ok: true,
      value: { revision: 1, placement: { enteredAtMs: 1_000 } },
    });

    expect(store.reconcileRoots([], ["thread-a"])).toEqual({
      changedGroupingKeys: [stages.groupingKey],
    });
    expect(store.reconcileRoots(["thread-a"], [])).toEqual({
      changedGroupingKeys: [stages.groupingKey],
    });
    expect(
      store.getPlacement({
        groupingKey: stages.groupingKey,
        threadId: "thread-a",
      }),
    ).toEqual({
      ok: true,
      value: {
        revision: 3,
        placement: {
          groupingKey: stages.groupingKey,
          groupId: "Idle",
          threadId: "thread-a",
          enteredAtMs: 2_000,
          origin: "auto",
        },
      },
    });
  });

  it("atomically rekeys provider assignments, retained order, and revision", () => {
    const database = new Database(":memory:");
    databases.push(database);
    for (const migration of RIBBON_SIDEBAR_MIGRATIONS) database.exec(migration);
    const renamed: GroupingDescriptor = {
      ...stages,
      groupingKey: "plugin:thread-stages:workflow",
    };
    const store = createPlacementStore(database, {
      grouping: (key) =>
        key === stages.groupingKey
          ? stages
          : key === renamed.groupingKey
            ? renamed
            : null,
      groupings: () => [stages],
      now: () => 100,
    });
    store.reconcileRoots(["thread-a", "thread-b"], []);
    store.updatePlacement({
      groupingKey: stages.groupingKey,
      groupId: "Active",
      threadId: "thread-a",
      anchor: { kind: "start" },
      origin: "cli",
    });

    expect(
      store.rekeyGrouping(
        stages.groupingKey as `plugin:${string}:${string}`,
        renamed.groupingKey as `plugin:${string}:${string}`,
      ),
    ).toEqual({ assignments: 2, orders: 1, revision: 2 });
    expect(
      store.listPlacements({ groupingKey: renamed.groupingKey }),
    ).toMatchObject({
      ok: true,
      value: {
        revision: 2,
        items: [
          { threadId: "thread-b", groupId: "Idle" },
          { threadId: "thread-a", groupId: "Active", origin: "cli" },
        ],
      },
    });
    expect(
      database
        .prepare(
          "SELECT COUNT(*) AS count FROM group_assignment WHERE grouping_key = ?",
        )
        .get(stages.groupingKey),
    ).toEqual({ count: 0 });
  });

  it("moves, reorders, and idempotently accepts a stale satisfied update", () => {
    const database = new Database(":memory:");
    databases.push(database);
    for (const migration of RIBBON_SIDEBAR_MIGRATIONS) database.exec(migration);
    let now = 1_000;
    const store = createPlacementStore(database, {
      grouping: (key) => (key === stages.groupingKey ? stages : null),
      groupings: () => [stages],
      now: () => now,
    });
    store.reconcileRoots(["thread-a", "thread-b", "thread-c"], []);

    now = 2_000;
    expect(
      store.updatePlacement({
        groupingKey: stages.groupingKey,
        groupId: "Active",
        threadId: "thread-a",
        origin: "ui",
        expectedRevision: 1,
      }),
    ).toEqual({
      ok: true,
      value: {
        revision: 2,
        placement: {
          groupingKey: stages.groupingKey,
          groupId: "Active",
          threadId: "thread-a",
          enteredAtMs: 2_000,
          previousGroupId: "Idle",
          origin: "ui",
        },
      },
    });

    expect(
      store.updatePlacement({
        groupingKey: stages.groupingKey,
        groupId: "Active",
        threadId: "thread-a",
        origin: "cli",
        expectedRevision: 0,
      }),
    ).toMatchObject({ ok: true, value: { revision: 2 } });

    now = 3_000;
    store.updatePlacement({
      groupingKey: stages.groupingKey,
      groupId: "Active",
      threadId: "thread-b",
      origin: "ui",
    });
    now = 4_000;
    expect(
      store.updatePlacement({
        groupingKey: stages.groupingKey,
        groupId: "Active",
        threadId: "thread-b",
        anchor: { kind: "start" },
        origin: "cli",
        expectedRevision: 3,
      }),
    ).toMatchObject({
      ok: true,
      value: {
        revision: 4,
        placement: { enteredAtMs: 3_000, origin: "ui" },
      },
    });
    expect(
      store.listPlacements({
        groupingKey: stages.groupingKey,
        groupIds: ["Active"],
      }),
    ).toMatchObject({
      ok: true,
      value: {
        revision: 4,
        items: [{ threadId: "thread-b" }, { threadId: "thread-a" }],
      },
    });

    expect(
      store.updatePlacement({
        groupingKey: stages.groupingKey,
        groupId: "Active",
        threadId: "thread-c",
        anchor: { kind: "start" },
        origin: "ui",
        expectedRevision: 1,
      }),
    ).toEqual({
      ok: false,
      error: {
        code: "REVISION_CONFLICT",
        message: "Grouping revision changed.",
        revision: 4,
      },
    });
  });

  it("revalidates membership and anchors at the transaction seam", () => {
    const database = new Database(":memory:");
    databases.push(database);
    for (const migration of RIBBON_SIDEBAR_MIGRATIONS) database.exec(migration);
    let commitSeam = false;
    const membership = new Map([
      ["thread-a", "Idle"],
      ["thread-b", "Active"],
    ]);
    const external: GroupingDescriptor = {
      ...stages,
      groupingKey: "builtin:sections",
      singularLabel: "Section",
      pluralLabel: "Sections",
      membership: {
        kind: "external",
        writable: true,
        groupIdForThread(threadId) {
          if (commitSeam && threadId === "thread-b") return "Idle";
          return membership.get(threadId) ?? null;
        },
        setGroupIdForThread(threadId, groupId) {
          membership.set(threadId, groupId);
        },
      },
    };
    let descriptorReads = 0;
    const store = createPlacementStore(database, {
      grouping: () => {
        descriptorReads += 1;
        if (descriptorReads === 2) commitSeam = true;
        return external;
      },
      groupings: () => [external],
    });
    store.reconcileRoots(["thread-a", "thread-b"], []);
    descriptorReads = 0;

    expect(
      store.updatePlacement({
        groupingKey: "builtin:sections",
        groupId: "Active",
        threadId: "thread-a",
        anchor: { kind: "before", threadId: "thread-b" },
        origin: "ui",
      }),
    ).toMatchObject({ ok: false, error: { code: "ANCHOR_INELIGIBLE" } });
    expect(membership.get("thread-a")).toBe("Idle");
  });

  it("keeps nonempty removed groups recoverable without accepting them as filters", () => {
    const database = new Database(":memory:");
    databases.push(database);
    for (const migration of RIBBON_SIDEBAR_MIGRATIONS) database.exec(migration);
    let descriptor = stages;
    const store = createPlacementStore(database, {
      grouping: () => descriptor,
      groupings: () => [descriptor],
      now: () => 10,
    });
    store.reconcileRoots(["thread-a"], []);
    store.updatePlacement({
      groupingKey: stages.groupingKey,
      groupId: "Active",
      threadId: "thread-a",
      origin: "ui",
    });
    descriptor = {
      ...stages,
      groups: stages.groups.filter(({ id }) => id !== "Active"),
    };

    expect(store.listPlacements({ groupingKey: stages.groupingKey })).toMatchObject({
      ok: true,
      value: { items: [{ threadId: "thread-a", groupId: "Active" }] },
    });
    expect(
      store.listPlacements({
        groupingKey: stages.groupingKey,
        groupIds: ["Active"],
      }),
    ).toMatchObject({ ok: false, error: { code: "GROUP_NOT_FOUND" } });
  });

  it("supports start, end, before, after, and retained preserve anchors", () => {
    const database = new Database(":memory:");
    databases.push(database);
    for (const migration of RIBBON_SIDEBAR_MIGRATIONS) database.exec(migration);
    let now = 1_000;
    const store = createPlacementStore(database, {
      grouping: (key) => (key === stages.groupingKey ? stages : null),
      groupings: () => [stages],
      now: () => now,
    });
    store.reconcileRoots(
      ["thread-a", "thread-b", "thread-c", "thread-d"],
      [],
    );
    const ids = (groupId: string) => {
      const result = store.listPlacements({
        groupingKey: stages.groupingKey,
        groupIds: [groupId],
      });
      if (!result.ok) throw new Error(result.error.message);
      return result.value.items.map(({ threadId }) => threadId);
    };

    store.updatePlacement({
      groupingKey: stages.groupingKey,
      groupId: "Idle",
      threadId: "thread-c",
      anchor: { kind: "start" },
      origin: "ui",
    });
    expect(ids("Idle")).toEqual([
      "thread-c",
      "thread-a",
      "thread-b",
      "thread-d",
    ]);

    store.updatePlacement({
      groupingKey: stages.groupingKey,
      groupId: "Idle",
      threadId: "thread-d",
      anchor: { kind: "before", threadId: "thread-b" },
      origin: "ui",
    });
    expect(ids("Idle")).toEqual([
      "thread-c",
      "thread-a",
      "thread-d",
      "thread-b",
    ]);

    store.updatePlacement({
      groupingKey: stages.groupingKey,
      groupId: "Idle",
      threadId: "thread-c",
      anchor: { kind: "after", threadId: "thread-b" },
      origin: "ui",
    });
    expect(ids("Idle")).toEqual([
      "thread-a",
      "thread-d",
      "thread-b",
      "thread-c",
    ]);

    now = 2_000;
    store.updatePlacement({
      groupingKey: stages.groupingKey,
      groupId: "Active",
      threadId: "thread-d",
      anchor: { kind: "end" },
      origin: "auto",
    });
    expect(ids("Active")).toEqual(["thread-d"]);
    now = 3_000;
    store.updatePlacement({
      groupingKey: stages.groupingKey,
      groupId: "Idle",
      threadId: "thread-d",
      anchor: { kind: "preserve" },
      origin: "auto",
    });
    expect(ids("Idle")).toEqual([
      "thread-a",
      "thread-d",
      "thread-b",
      "thread-c",
    ]);
    expect(
      store.getPlacement({
        groupingKey: stages.groupingKey,
        threadId: "thread-d",
      }),
    ).toMatchObject({
      ok: true,
      value: {
        placement: {
          enteredAtMs: 3_000,
          previousGroupId: "Active",
          origin: "auto",
        },
      },
    });
  });

  it("intersects list filters and preserves relative display order", () => {
    const database = new Database(":memory:");
    databases.push(database);
    for (const migration of RIBBON_SIDEBAR_MIGRATIONS) database.exec(migration);
    let now = 1_000;
    const store = createPlacementStore(database, {
      grouping: (key) => (key === stages.groupingKey ? stages : null),
      groupings: () => [stages],
      now: () => now,
    });
    store.reconcileRoots(["thread-a", "thread-b", "thread-c"], []);
    now = 2_000;
    store.updatePlacement({
      groupingKey: stages.groupingKey,
      groupId: "Active",
      threadId: "thread-a",
      origin: "ui",
    });
    now = 3_000;
    store.updatePlacement({
      groupingKey: stages.groupingKey,
      groupId: "Active",
      threadId: "thread-b",
      origin: "cli",
    });

    expect(
      store.listPlacements({
        groupingKey: stages.groupingKey,
        threadIds: ["unknown", "thread-b", "thread-a"],
        groupIds: ["Active"],
        origins: ["ui"],
        enteredBeforeMs: 2_500,
      }),
    ).toMatchObject({
      ok: true,
      value: { items: [{ threadId: "thread-a" }] },
    });
    expect(
      store.listPlacements({
        groupingKey: stages.groupingKey,
        enteredBeforeMs: 2_000,
      }),
    ).toMatchObject({
      ok: true,
      value: { items: [{ threadId: "thread-c" }] },
    });
    for (const emptyFilter of [
      { threadIds: [] },
      { groupIds: [] },
      { origins: [] },
    ]) {
      expect(
        store.listPlacements({
          groupingKey: stages.groupingKey,
          ...emptyFilter,
        }),
      ).toMatchObject({ ok: true, value: { items: [] } });
    }
    expect(
      store.listPlacements({
        groupingKey: stages.groupingKey,
        groupIds: ["missing"],
      }),
    ).toMatchObject({ ok: false, error: { code: "GROUP_NOT_FOUND" } });
  });

  it("deletes all placement and never revives retained order", () => {
    const database = new Database(":memory:");
    databases.push(database);
    for (const migration of RIBBON_SIDEBAR_MIGRATIONS) database.exec(migration);
    let now = 1_000;
    const store = createPlacementStore(database, {
      grouping: (key) => (key === stages.groupingKey ? stages : null),
      groupings: () => [stages],
      now: () => now,
    });
    store.reconcileRoots(["thread-a"], []);
    now = 2_000;
    store.updatePlacement({
      groupingKey: stages.groupingKey,
      groupId: "Active",
      threadId: "thread-a",
      origin: "ui",
    });
    now = 3_000;
    store.updatePlacement({
      groupingKey: stages.groupingKey,
      groupId: "Idle",
      threadId: "thread-a",
      anchor: { kind: "preserve" },
      origin: "ui",
    });

    expect(store.deleteThread("thread-a")).toEqual({
      changedGroupingKeys: [stages.groupingKey],
    });
    expect(
      store.getPlacement({
        groupingKey: stages.groupingKey,
        threadId: "thread-a",
      }),
    ).toMatchObject({ ok: false, error: { code: "THREAD_INELIGIBLE" } });

    now = 4_000;
    store.reconcileRoots(["thread-a"], []);
    expect(
      store.getPlacement({
        groupingKey: stages.groupingKey,
        threadId: "thread-a",
      }),
    ).toEqual({
      ok: true,
      value: {
        revision: 5,
        placement: {
          groupingKey: stages.groupingKey,
          groupId: "Idle",
          threadId: "thread-a",
          enteredAtMs: 4_000,
          origin: "auto",
        },
      },
    });
  });
});
