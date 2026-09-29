import { createHash } from "node:crypto";
import type BetterSqlite3 from "better-sqlite3";

/**
 * The first statement the retired Thread stages plugin ever ran, verbatim.
 * bb keys a plugin's database by its id, so this plugin inherits that one,
 * along with a migration history whose hashes are not this schema's; the host
 * rejects a changed statement at a recorded index, so the history has to go
 * before Ribbon's schema can apply. The retired tables stay: Ribbon sidebar
 * imported their placements long ago, and bytes nobody reads cost nothing.
 */
const LEGACY_FIRST_STATEMENT = `
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
  `;

export const LEGACY_FIRST_STATEMENT_HASH = createHash("sha256")
  .update(LEGACY_FIRST_STATEMENT)
  .digest("hex");

/** Whether the database still carries the retired plugin's migration history. */
export function hasLegacyMigrationHistory(
  database: BetterSqlite3.Database,
): boolean {
  const table = database
    .prepare(
      "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = '_bb_migrations'",
    )
    .get();
  if (!table) return false;
  const first = database
    .prepare("SELECT statement_hash FROM _bb_migrations WHERE id = 0")
    .get() as { statement_hash: string | null } | undefined;
  return first?.statement_hash === LEGACY_FIRST_STATEMENT_HASH;
}

/**
 * Forgets the retired plugin's migration history so bb applies this plugin's
 * from index 0. Returns whether anything was forgotten.
 */
export function reclaimLegacyDatabase(
  database: BetterSqlite3.Database,
): boolean {
  if (!hasLegacyMigrationHistory(database)) return false;
  database.prepare("DELETE FROM _bb_migrations").run();
  return true;
}
