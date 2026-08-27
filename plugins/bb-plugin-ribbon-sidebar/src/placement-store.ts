import type BetterSqlite3 from "better-sqlite3";
import { createOrderKeyBetween } from "./order-keys";
import type { ThreadStagesMigrationSnapshotV1 } from "./contracts";

export type GroupingKey =
  | "builtin:projects"
  | "builtin:sections"
  | `plugin:${string}:${string}`;
export type PlacementOriginV1 = "ui" | "cli" | "auto";
export type PlacementAnchorV1 =
  | { kind: "before" | "after"; threadId: string }
  | { kind: "start" | "end" | "preserve" };

export interface GroupDescriptor {
  id: string;
  label: string;
  acceptsAssignments: boolean;
  icon?: import("./contracts").IconDataV1;
  visibleWhenEmpty?: boolean;
  defaultCollapsed?: boolean;
}

export type MembershipDescriptor =
  | { kind: "ribbon" }
  | {
      kind: "external";
      writable: boolean;
      groupIdForThread(threadId: string): string | null;
      setGroupIdForThread?(threadId: string, groupId: string): void;
    };

export interface GroupingDescriptor {
  groupingKey: GroupingKey;
  singularLabel: string;
  pluralLabel: string;
  icon?: import("./contracts").IconDataV1;
  defaultGroupId: string;
  groups: readonly GroupDescriptor[];
  membership: MembershipDescriptor;
}

export interface PlacementRecordV1 {
  groupingKey: GroupingKey;
  groupId: string;
  threadId: string;
  enteredAtMs: number | null;
  previousGroupId?: string;
  origin?: PlacementOriginV1;
}

export type PlacementResultV1<T, Code extends string> =
  | { ok: true; value: T }
  | {
      ok: false;
      error: { code: Code; message: string; revision?: number };
    };

export const RIBBON_SIDEBAR_MIGRATIONS = [
  `
    CREATE TABLE IF NOT EXISTS eligible_root (
      thread_id TEXT PRIMARY KEY,
      bb_order INTEGER NOT NULL CHECK (bb_order >= 0)
    );
    CREATE TABLE IF NOT EXISTS grouping_revision (
      grouping_key TEXT PRIMARY KEY,
      revision INTEGER NOT NULL CHECK (revision >= 0)
    );
    CREATE TABLE IF NOT EXISTS group_assignment (
      grouping_key TEXT NOT NULL,
      thread_id TEXT NOT NULL,
      group_id TEXT NOT NULL,
      entered_at_ms INTEGER NOT NULL CHECK (entered_at_ms >= 0),
      previous_group_id TEXT,
      origin TEXT NOT NULL CHECK (origin IN ('ui', 'cli', 'auto')),
      PRIMARY KEY (grouping_key, thread_id)
    );
    CREATE INDEX IF NOT EXISTS group_assignment_membership
      ON group_assignment(grouping_key, group_id, thread_id);
    CREATE TABLE IF NOT EXISTS group_order (
      grouping_key TEXT NOT NULL,
      group_id TEXT NOT NULL,
      thread_id TEXT NOT NULL,
      sort_key TEXT NOT NULL,
      updated_at_ms INTEGER NOT NULL CHECK (updated_at_ms >= 0),
      PRIMARY KEY (grouping_key, group_id, thread_id)
    );
    CREATE INDEX IF NOT EXISTS group_order_sequence
      ON group_order(grouping_key, group_id, sort_key, thread_id);
    CREATE TABLE IF NOT EXISTS provider_catalog (
      provider_plugin_id TEXT PRIMARY KEY,
      catalog_json TEXT NOT NULL,
      available INTEGER NOT NULL CHECK (available IN (0, 1))
    );
    CREATE TABLE IF NOT EXISTS migration_import (
      source_plugin_id TEXT NOT NULL,
      installation_id TEXT NOT NULL,
      source_revision INTEGER NOT NULL CHECK (source_revision >= 0),
      snapshot_json TEXT NOT NULL,
      PRIMARY KEY (source_plugin_id, installation_id, source_revision)
    );
  `,
  `
    CREATE TABLE IF NOT EXISTS thread_preview (
      thread_id TEXT PRIMARY KEY,
      preview TEXT,
      updated_at_ms INTEGER NOT NULL CHECK (updated_at_ms >= 0)
    );
  `,
];

interface AssignmentRow {
  grouping_key: GroupingKey;
  thread_id: string;
  group_id: string;
  entered_at_ms: number;
  previous_group_id: string | null;
  origin: PlacementOriginV1;
}

interface EligibleRow {
  thread_id: string;
  bb_order: number;
}

interface OrderRow {
  thread_id: string;
  sort_key: string;
}

interface MigrationOrderRow extends OrderRow {
  group_id: string;
  updated_at_ms: number;
}

interface PlacementStoreOptions {
  grouping(groupingKey: GroupingKey): GroupingDescriptor | null;
  groupings(): readonly GroupingDescriptor[];
  now?: () => number;
}

