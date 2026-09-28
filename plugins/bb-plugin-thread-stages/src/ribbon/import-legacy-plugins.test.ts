import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { ICON_MIGRATIONS } from "../icons/store";
import {
  importIcons,
  importRibbonSidebar,
  legacyDatabasePath,
} from "./import-legacy-plugins";
import {
  LEGACY_FIRST_STATEMENT_HASH,
  hasLegacyMigrationHistory,
  reclaimLegacyDatabase,
} from "./legacy-database";
import { RIBBON_SIDEBAR_MIGRATIONS } from "./placement-store";
import { sidebarMigrations } from "./sidebar-migrations";

const open: Database.Database[] = [];
afterEach(() => {
  for (const database of open.splice(0)) database.close();
});

/** A bb plugin data directory layout: <root>/<plugin id>/data.db. */
function pluginDatabase(root: string, pluginId: string) {
  mkdirSync(join(root, pluginId), { recursive: true });
  const database = new Database(join(root, pluginId, "data.db"));
  open.push(database);
  return database;
}

function applyAll(database: Database.Database, statements: readonly string[]) {
  for (const statement of statements) database.exec(statement);
}

describe("reclaiming the retired Thread stages database", () => {
  it("forgets a migration history that starts with the retired plugin's first statement", () => {
    const database = pluginDatabase(mkdtempSync(join(tmpdir(), "stages-")), "thread-stages");
    database.exec(
      "CREATE TABLE _bb_migrations (id INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL, statement_hash TEXT)",
    );
    database
      .prepare("INSERT INTO _bb_migrations VALUES (0, 1, ?), (1, 1, 'other')")
      .run(LEGACY_FIRST_STATEMENT_HASH);
    database.exec("CREATE TABLE thread_organization (thread_id TEXT PRIMARY KEY)");

    expect(hasLegacyMigrationHistory(database)).toBe(true);
    expect(reclaimLegacyDatabase(database)).toBe(true);
    expect(database.prepare("SELECT count(*) AS n FROM _bb_migrations").get()).toEqual({ n: 0 });
    // The retired tables are left alone; only the history stood in the way.
    expect(
      database.prepare("SELECT name FROM sqlite_master WHERE name = 'thread_organization'").get(),
    ).toBeDefined();
    expect(reclaimLegacyDatabase(database)).toBe(false);
  });

  it("leaves a fresh database, and one with this plugin's own history, alone", () => {
    const fresh = pluginDatabase(mkdtempSync(join(tmpdir(), "stages-")), "thread-stages");
    expect(reclaimLegacyDatabase(fresh)).toBe(false);

    const own = pluginDatabase(mkdtempSync(join(tmpdir(), "stages-")), "thread-stages");
    own.exec(
      "CREATE TABLE _bb_migrations (id INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL, statement_hash TEXT)",
    );
    own.prepare("INSERT INTO _bb_migrations VALUES (0, 1, 'ribbon')").run();
    expect(reclaimLegacyDatabase(own)).toBe(false);
    expect(own.prepare("SELECT count(*) AS n FROM _bb_migrations").get()).toEqual({ n: 1 });
  });
});

describe("importing the Ribbon sidebar and Icons databases", () => {
  it("copies placements, order, actions, child order, and icons from the sibling databases, once", () => {
    const root = mkdtempSync(join(tmpdir(), "plugins-"));
    const ours = pluginDatabase(root, "thread-stages");
    applyAll(ours, [...sidebarMigrations(ours), ...ICON_MIGRATIONS]);
    expect(legacyDatabasePath(ours, "ribbon-sidebar")).toBe(
      join(root, "thread-stages", "..", "ribbon-sidebar", "data.db"),
    );

    const ribbon = pluginDatabase(root, "ribbon-sidebar");
    applyAll(ribbon, sidebarMigrations(ribbon));
    ribbon.exec(`
      INSERT INTO eligible_root VALUES ('thread-a', 0), ('thread-b', 1);
      INSERT INTO grouping_revision VALUES ('builtin:sections', 4), ('plugin:thread-stages:stages', 9);
      INSERT INTO group_assignment VALUES
        ('plugin:thread-stages:stages', 'thread-a', 'Blocked', 200, 'Idle', 'ui'),
        ('builtin:sections', 'thread-a', 'unsectioned', 0, NULL, 'auto');
      INSERT INTO group_order VALUES
        ('builtin:sections', 'unsectioned', 'thread-a', 'A', 1),
        ('builtin:sections', 'section-old', 'thread-a', 'B', 1);
      INSERT INTO child_order VALUES ('thread-child', 'thread-a', 0);
      INSERT INTO thread_action VALUES ('thread-a', 'review', 'Review', 'Review this.', 0);
      INSERT INTO thread_action_display VALUES ('thread-a', 1);
    `);
    const icons = pluginDatabase(root, "icons");
    applyAll(icons, ICON_MIGRATIONS);
    icons.exec("INSERT INTO icon VALUES ('section', 'section-a', 'rocket', 'teal', 1)");

    // A move this plugin already recorded is not overwritten by the copy.
    ours.exec(
      "INSERT INTO group_assignment VALUES ('builtin:sections', 'thread-a', 'section-new', 0, NULL, 'ui')",
    );

    expect(importRibbonSidebar(ours)).toBe(10);
    expect(importIcons(ours)).toBe(1);

    expect(
      ours.prepare("SELECT group_id FROM group_assignment WHERE grouping_key = 'builtin:sections'").all(),
    ).toEqual([{ group_id: "section-new" }]);
    expect(
      ours.prepare("SELECT group_id FROM group_assignment WHERE grouping_key = 'plugin:thread-stages:stages'").all(),
    ).toEqual([{ group_id: "Blocked" }]);
    // The rank retained in a group the thread left came along.
    expect(ours.prepare("SELECT group_id FROM group_order ORDER BY sort_key").all()).toEqual([
      { group_id: "unsectioned" },
      { group_id: "section-old" },
    ]);
    expect(ours.prepare("SELECT thread_id FROM child_order").all()).toEqual([{ thread_id: "thread-child" }]);
    expect(ours.prepare("SELECT label FROM thread_action").all()).toEqual([{ label: "Review" }]);
    expect(ours.prepare("SELECT icon, color FROM icon").all()).toEqual([{ icon: "rocket", color: "teal" }]);

    // Once: a second run copies nothing, even after the source changes.
    ribbon.exec("INSERT INTO eligible_root VALUES ('thread-c', 2)");
    expect(importRibbonSidebar(ours)).toBeNull();
    expect(importIcons(ours)).toBeNull();
    expect(ours.prepare("SELECT count(*) AS n FROM eligible_root").get()).toEqual({ n: 2 });
    // The attached database is released either way.
    expect(ours.prepare("PRAGMA database_list").all()).toHaveLength(1);
  });

  it("does nothing, and stays importable, while the sibling database is absent", () => {
    const root = mkdtempSync(join(tmpdir(), "plugins-"));
    const ours = pluginDatabase(root, "thread-stages");
    applyAll(ours, RIBBON_SIDEBAR_MIGRATIONS);
    expect(importRibbonSidebar(ours)).toBeNull();
    expect(ours.prepare("SELECT key FROM ribbon_upgrade").all()).toEqual([]);
  });
});
