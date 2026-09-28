import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import type BetterSqlite3 from "better-sqlite3";
import { RETIRED_STAGE_RENAME } from "./placement-store";

/**
 * Ribbon sidebar and Icons kept this plugin's data before it absorbed them,
 * each in its own bb plugin database beside this one. bb stores every
 * plugin's database at the same relative place, so a sibling's is one path
 * away; copying its tables in whole keeps every rank a thread retained in a
 * group it since left, which no RPC of the old plugins ever exposed.
 *
 * Each import runs once, recorded in ribbon_upgrade, and only while the old
 * database is present. A sidebar row this plugin already wrote wins over the
 * copy, so a fresh install that ran before the import never loses a move.
 */

/** Tables Ribbon sidebar wrote that this plugin reads unchanged. */
const RIBBON_SIDEBAR_TABLES = [
  "eligible_root",
  "eligible_child",
  "grouping_revision",
  "group_assignment",
  "group_order",
  "child_order",
  "thread_action",
  "thread_action_display",
] as const;

const ICONS_TABLES = ["icon"] as const;

export function legacyDatabasePath(
  database: BetterSqlite3.Database,
  pluginId: string,
): string {
  return join(dirname(database.name), "..", pluginId, "data.db");
}

function alreadyImported(
  database: BetterSqlite3.Database,
  key: string,
): boolean {
  return (
    database
      .prepare("SELECT key FROM ribbon_upgrade WHERE key = ?")
      .get(key) !== undefined
  );
}

/**
 * Copies `tables` from the database at `sourcePath` into `database`, once.
 * Returns the number of rows copied, or null when nothing ran: the import
 * already happened, or there is no database to import from.
 */
export function importLegacyDatabase(
  database: BetterSqlite3.Database,
  {
    key,
    sourcePath,
    tables,
  }: { key: string; sourcePath: string; tables: readonly string[] },
): number | null {
  if (alreadyImported(database, key)) return null;
  if (!existsSync(sourcePath)) return null;
  database.prepare("ATTACH DATABASE ? AS legacy").run(sourcePath);
  try {
    const present = new Set(
      (
        database
          .prepare("SELECT name FROM legacy.sqlite_master WHERE type = 'table'")
          .all() as Array<{ name: string }>
      ).map(({ name }) => name),
    );
    const copy = database.transaction(() => {
      let copied = 0;
      for (const table of tables) {
        if (!present.has(table)) continue;
        copied += database
          .prepare(`INSERT OR IGNORE INTO main.${table} SELECT * FROM legacy.${table}`)
          .run().changes;
      }
      database
        .prepare("INSERT OR IGNORE INTO ribbon_upgrade(key) VALUES (?)")
        .run(key);
      return copied;
    });
    return copy();
  } finally {
    database.prepare("DETACH DATABASE legacy").run();
  }
}

export function importRibbonSidebar(
  database: BetterSqlite3.Database,
  sourcePath = legacyDatabasePath(database, "ribbon-sidebar"),
): number | null {
  const copied = importLegacyDatabase(database, {
    key: "imported-ribbon-sidebar",
    sourcePath,
    tables: RIBBON_SIDEBAR_TABLES,
  });
  // A Ribbon sidebar from before the rename still says Idle and Blocked.
  if (copied !== null) database.exec(RETIRED_STAGE_RENAME);
  return copied;
}

export function importIcons(
  database: BetterSqlite3.Database,
  sourcePath = legacyDatabasePath(database, "icons"),
): number | null {
  return importLegacyDatabase(database, {
    key: "imported-icons",
    sourcePath,
    tables: ICONS_TABLES,
  });
}