export interface PlacementStore {
  reconcileRoots(
    eligibleRootThreadIds: readonly string[],
    childThreadIds: readonly string[],
  ): { changedGroupingKeys: GroupingKey[] };
  deleteThread(threadId: string): { changedGroupingKeys: GroupingKey[] };
  deleteGroupOrder(
    groupingKey: GroupingKey,
    groupId: string,
  ): { deleted: number; revision: number };
  importThreadStagesSnapshot(snapshot: ThreadStagesMigrationSnapshotV1): {
    imported: boolean;
  };
  rekeyGrouping(
    from: `plugin:${string}:${string}`,
    to: `plugin:${string}:${string}`,
  ): { assignments: number; orders: number; revision: number };
  getPlacement(input: {
    groupingKey: GroupingKey;
    threadId: string;
  }): PlacementResultV1<
    { placement: PlacementRecordV1; revision: number },
    "GROUPING_NOT_FOUND" | "THREAD_INELIGIBLE"
  >;
  updatePlacement(input: {
    groupingKey: GroupingKey;
    groupId: string;
    threadId: string;
    anchor?: PlacementAnchorV1;
    expectedRevision?: number;
    origin: PlacementOriginV1;
  }): PlacementResultV1<
    { placement: PlacementRecordV1; revision: number },
    | "GROUPING_NOT_FOUND"
    | "GROUP_NOT_FOUND"
    | "GROUP_NOT_ASSIGNABLE"
    | "THREAD_INELIGIBLE"
    | "ANCHOR_INELIGIBLE"
    | "MEMBERSHIP_NOT_WRITABLE"
    | "REVISION_CONFLICT"
  >;
  listPlacements(input: {
    groupingKey: GroupingKey;
    threadIds?: readonly string[];
    groupIds?: readonly string[];
    origins?: readonly PlacementOriginV1[];
    enteredBeforeMs?: number;
  }): PlacementResultV1<
    {
      groupingKey: GroupingKey;
      revision: number;
      items: PlacementRecordV1[];
    },
    "GROUPING_NOT_FOUND" | "GROUP_NOT_FOUND"
  >;
}

function assertUniqueThreadIds(threadIds: readonly string[], label: string) {
  const unique = new Set(threadIds);
  if (unique.size !== threadIds.length) {
    throw new Error(`${label} must not contain duplicate thread IDs.`);
  }
  for (const threadId of threadIds) {
    if (threadId.length === 0 || threadId.length > 256) {
      throw new Error(`${label} contains an invalid thread ID.`);
    }
  }
}

function placementFromAssignment(row: AssignmentRow): PlacementRecordV1 {
  return {
    groupingKey: row.grouping_key,
    groupId: row.group_id,
    threadId: row.thread_id,
    enteredAtMs: row.entered_at_ms,
    ...(row.previous_group_id === null
      ? {}
      : { previousGroupId: row.previous_group_id }),
    origin: row.origin,
  };
}

