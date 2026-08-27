import type { BbPluginApi } from "@get-bb/plugin-sdk";
import type { PlacementMigrationSnapshotV1 } from "./contracts";

type Database = ReturnType<BbPluginApi["storage"]["database"]>;

// These statements are the append-only schema history shipped through v0.9.0.
// Keeping their indexes intact lets a direct upgrade expose old placement data
// without bringing the retired Thread stages sidebar or placement writer back.
export const THREAD_STAGE_SOURCE_MIGRATIONS = [
  `
    CREATE TABLE IF NOT EXISTS thread_organization (
      thread_id TEXT PRIMARY KEY,
      status TEXT NOT NULL CHECK (status IN ('Done', 'To Do', 'Working', 'Waiting', 'Deferred', 'Canceled')),
      position INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS thread_organization_status_position
      ON thread_organization(status, position, thread_id);
    CREATE TABLE IF NOT EXISTS thread_organization_meta (
      singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
      revision INTEGER NOT NULL
    );
    INSERT OR IGNORE INTO thread_organization_meta(singleton, revision) VALUES (1, 0);
  `,
  `
    ALTER TABLE thread_organization ADD COLUMN sort_key TEXT;
    UPDATE thread_organization
      SET sort_key = printf('%016d', position)
      WHERE sort_key IS NULL;
    CREATE INDEX IF NOT EXISTS thread_organization_status_sort_key
      ON thread_organization(status, sort_key, thread_id);
  `,
  `
    CREATE TABLE IF NOT EXISTS thread_task_workflow (
      thread_id TEXT PRIMARY KEY,
      is_working INTEGER NOT NULL CHECK (is_working IN (0, 1)),
      updated_at INTEGER NOT NULL
    );
  `,
  `
    CREATE TABLE IF NOT EXISTS thread_task_preview (
      thread_id TEXT PRIMARY KEY,
      preview TEXT,
      updated_at INTEGER NOT NULL
    );
  `,
  `
    CREATE TABLE thread_organization_renamed (
      thread_id TEXT PRIMARY KEY,
      status TEXT NOT NULL CHECK (status IN ('Done', 'To do', 'Working', 'Waiting', 'Deferred', 'Canceled')),
      position INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      sort_key TEXT
    );
    INSERT INTO thread_organization_renamed(thread_id, status, position, updated_at, sort_key)
      SELECT thread_id,
        CASE status WHEN 'To Do' THEN 'To do' ELSE status END,
        position,
        updated_at,
        sort_key
      FROM thread_organization;
    DROP TABLE thread_organization;
    ALTER TABLE thread_organization_renamed RENAME TO thread_organization;
    CREATE INDEX IF NOT EXISTS thread_organization_status_position
      ON thread_organization(status, position, thread_id);
    CREATE INDEX IF NOT EXISTS thread_organization_status_sort_key
      ON thread_organization(status, sort_key, thread_id);
  `,
  `
    ALTER TABLE thread_organization ADD COLUMN moved_by TEXT;
    ALTER TABLE thread_organization ADD COLUMN previous_status TEXT;
    ALTER TABLE thread_organization ADD COLUMN previous_sort_key TEXT;
  `,
  `
    CREATE TABLE thread_organization_backlog (
      thread_id TEXT PRIMARY KEY,
      status TEXT NOT NULL CHECK (status IN ('Backlog', 'To do', 'Working', 'Waiting', 'Done', 'Canceled')),
      position INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      sort_key TEXT,
      moved_by TEXT,
      previous_status TEXT,
      previous_sort_key TEXT
    );
    INSERT INTO thread_organization_backlog(
      thread_id, status, position, updated_at, sort_key,
      moved_by, previous_status, previous_sort_key
    )
      SELECT
        thread_id,
        CASE status WHEN 'Deferred' THEN 'Backlog' ELSE status END,
        position,
        updated_at,
        sort_key,
        moved_by,
        CASE previous_status WHEN 'Deferred' THEN 'Backlog' ELSE previous_status END,
        previous_sort_key
      FROM thread_organization;
    DROP TABLE thread_organization;
    ALTER TABLE thread_organization_backlog RENAME TO thread_organization;
    CREATE INDEX IF NOT EXISTS thread_organization_status_position
      ON thread_organization(status, position, thread_id);
    CREATE INDEX IF NOT EXISTS thread_organization_status_sort_key
      ON thread_organization(status, sort_key, thread_id);
  `,
  `
    CREATE TABLE thread_organization_blocked (
      thread_id TEXT PRIMARY KEY,
      status TEXT NOT NULL CHECK (status IN ('Backlog', 'To do', 'Working', 'Blocked', 'Done', 'Canceled')),
      position INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      sort_key TEXT,
      moved_by TEXT,
      previous_status TEXT,
      previous_sort_key TEXT
    );
    INSERT INTO thread_organization_blocked(
      thread_id, status, position, updated_at, sort_key,
      moved_by, previous_status, previous_sort_key
    )
      SELECT
        thread_id,
        CASE status WHEN 'Waiting' THEN 'Blocked' ELSE status END,
        position,
        updated_at,
        sort_key,
        moved_by,
        CASE previous_status WHEN 'Waiting' THEN 'Blocked' ELSE previous_status END,
        previous_sort_key
      FROM thread_organization;
    DROP TABLE thread_organization;
    ALTER TABLE thread_organization_blocked RENAME TO thread_organization;
    CREATE INDEX IF NOT EXISTS thread_organization_status_position
      ON thread_organization(status, position, thread_id);
    CREATE INDEX IF NOT EXISTS thread_organization_status_sort_key
      ON thread_organization(status, sort_key, thread_id);
  `,
  `
    CREATE TABLE thread_organization_five_stages (
      thread_id TEXT PRIMARY KEY,
      status TEXT NOT NULL CHECK (status IN ('Deferred', 'Idle', 'Active', 'Blocked', 'Completed')),
      position INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      sort_key TEXT,
      moved_by TEXT,
      previous_status TEXT,
      previous_sort_key TEXT
    );
    INSERT INTO thread_organization_five_stages(
      thread_id, status, position, updated_at, sort_key,
      moved_by, previous_status, previous_sort_key
    )
      SELECT
        thread_id,
        CASE status
          WHEN 'Backlog' THEN 'Deferred'
          WHEN 'To do' THEN 'Idle'
          WHEN 'Working' THEN 'Active'
          WHEN 'Done' THEN 'Completed'
          WHEN 'Canceled' THEN 'Completed'
          ELSE status
        END,
        position,
        updated_at,
        CASE status
          WHEN 'Done' THEN '0' || sort_key
          WHEN 'Canceled' THEN '1' || sort_key
          ELSE sort_key
        END,
        moved_by,
        CASE previous_status
          WHEN 'Backlog' THEN 'Deferred'
          WHEN 'To do' THEN 'Idle'
          WHEN 'Working' THEN 'Active'
          WHEN 'Done' THEN 'Completed'
          WHEN 'Canceled' THEN 'Completed'
          ELSE previous_status
        END,
        previous_sort_key
      FROM thread_organization;
    DROP TABLE thread_organization;
    ALTER TABLE thread_organization_five_stages RENAME TO thread_organization;
    CREATE INDEX IF NOT EXISTS thread_organization_status_position
      ON thread_organization(status, position, thread_id);
    CREATE INDEX IF NOT EXISTS thread_organization_status_sort_key
      ON thread_organization(status, sort_key, thread_id);
  `,
  `
    CREATE TABLE IF NOT EXISTS thread_stage_entry (
      thread_id TEXT PRIMARY KEY,
      entered_at INTEGER NOT NULL
    );
    INSERT OR IGNORE INTO thread_stage_entry(thread_id, entered_at)
      SELECT thread_id, updated_at FROM thread_organization;
  `,
  `
    CREATE TABLE IF NOT EXISTS thread_stage_migration_meta (
      singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
      source_schema INTEGER NOT NULL CHECK (source_schema = 1),
      installation_id TEXT NOT NULL CHECK (length(installation_id) = 32),
      revision INTEGER NOT NULL CHECK (revision >= 0),
      placement_owner TEXT NOT NULL CHECK (placement_owner IN ('thread-stages', 'ribbon-sidebar')),
      forwarding_reconciliation_needed INTEGER NOT NULL DEFAULT 0
        CHECK (forwarding_reconciliation_needed IN (0, 1))
    );
    INSERT OR IGNORE INTO thread_stage_migration_meta(
      singleton, source_schema, installation_id, revision, placement_owner
    ) VALUES (1, 1, lower(hex(randomblob(16))), 0, 'thread-stages');

    CREATE TABLE IF NOT EXISTS thread_stage_order (
      thread_id TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('Deferred', 'Idle', 'Active', 'Blocked', 'Completed')),
      sort_key TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (thread_id, status)
    );
    INSERT OR IGNORE INTO thread_stage_order(thread_id, status, sort_key, updated_at)
      SELECT thread_id, status, sort_key, updated_at
      FROM thread_organization
      WHERE sort_key IS NOT NULL;
    INSERT OR IGNORE INTO thread_stage_order(thread_id, status, sort_key, updated_at)
      SELECT thread_id, previous_status, previous_sort_key, updated_at
      FROM thread_organization
      WHERE previous_status IS NOT NULL AND previous_sort_key IS NOT NULL;
  `,
];

