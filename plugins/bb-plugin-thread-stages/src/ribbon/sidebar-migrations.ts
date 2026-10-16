import { createHash } from "node:crypto";
import type BetterSqlite3 from "better-sqlite3";
import { ICON_MIGRATIONS } from "../icons/store";
import { MAIN_STAGE_ORDER_MIGRATION, RIBBON_SIDEBAR_MIGRATIONS } from "./placement-store";
import {
  THREAD_ACTIONS_DISPLAY_MIGRATION,
  THREAD_ACTIONS_MIGRATION,
  THREAD_ACTIONS_STEER_MIGRATION,
} from "./thread-actions-store";

export const OBSERVED_MEMBERSHIP_MIGRATION = `
  CREATE TABLE observed_membership (
    grouping_key TEXT NOT NULL,
    thread_id TEXT NOT NULL,
    group_id TEXT NOT NULL,
    is_root INTEGER NOT NULL,
    PRIMARY KEY (grouping_key, thread_id)
  );
`;

/** Keep existing ranks and history when the former Waiting stage joins Active. */
export const MERGE_WAITING_ASSIGNMENTS = `
  INSERT INTO group_order (grouping_key, group_id, thread_id, sort_key, updated_at_ms)
    SELECT grouping_key, 'Active', thread_id, sort_key, updated_at_ms FROM group_order
    WHERE grouping_key = 'plugin:thread-stages:stages' AND group_id = 'Waiting'
    ON CONFLICT (grouping_key, group_id, thread_id) DO UPDATE
      SET sort_key = excluded.sort_key, updated_at_ms = excluded.updated_at_ms
      WHERE EXISTS (SELECT 1 FROM group_assignment
        WHERE grouping_key = 'plugin:thread-stages:stages'
          AND thread_id = excluded.thread_id AND group_id = 'Waiting');
  DELETE FROM group_order
    WHERE grouping_key = 'plugin:thread-stages:stages' AND group_id = 'Waiting';
  UPDATE group_assignment SET group_id = 'Active'
    WHERE grouping_key = 'plugin:thread-stages:stages' AND group_id = 'Waiting';
  UPDATE group_assignment SET previous_group_id = 'Active'
    WHERE grouping_key = 'plugin:thread-stages:stages' AND previous_group_id = 'Waiting';
  UPDATE grouping_revision SET revision = revision + 1
    WHERE grouping_key = 'plugin:thread-stages:stages';
`;

export const MERGE_WAITING_STAGE = `
  INSERT INTO main_stage_order (grouping_key, group_id, thread_id, stage_id, sort_key)
    SELECT grouping_key, group_id, thread_id, 'Active', sort_key FROM main_stage_order
    WHERE stage_id = 'Waiting'
    ON CONFLICT (grouping_key, group_id, thread_id, stage_id) DO UPDATE
      SET sort_key = excluded.sort_key
      WHERE EXISTS (SELECT 1 FROM group_assignment
        WHERE grouping_key = 'plugin:thread-stages:stages'
          AND thread_id = excluded.thread_id AND group_id = 'Waiting');
  DELETE FROM main_stage_order WHERE stage_id = 'Waiting';
` + MERGE_WAITING_ASSIGNMENTS;

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
    ];
  }
  return [
    ...RIBBON_SIDEBAR_MIGRATIONS,
    THREAD_ACTIONS_MIGRATION,
    THREAD_ACTIONS_DISPLAY_MIGRATION,
  ];
}

export function pluginMigrations(database: BetterSqlite3.Database): string[] {
  const sidebar = sidebarMigrations(database);
  const migrationTable = database
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = '_bb_migrations'")
    .get();
  const ninthMigration = migrationTable
    ? (database
        .prepare("SELECT statement_hash FROM _bb_migrations WHERE id = 9")
        .get() as { statement_hash: string | null } | undefined)
    : undefined;
  const stageOrderHash = createHash("sha256")
    .update(MAIN_STAGE_ORDER_MIGRATION)
    .digest("hex");

  // BB 0.45 briefly placed stage order before icons. Keep that recorded order
  // for installs that already ran it; older installs recorded icons first.
  if (ninthMigration?.statement_hash === stageOrderHash) {
    const tenthMigration = database
      .prepare("SELECT statement_hash FROM _bb_migrations WHERE id = 10")
      .get() as { statement_hash: string | null } | undefined;
    const membershipHash = createHash("sha256")
      .update(OBSERVED_MEMBERSHIP_MIGRATION)
      .digest("hex");
    if (tenthMigration?.statement_hash === membershipHash) {
      return [...sidebar, MAIN_STAGE_ORDER_MIGRATION, OBSERVED_MEMBERSHIP_MIGRATION, ...ICON_MIGRATIONS, THREAD_ACTIONS_STEER_MIGRATION, MERGE_WAITING_STAGE];
    }
    return [...sidebar, MAIN_STAGE_ORDER_MIGRATION, ...ICON_MIGRATIONS, OBSERVED_MEMBERSHIP_MIGRATION, THREAD_ACTIONS_STEER_MIGRATION, MERGE_WAITING_STAGE];
  }
  return [...sidebar, ...ICON_MIGRATIONS, MAIN_STAGE_ORDER_MIGRATION, OBSERVED_MEMBERSHIP_MIGRATION, THREAD_ACTIONS_STEER_MIGRATION, MERGE_WAITING_STAGE];
}