export function createPlacementStore(
  database: BetterSqlite3.Database,
  options: PlacementStoreOptions,
): PlacementStore {
  const now = options.now ?? Date.now;
  const clearEligibleRoots = database.prepare("DELETE FROM eligible_root");
  const deleteEligibleRoot = database.prepare(
    "DELETE FROM eligible_root WHERE thread_id = ?",
  );
  const insertEligibleRoot = database.prepare(`
    INSERT INTO eligible_root(thread_id, bb_order) VALUES (?, ?)
  `);
  const removeChildAssignment = database.prepare(`
    DELETE FROM group_assignment WHERE thread_id = ?
  `);
  const removeChildOrder = database.prepare(`
    DELETE FROM group_order WHERE thread_id = ?
  `);
  const assignmentExists = database.prepare(`
    SELECT 1 FROM group_assignment
    WHERE grouping_key = ? AND thread_id = ?
  `);
  const insertAssignment = database.prepare(`
    INSERT INTO group_assignment(
      grouping_key, thread_id, group_id, entered_at_ms, previous_group_id, origin
    ) VALUES (?, ?, ?, ?, NULL, 'auto')
  `);
  const ensureRevision = database.prepare(`
    INSERT OR IGNORE INTO grouping_revision(grouping_key, revision) VALUES (?, 0)
  `);
  const incrementRevision = database.prepare(`
    UPDATE grouping_revision SET revision = revision + 1 WHERE grouping_key = ?
  `);
  const getRevision = database.prepare(`
    SELECT revision FROM grouping_revision WHERE grouping_key = ?
  `);
  const listEligibleRoots = database.prepare(`
    SELECT thread_id, bb_order FROM eligible_root ORDER BY bb_order, thread_id
  `);
  const getEligibleRoot = database.prepare(`
    SELECT thread_id, bb_order FROM eligible_root WHERE thread_id = ?
  `);
  const getAssignment = database.prepare(`
    SELECT grouping_key, thread_id, group_id, entered_at_ms,
      previous_group_id, origin
    FROM group_assignment
    WHERE grouping_key = ? AND thread_id = ?
  `);
  const listAssignments = database.prepare(`
    SELECT grouping_key, thread_id, group_id, entered_at_ms,
      previous_group_id, origin
    FROM group_assignment
    WHERE grouping_key = ?
  `);
  const listOrders = database.prepare(`
    SELECT thread_id, sort_key
    FROM group_order
    WHERE grouping_key = ? AND group_id = ?
    ORDER BY sort_key, thread_id
  `);
  const listMigrationOrders = database.prepare(`
    SELECT group_id, thread_id, sort_key, updated_at_ms
    FROM group_order
    WHERE grouping_key = ?
    ORDER BY group_id, thread_id
  `);
  const getOrder = database.prepare(`
    SELECT thread_id, sort_key
    FROM group_order
    WHERE grouping_key = ? AND group_id = ? AND thread_id = ?
  `);
  const upsertOrder = database.prepare(`
    INSERT INTO group_order(
      grouping_key, group_id, thread_id, sort_key, updated_at_ms
    ) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(grouping_key, group_id, thread_id) DO UPDATE SET
      sort_key = excluded.sort_key,
      updated_at_ms = CASE
        WHEN group_order.sort_key = excluded.sort_key
          THEN group_order.updated_at_ms
        ELSE excluded.updated_at_ms
      END
  `);
  const upsertAssignment = database.prepare(`
    INSERT INTO group_assignment(
      grouping_key, thread_id, group_id, entered_at_ms, previous_group_id, origin
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(grouping_key, thread_id) DO UPDATE SET
      group_id = excluded.group_id,
      entered_at_ms = excluded.entered_at_ms,
      previous_group_id = excluded.previous_group_id,
      origin = excluded.origin
  `);
  const importedSnapshotExists = database.prepare(`
    SELECT 1 FROM migration_import
    WHERE source_plugin_id = ? AND installation_id = ? AND source_revision = ?
  `);
  const saveImportedSnapshot = database.prepare(`
    INSERT INTO migration_import(
      source_plugin_id, installation_id, source_revision, snapshot_json
    ) VALUES (?, ?, ?, ?)
  `);
  const deleteGroupingAssignments = database.prepare(`
    DELETE FROM group_assignment WHERE grouping_key = ?
  `);
  const deleteGroupingOrders = database.prepare(`
    DELETE FROM group_order WHERE grouping_key = ?
  `);
  const deleteGroupOrders = database.prepare(`
    DELETE FROM group_order WHERE grouping_key = ? AND group_id = ?
  `);
  const countGroupingRows = database.prepare(`
    SELECT
      (SELECT COUNT(*) FROM group_assignment WHERE grouping_key = ?) AS assignments,
      (SELECT COUNT(*) FROM group_order WHERE grouping_key = ?) AS orders
  `);
  const countNonDefaultAssignments = database.prepare(`
    SELECT COUNT(*) AS count
    FROM group_assignment
    WHERE grouping_key = ?
      AND (
        group_id <> ?
        OR previous_group_id IS NOT NULL
        OR origin <> 'auto'
      )
  `);
  const rekeyAssignments = database.prepare(`
    UPDATE group_assignment SET grouping_key = ? WHERE grouping_key = ?
  `);
  const rekeyOrders = database.prepare(`
    UPDATE group_order SET grouping_key = ? WHERE grouping_key = ?
  `);
  const deleteRevision = database.prepare(`
    DELETE FROM grouping_revision WHERE grouping_key = ?
  `);
  const setRevision = database.prepare(`
    INSERT INTO grouping_revision(grouping_key, revision) VALUES (?, ?)
  `);

  function currentGroupId(
    grouping: GroupingDescriptor,
    threadId: string,
  ): string | null {
    if (grouping.membership.kind === "external") {
      return grouping.membership.groupIdForThread(threadId);
    }
    const assignment = getAssignment.get(
      grouping.groupingKey,
      threadId,
    ) as AssignmentRow | undefined;
    return assignment?.group_id ?? grouping.defaultGroupId;
  }

  function orderedMemberIds(
    grouping: GroupingDescriptor,
    groupId: string,
  ): string[] {
    const eligible = listEligibleRoots.all() as EligibleRow[];
    const members = eligible.filter(
      (row) => currentGroupId(grouping, row.thread_id) === groupId,
    );
    const memberIds = new Set(members.map((row) => row.thread_id));
    const explicit = (listOrders.all(grouping.groupingKey, groupId) as OrderRow[])
      .map((row) => row.thread_id)
      .filter((threadId) => memberIds.has(threadId));
    const explicitIds = new Set(explicit);
    return [
      ...explicit,
      ...members
        .map((row) => row.thread_id)
        .filter((threadId) => !explicitIds.has(threadId)),
    ];
  }

  function materializeOrder(
    groupingKey: GroupingKey,
    groupId: string,
    threadIds: readonly string[],
    updatedAtMs: number,
  ): void {
    let previousKey: string | null = null;
    for (const threadId of threadIds) {
      const current = getOrder.get(groupingKey, groupId, threadId) as
        | OrderRow
        | undefined;
      if (current !== undefined && (previousKey === null || current.sort_key > previousKey)) {
        previousKey = current.sort_key;
        continue;
      }
      const nextKey = createOrderKeyBetween(previousKey, null);
      upsertOrder.run(groupingKey, groupId, threadId, nextKey, updatedAtMs);
      previousKey = nextKey;
    }
  }

  function placementFor(
    grouping: GroupingDescriptor,
    threadId: string,
  ): PlacementRecordV1 {
    if (grouping.membership.kind === "ribbon") {
      const assignment = getAssignment.get(
        grouping.groupingKey,
        threadId,
      ) as AssignmentRow | undefined;
      if (assignment !== undefined) return placementFromAssignment(assignment);
    }
    return {
      groupingKey: grouping.groupingKey,
      groupId: currentGroupId(grouping, threadId) ?? grouping.defaultGroupId,
      threadId,
      enteredAtMs: null,
    };
  }

  const reconcile = database.transaction(
    (
      eligibleRootThreadIds: readonly string[],
      childThreadIds: readonly string[],
    ) => {
      clearEligibleRoots.run();
      eligibleRootThreadIds.forEach((threadId, index) => {
        insertEligibleRoot.run(threadId, index);
      });

      const changed = new Set<GroupingKey>();
      for (const threadId of childThreadIds) {
        const affectedAssignmentKeys = database
          .prepare(
            "SELECT grouping_key FROM group_assignment WHERE thread_id = ?",
          )
          .all(threadId) as Array<{ grouping_key: GroupingKey }>;
        const affectedOrderKeys = database
          .prepare("SELECT grouping_key FROM group_order WHERE thread_id = ?")
          .all(threadId) as Array<{ grouping_key: GroupingKey }>;
        removeChildAssignment.run(threadId);
        removeChildOrder.run(threadId);
        for (const row of [...affectedAssignmentKeys, ...affectedOrderKeys]) {
          changed.add(row.grouping_key);
        }
      }

      for (const grouping of options.groupings()) {
        ensureRevision.run(grouping.groupingKey);
        if (grouping.membership.kind !== "ribbon") continue;
        for (const threadId of eligibleRootThreadIds) {
          if (assignmentExists.get(grouping.groupingKey, threadId)) continue;
          insertAssignment.run(
            grouping.groupingKey,
            threadId,
            grouping.defaultGroupId,
            now(),
          );
          changed.add(grouping.groupingKey);
        }
      }

      for (const groupingKey of changed) {
        ensureRevision.run(groupingKey);
        incrementRevision.run(groupingKey);
      }
      return { changedGroupingKeys: [...changed] };
    },
  );

  return {
    reconcileRoots(eligibleRootThreadIds, childThreadIds) {
      assertUniqueThreadIds(eligibleRootThreadIds, "Eligible roots");
      assertUniqueThreadIds(childThreadIds, "Child threads");
      const eligible = new Set(eligibleRootThreadIds);
      if (childThreadIds.some((threadId) => eligible.has(threadId))) {
        throw new Error("A thread cannot be both an eligible root and a child.");
      }
      return reconcile.immediate(eligibleRootThreadIds, childThreadIds);
    },
    deleteThread(threadId) {
      assertUniqueThreadIds([threadId], "Deleted thread");
      return database
        .transaction(() => {
          const assignmentKeys = database
            .prepare(
              "SELECT grouping_key FROM group_assignment WHERE thread_id = ?",
            )
            .all(threadId) as Array<{ grouping_key: GroupingKey }>;
          const orderKeys = database
            .prepare(
              "SELECT grouping_key FROM group_order WHERE thread_id = ?",
            )
            .all(threadId) as Array<{ grouping_key: GroupingKey }>;
          const changed = new Set(
            [...assignmentKeys, ...orderKeys].map((row) => row.grouping_key),
          );
          deleteEligibleRoot.run(threadId);
          removeChildAssignment.run(threadId);
          removeChildOrder.run(threadId);
          for (const groupingKey of changed) {
            ensureRevision.run(groupingKey);
            incrementRevision.run(groupingKey);
          }
          return { changedGroupingKeys: [...changed] };
        })
        .immediate();
    },
    deleteGroupOrder(groupingKey, groupId) {
      return database
        .transaction(() => {
          ensureRevision.run(groupingKey);
          const deleted = deleteGroupOrders.run(groupingKey, groupId).changes;
          if (deleted > 0) incrementRevision.run(groupingKey);
          const revision = (
            getRevision.get(groupingKey) as { revision: number }
          ).revision;
          return { deleted, revision };
        })
        .immediate();
    },
    importThreadStagesSnapshot(snapshot) {
      if (
        importedSnapshotExists.get(
          snapshot.sourcePluginId,
          snapshot.installationId,
          snapshot.revision,
        )
      ) {
        return { imported: false };
      }
      return database
        .transaction(() => {
          const groupingIds = new Set(
            snapshot.placements.map(({ groupingId }) => groupingId),
          );
          for (const groupingId of groupingIds) {
            const groupingKey =
              `plugin:${snapshot.sourcePluginId}:${groupingId}` as GroupingKey;
            const grouping = options.grouping(groupingKey);
            if (grouping === null || grouping.membership.kind !== "ribbon") {
              throw new Error(`Migration grouping is unavailable: ${groupingKey}`);
            }
            deleteGroupingAssignments.run(groupingKey);
            deleteGroupingOrders.run(groupingKey);
          }

          for (const placement of snapshot.placements) {
            const groupingKey =
              `plugin:${snapshot.sourcePluginId}:${placement.groupingId}` as GroupingKey;
            const grouping = options.grouping(groupingKey);
            if (grouping === null) {
              throw new Error(`Migration grouping is unavailable: ${groupingKey}`);
            }
            const groups = new Set(grouping.groups.map(({ id }) => id));
            if (
              !groups.has(placement.groupId) ||
              placement.orders.some(({ groupId }) => !groups.has(groupId))
            ) {
              throw new Error(`Migration names an unknown group in ${groupingKey}.`);
            }
            upsertAssignment.run(
              groupingKey,
              placement.threadId,
              placement.groupId,
              placement.enteredAtMs,
              placement.previousGroupId ?? null,
              placement.origin,
            );
            for (const order of placement.orders) {
              upsertOrder.run(
                groupingKey,
                order.groupId,
                placement.threadId,
                order.sortKey,
                order.updatedAtMs,
              );
            }
          }

          for (const groupingId of groupingIds) {
            const groupingKey =
              `plugin:${snapshot.sourcePluginId}:${groupingId}` as GroupingKey;
            const importedAssignments = listAssignments.all(
              groupingKey,
            ) as AssignmentRow[];
            const expected = snapshot.placements.filter(
              (placement) => placement.groupingId === groupingId,
            );
            const expectedAssignments = expected
              .map((placement) => ({
                grouping_key: groupingKey,
                thread_id: placement.threadId,
                group_id: placement.groupId,
                entered_at_ms: placement.enteredAtMs,
                previous_group_id: placement.previousGroupId ?? null,
                origin: placement.origin,
              }))
              .sort((left, right) => left.thread_id.localeCompare(right.thread_id));
            importedAssignments.sort((left, right) =>
              left.thread_id.localeCompare(right.thread_id),
            );
            const importedOrders = listMigrationOrders.all(
              groupingKey,
            ) as MigrationOrderRow[];
            const expectedOrders = expected
              .flatMap((placement) =>
                placement.orders.map((order) => ({
                  group_id: order.groupId,
                  thread_id: placement.threadId,
                  sort_key: order.sortKey,
                  updated_at_ms: order.updatedAtMs,
                })),
              )
              .sort(
                (left, right) =>
                  left.group_id.localeCompare(right.group_id) ||
                  left.thread_id.localeCompare(right.thread_id),
              );
            if (
              JSON.stringify(importedAssignments) !==
                JSON.stringify(expectedAssignments) ||
              JSON.stringify(importedOrders) !== JSON.stringify(expectedOrders)
            ) {
              throw new Error(`Migration verification failed for ${groupingKey}.`);
            }
            ensureRevision.run(groupingKey);
            incrementRevision.run(groupingKey);
          }
          saveImportedSnapshot.run(
            snapshot.sourcePluginId,
            snapshot.installationId,
            snapshot.revision,
            JSON.stringify(snapshot),
          );
          return { imported: true };
        })
        .immediate();
    },
    rekeyGrouping(from, to) {
      if (from === to) {
        ensureRevision.run(from);
        const revision = (
          getRevision.get(from) as { revision: number }
        ).revision;
        const counts = countGroupingRows.get(from, from) as {
          assignments: number;
          orders: number;
        };
        return { ...counts, revision };
      }
      const target = options.grouping(to);
      if (target === null || target.membership.kind !== "ribbon") {
        throw new Error(`Target grouping is unavailable or externally owned: ${to}`);
      }
      return database
        .transaction(() => {
          const targetCounts = countGroupingRows.get(to, to) as {
            assignments: number;
            orders: number;
          };
          const nonDefaultAssignments = countNonDefaultAssignments.get(
            to,
            target.defaultGroupId,
          ) as { count: number };
          if (
            targetCounts.orders > 0 ||
            nonDefaultAssignments.count > 0
          ) {
            throw new Error(`Target grouping already has placement state: ${to}`);
          }
          deleteGroupingAssignments.run(to);
          deleteGroupingOrders.run(to);
          deleteRevision.run(to);
          ensureRevision.run(from);
          const revision = (
            getRevision.get(from) as { revision: number }
          ).revision;
          const assignments = rekeyAssignments.run(to, from).changes;
          const orders = rekeyOrders.run(to, from).changes;
          deleteRevision.run(from);
          setRevision.run(to, revision);
          return { assignments, orders, revision };
        })
        .immediate();
    },
    getPlacement(input) {
      const grouping = options.grouping(input.groupingKey);
      if (grouping === null) {
        return {
          ok: false,
          error: {
            code: "GROUPING_NOT_FOUND",
            message: `Grouping not found: ${input.groupingKey}`,
          },
        };
      }
      if (!getEligibleRoot.get(input.threadId)) {
        return {
          ok: false,
          error: {
            code: "THREAD_INELIGIBLE",
            message: `Thread is not an eligible visible root: ${input.threadId}`,
          },
        };
      }
      ensureRevision.run(grouping.groupingKey);
      const revision = (
        getRevision.get(grouping.groupingKey) as { revision: number }
      ).revision;
      if (grouping.membership.kind === "ribbon") {
        const assignment = getAssignment.get(
          grouping.groupingKey,
          input.threadId,
        ) as AssignmentRow | undefined;
        const placement =
          assignment === undefined
            ? {
                groupingKey: grouping.groupingKey,
                groupId: grouping.defaultGroupId,
                threadId: input.threadId,
                enteredAtMs: null,
              }
            : placementFromAssignment(assignment);
        return { ok: true, value: { placement, revision } };
      }
      const groupId = grouping.membership.groupIdForThread(input.threadId);
      if (groupId === null) {
        return {
          ok: false,
          error: {
            code: "THREAD_INELIGIBLE",
            message: `Thread has no ${grouping.singularLabel.toLowerCase()} membership: ${input.threadId}`,
          },
        };
      }
      return {
        ok: true,
        value: {
          revision,
          placement: {
            groupingKey: grouping.groupingKey,
            groupId,
            threadId: input.threadId,
            enteredAtMs: null,
          },
        },
      };
    },
    updatePlacement(input) {
      const grouping = options.grouping(input.groupingKey);
      if (grouping === null) {
        return {
          ok: false,
          error: {
            code: "GROUPING_NOT_FOUND",
            message: `Grouping not found: ${input.groupingKey}`,
          },
        };
      }
      const destination = grouping.groups.find((group) => group.id === input.groupId);
      if (destination === undefined) {
        return {
          ok: false,
          error: {
            code: "GROUP_NOT_FOUND",
            message: `Group not found: ${input.groupingKey}/${input.groupId}`,
          },
        };
      }
      if (!destination.acceptsAssignments) {
        return {
          ok: false,
          error: {
            code: "GROUP_NOT_ASSIGNABLE",
            message: `Group does not accept assignments: ${input.groupingKey}/${input.groupId}`,
          },
        };
      }
      if (!getEligibleRoot.get(input.threadId)) {
        return {
          ok: false,
          error: {
            code: "THREAD_INELIGIBLE",
            message: `Thread is not an eligible visible root: ${input.threadId}`,
          },
        };
      }

      const currentGroup = currentGroupId(grouping, input.threadId);
      const currentOrder =
        currentGroup === null ? [] : orderedMemberIds(grouping, currentGroup);
      const destinationOrder =
        currentGroup === input.groupId
          ? currentOrder
          : orderedMemberIds(grouping, input.groupId);
      let anchorIndex = -1;
      if (input.anchor?.kind === "before" || input.anchor?.kind === "after") {
        anchorIndex = destinationOrder.indexOf(input.anchor.threadId);
        if (anchorIndex < 0 || input.anchor.threadId === input.threadId) {
          return {
            ok: false,
            error: {
              code: "ANCHOR_INELIGIBLE",
              message: `Anchor is not an eligible destination member: ${input.anchor.threadId}`,
            },
          };
        }
      }

      const currentIndex = destinationOrder.indexOf(input.threadId);
      const satisfied =
        currentGroup === input.groupId &&
        (input.anchor === undefined ||
          input.anchor.kind === "preserve" ||
          (input.anchor.kind === "start" && currentIndex === 0) ||
          (input.anchor.kind === "end" && currentIndex === destinationOrder.length - 1) ||
          (input.anchor.kind === "before" && currentIndex === anchorIndex - 1) ||
          (input.anchor.kind === "after" && currentIndex === anchorIndex + 1));
      ensureRevision.run(grouping.groupingKey);
      const revision = (
        getRevision.get(grouping.groupingKey) as { revision: number }
      ).revision;
      if (satisfied) {
        return {
          ok: true,
          value: { placement: placementFor(grouping, input.threadId), revision },
        };
      }
      if (
        input.expectedRevision !== undefined &&
        input.expectedRevision !== revision
      ) {
        return {
          ok: false,
          error: {
            code: "REVISION_CONFLICT",
            message: "Grouping revision changed.",
            revision,
          },
        };
      }
      if (
        currentGroup !== input.groupId &&
        grouping.membership.kind === "external" &&
        (!grouping.membership.writable ||
          grouping.membership.setGroupIdForThread === undefined)
      ) {
        return {
          ok: false,
          error: {
            code: "MEMBERSHIP_NOT_WRITABLE",
            message: `${grouping.pluralLabel} membership is not writable.`,
          },
        };
      }

      const result = database
        .transaction(() => {
          const freshGrouping = options.grouping(input.groupingKey);
          if (freshGrouping === null) {
            return {
              ok: false as const,
              error: {
                code: "GROUPING_NOT_FOUND" as const,
                message: `Grouping not found: ${input.groupingKey}`,
              },
            };
          }
          const freshDestination = freshGrouping.groups.find(
            (group) => group.id === input.groupId,
          );
          if (freshDestination === undefined) {
            return {
              ok: false as const,
              error: {
                code: "GROUP_NOT_FOUND" as const,
                message: `Group not found: ${input.groupingKey}/${input.groupId}`,
              },
            };
          }
          if (!freshDestination.acceptsAssignments) {
            return {
              ok: false as const,
              error: {
                code: "GROUP_NOT_ASSIGNABLE" as const,
                message: `Group does not accept assignments: ${input.groupingKey}/${input.groupId}`,
              },
            };
          }
          if (!getEligibleRoot.get(input.threadId)) {
            return {
              ok: false as const,
              error: {
                code: "THREAD_INELIGIBLE" as const,
                message: `Thread is not an eligible visible root: ${input.threadId}`,
              },
            };
          }
          const freshCurrentGroup = currentGroupId(
            freshGrouping,
            input.threadId,
          );
          const freshDestinationOrder = orderedMemberIds(
            freshGrouping,
            input.groupId,
          );
          let freshAnchorIndex = -1;
          if (
            input.anchor?.kind === "before" ||
            input.anchor?.kind === "after"
          ) {
            freshAnchorIndex = freshDestinationOrder.indexOf(
              input.anchor.threadId,
            );
            if (
              freshAnchorIndex < 0 ||
              input.anchor.threadId === input.threadId
            ) {
              return {
                ok: false as const,
                error: {
                  code: "ANCHOR_INELIGIBLE" as const,
                  message: `Anchor is not an eligible destination member: ${input.anchor.threadId}`,
                },
              };
            }
          }
          const freshRevision = (
            getRevision.get(input.groupingKey) as { revision: number }
          ).revision;
          const freshIndex = freshDestinationOrder.indexOf(input.threadId);
          const freshSatisfied =
            freshCurrentGroup === input.groupId &&
            (input.anchor === undefined ||
              input.anchor.kind === "preserve" ||
              (input.anchor.kind === "start" && freshIndex === 0) ||
              (input.anchor.kind === "end" &&
                freshIndex === freshDestinationOrder.length - 1) ||
              (input.anchor.kind === "before" &&
                freshIndex === freshAnchorIndex - 1) ||
              (input.anchor.kind === "after" &&
                freshIndex === freshAnchorIndex + 1));
          if (freshSatisfied) {
            return {
              ok: true as const,
              value: {
                placement: placementFor(freshGrouping, input.threadId),
                revision: freshRevision,
              },
            };
          }
          if (
            input.expectedRevision !== undefined &&
            input.expectedRevision !== freshRevision
          ) {
            return {
              ok: false as const,
              error: {
                code: "REVISION_CONFLICT" as const,
                message: "Grouping revision changed.",
                revision: freshRevision,
              },
            };
          }
          if (
            freshCurrentGroup !== input.groupId &&
            freshGrouping.membership.kind === "external" &&
            (!freshGrouping.membership.writable ||
              freshGrouping.membership.setGroupIdForThread === undefined)
          ) {
            return {
              ok: false as const,
              error: {
                code: "MEMBERSHIP_NOT_WRITABLE" as const,
                message: `${freshGrouping.pluralLabel} membership is not writable.`,
              },
            };
          }
          const writeTime = now();
          if (
            freshCurrentGroup !== null &&
            freshCurrentGroup !== input.groupId
          ) {
            materializeOrder(
              input.groupingKey,
              freshCurrentGroup,
              orderedMemberIds(freshGrouping, freshCurrentGroup),
              writeTime,
            );
          }
          const membersWithoutThread = freshDestinationOrder.filter(
            (threadId) => threadId !== input.threadId,
          );
          let destinationKey: string | null = null;
          if (input.anchor?.kind === "preserve") {
            const retained = getOrder.get(
              input.groupingKey,
              input.groupId,
              input.threadId,
            ) as OrderRow | undefined;
            destinationKey = retained?.sort_key ?? null;
          }
          if (destinationKey === null) {
            const retainedDestinationIds = (
              listOrders.all(input.groupingKey, input.groupId) as OrderRow[]
            )
              .map(({ thread_id }) => thread_id)
              .filter((threadId) => threadId !== input.threadId);
            const retainedDestinationSet = new Set(retainedDestinationIds);
            const destinationOrderWithRetained = [
              ...retainedDestinationIds,
              ...membersWithoutThread.filter(
                (threadId) => !retainedDestinationSet.has(threadId),
              ),
            ];
            materializeOrder(
              input.groupingKey,
              input.groupId,
              destinationOrderWithRetained,
              writeTime,
            );
            let insertionIndex = destinationOrderWithRetained.length;
            if (input.anchor?.kind === "start") insertionIndex = 0;
            if (input.anchor?.kind === "before" || input.anchor?.kind === "after") {
              const index = destinationOrderWithRetained.indexOf(
                input.anchor.threadId,
              );
              insertionIndex =
                input.anchor.kind === "before" ? index : index + 1;
            }
            const previousThreadId =
              destinationOrderWithRetained[insertionIndex - 1];
            const nextThreadId = destinationOrderWithRetained[insertionIndex];
            const previousKey =
              previousThreadId === undefined
                ? null
                : ((getOrder.get(
                    input.groupingKey,
                    input.groupId,
                    previousThreadId,
                  ) as OrderRow).sort_key);
            const nextKey =
              nextThreadId === undefined
                ? null
                : ((getOrder.get(
                    input.groupingKey,
                    input.groupId,
                    nextThreadId,
                  ) as OrderRow).sort_key);
            destinationKey = createOrderKeyBetween(previousKey, nextKey);
            upsertOrder.run(
              input.groupingKey,
              input.groupId,
              input.threadId,
              destinationKey,
              writeTime,
            );
          }

          if (freshCurrentGroup !== input.groupId) {
            if (freshGrouping.membership.kind === "ribbon") {
              upsertAssignment.run(
                input.groupingKey,
                input.threadId,
                input.groupId,
                writeTime,
                freshCurrentGroup,
                input.origin,
              );
            } else {
              freshGrouping.membership.setGroupIdForThread?.(
                input.threadId,
                input.groupId,
              );
            }
          }
          incrementRevision.run(input.groupingKey);
          const nextRevision = freshRevision + 1;
          return {
            ok: true as const,
            value: {
              placement: placementFor(freshGrouping, input.threadId),
              revision: nextRevision,
            },
          };
        })
        .immediate();
      return result;
    },
    listPlacements(input) {
      const grouping = options.grouping(input.groupingKey);
      if (grouping === null) {
        return {
          ok: false,
          error: {
            code: "GROUPING_NOT_FOUND",
            message: `Grouping not found: ${input.groupingKey}`,
          },
        };
      }
      const groupsById = new Map(grouping.groups.map((group) => [group.id, group]));
      for (const groupId of input.groupIds ?? []) {
        if (!groupsById.has(groupId)) {
          return {
            ok: false,
            error: {
              code: "GROUP_NOT_FOUND",
              message: `Group not found: ${input.groupingKey}/${groupId}`,
            },
          };
        }
      }
      ensureRevision.run(grouping.groupingKey);
      const revision = (
        getRevision.get(grouping.groupingKey) as { revision: number }
      ).revision;
      const eligibleRows = listEligibleRoots.all() as EligibleRow[];
      const eligibleById = new Map(
        eligibleRows.map((row) => [row.thread_id, row]),
      );
      const assignments = new Map(
        (listAssignments.all(grouping.groupingKey) as AssignmentRow[]).map(
          (row) => [row.thread_id, row],
        ),
      );
      const requestedThreadIds =
        input.threadIds === undefined ? null : new Set(input.threadIds);
      const requestedGroupIds =
        input.groupIds === undefined ? null : new Set(input.groupIds);
      const requestedOrigins =
        input.origins === undefined ? null : new Set(input.origins);
      const items: PlacementRecordV1[] = [];
      const catalogGroupIds = grouping.groups.map(({ id }) => id);
      const catalogGroupIdSet = new Set(catalogGroupIds);
      const orphanGroupIds: string[] = [];
      for (const eligible of eligibleRows) {
        const assignment = assignments.get(eligible.thread_id);
        const effectiveGroupId =
          grouping.membership.kind === "ribbon"
            ? (assignment?.group_id ?? grouping.defaultGroupId)
            : grouping.membership.groupIdForThread(eligible.thread_id);
        if (
          effectiveGroupId !== null &&
          !catalogGroupIdSet.has(effectiveGroupId) &&
          !orphanGroupIds.includes(effectiveGroupId)
        ) {
          orphanGroupIds.push(effectiveGroupId);
        }
      }

      for (const groupId of [...catalogGroupIds, ...orphanGroupIds]) {
        if (requestedGroupIds !== null && !requestedGroupIds.has(groupId)) {
          continue;
        }
        const members = eligibleRows.filter((eligible) => {
          if (
            requestedThreadIds !== null &&
            !requestedThreadIds.has(eligible.thread_id)
          ) {
            return false;
          }
          const assignment = assignments.get(eligible.thread_id);
          const effectiveGroupId =
            grouping.membership.kind === "ribbon"
              ? (assignment?.group_id ?? grouping.defaultGroupId)
              : grouping.membership.groupIdForThread(eligible.thread_id);
          return effectiveGroupId === groupId;
        });
        const orderRows = listOrders.all(grouping.groupingKey, groupId) as OrderRow[];
        const explicitlyOrdered = orderRows
          .map((row) => eligibleById.get(row.thread_id))
          .filter((row): row is EligibleRow => row !== undefined)
          .filter((row) => members.some((member) => member.thread_id === row.thread_id));
        const explicitlyOrderedIds = new Set(
          explicitlyOrdered.map((row) => row.thread_id),
        );
        const orderedMembers = [
          ...explicitlyOrdered,
          ...members.filter((row) => !explicitlyOrderedIds.has(row.thread_id)),
        ];
        for (const member of orderedMembers) {
          const assignment = assignments.get(member.thread_id);
          const placement =
            grouping.membership.kind === "ribbon" && assignment !== undefined
              ? placementFromAssignment(assignment)
              : {
                  groupingKey: grouping.groupingKey,
                  groupId,
                  threadId: member.thread_id,
                  enteredAtMs: null,
                };
          if (
            requestedOrigins !== null &&
            (placement.origin === undefined ||
              !requestedOrigins.has(placement.origin))
          ) {
            continue;
          }
          if (
            input.enteredBeforeMs !== undefined &&
            (placement.enteredAtMs === null ||
              placement.enteredAtMs >= input.enteredBeforeMs)
          ) {
            continue;
          }
          items.push(placement);
        }
      }
      return {
        ok: true,
        value: { groupingKey: grouping.groupingKey, revision, items },
      };
    },
  };
}