interface MigrationMetaRow {
  source_schema: 1;
  installation_id: string;
  revision: number;
  placement_owner: "thread-stages" | "ribbon-sidebar";
}

interface MigrationPlacementRow {
  thread_id: string;
  status: string;
  sort_key: string;
  updated_at: number;
  moved_by: "app" | "cli" | "auto" | null;
  previous_status: string | null;
  entered_at: number;
}

interface RetainedOrderRow {
  thread_id: string;
  status: string;
  sort_key: string;
  updated_at: number;
}

export interface ThreadStageMigrationSource {
  snapshot(): PlacementMigrationSnapshotV1;
  acknowledge(input: {
    installationId: string;
    revision: number;
  }): { transferred: boolean };
}

export function createThreadStageMigrationSource(
  database: Database,
): ThreadStageMigrationSource {
  const getMigrationMeta = database.prepare(`
    SELECT source_schema, installation_id, revision, placement_owner
    FROM thread_stage_migration_meta
    WHERE singleton = 1
  `);
  const listPlacements = database.prepare(`
    SELECT organization.thread_id, organization.status, organization.sort_key,
      organization.updated_at, organization.moved_by,
      organization.previous_status, entry.entered_at
    FROM thread_organization AS organization
    JOIN thread_stage_entry AS entry ON entry.thread_id = organization.thread_id
    WHERE organization.sort_key IS NOT NULL
    ORDER BY
      CASE organization.status
        WHEN 'Deferred' THEN 0
        WHEN 'Idle' THEN 1
        WHEN 'Active' THEN 2
        WHEN 'Blocked' THEN 3
        WHEN 'Completed' THEN 4
      END,
      organization.sort_key,
      organization.thread_id
  `);
  const listOrders = database.prepare(`
    SELECT thread_id, status, sort_key, updated_at
    FROM thread_stage_order
    ORDER BY thread_id,
      CASE status
        WHEN 'Deferred' THEN 0
        WHEN 'Idle' THEN 1
        WHEN 'Active' THEN 2
        WHEN 'Blocked' THEN 3
        WHEN 'Completed' THEN 4
      END
  `);
  const transferOwnership = database.prepare(`
    UPDATE thread_stage_migration_meta
    SET placement_owner = 'ribbon-sidebar'
    WHERE singleton = 1
      AND placement_owner = 'thread-stages'
      AND installation_id = ?
      AND revision = ?
  `);

  function meta(): MigrationMetaRow {
    const row = getMigrationMeta.get() as MigrationMetaRow | undefined;
    if (!row) throw new Error("Thread stages migration metadata is missing.");
    return row;
  }

  return {
    snapshot() {
      const metadata = meta();
      const ordersByThread = new Map<
        string,
        PlacementMigrationSnapshotV1["placements"][number]["orders"]
      >();
      for (const row of listOrders.all() as RetainedOrderRow[]) {
        const orders = ordersByThread.get(row.thread_id) ?? [];
        orders.push({
          groupId: row.status,
          sortKey: row.sort_key,
          updatedAtMs: row.updated_at,
        });
        ordersByThread.set(row.thread_id, orders);
      }
      return {
        sourcePluginId: "thread-stages",
        sourceSchema: metadata.source_schema,
        installationId: metadata.installation_id,
        revision: metadata.revision,
        placements: (listPlacements.all() as MigrationPlacementRow[]).map(
          (row) => ({
            groupingId: "stages",
            threadId: row.thread_id,
            groupId: row.status,
            enteredAtMs: row.entered_at,
            updatedAtMs: row.updated_at,
            ...(row.previous_status === null
              ? {}
              : { previousGroupId: row.previous_status }),
            origin:
              row.moved_by === "app"
                ? "ui"
                : row.moved_by === "cli"
                  ? "cli"
                  : "auto",
            orders: ordersByThread.get(row.thread_id) ?? [],
          }),
        ),
      };
    },
    acknowledge({ installationId, revision }) {
      return database
        .transaction(() => {
          const metadata = meta();
          if (
            metadata.installation_id !== installationId ||
            metadata.revision !== revision
          ) {
            return { transferred: false };
          }
          if (metadata.placement_owner === "ribbon-sidebar") {
            return { transferred: true };
          }
          return {
            transferred:
              transferOwnership.run(installationId, revision).changes === 1,
          };
        })
        .immediate();
    },
  };
}
