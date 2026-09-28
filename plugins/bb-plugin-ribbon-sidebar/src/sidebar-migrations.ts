import { createHash } from "node:crypto";
import type BetterSqlite3 from "better-sqlite3";
import { RIBBON_SIDEBAR_MIGRATIONS } from "./placement-store";
import { THREAD_PREVIEW_SOURCE_MIGRATION } from "./preview-store";
import {
  THREAD_ACTIONS_DISPLAY_MIGRATION,
  THREAD_ACTIONS_MIGRATION,
} from "./thread-actions-store";

export function sidebarMigrations(database: BetterSqlite3.Database): string[] {
  const migrationTable = database
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = '_bb_migrations'")
    .get();
  const fifthMigration = migrationTable
    ? (database
        .prepare("SELECT statement_hash FROM _bb_migrations WHERE id = 4")
        .get() as { statement_hash: string | null } | undefined)
    : undefined;
  const actionsHash = createHash("sha256")
    .update(THREAD_ACTIONS_MIGRATION)
    .digest("hex");

  // Action-button previews recorded their migration before child ordering landed on main.
  if (fifthMigration?.statement_hash === actionsHash) {
    return [
      ...RIBBON_SIDEBAR_MIGRATIONS.slice(0, 4),
      THREAD_ACTIONS_MIGRATION,
      THREAD_ACTIONS_DISPLAY_MIGRATION,
      ...RIBBON_SIDEBAR_MIGRATIONS.slice(4),
      THREAD_PREVIEW_SOURCE_MIGRATION,
    ];
  }
  return [
    ...RIBBON_SIDEBAR_MIGRATIONS,
    THREAD_ACTIONS_MIGRATION,
    THREAD_ACTIONS_DISPLAY_MIGRATION,
    THREAD_PREVIEW_SOURCE_MIGRATION,
  ];
}
