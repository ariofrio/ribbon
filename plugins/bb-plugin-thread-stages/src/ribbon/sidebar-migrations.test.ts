import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { describe, expect, it } from "vitest";
import { ICON_MIGRATIONS } from "../icons/store";
import { MAIN_STAGE_ORDER_MIGRATION, RIBBON_SIDEBAR_MIGRATIONS } from "./placement-store";
import { OBSERVED_MEMBERSHIP_MIGRATION, pluginMigrations } from "./sidebar-migrations";
import {
  THREAD_ACTIONS_DISPLAY_MIGRATION,
  THREAD_ACTIONS_MIGRATION,
} from "./thread-actions-store";

describe("sidebar migrations", () => {
  it.each([
    { name: "a new installation", previous: [] },
    { name: "main with child ordering", previous: RIBBON_SIDEBAR_MIGRATIONS },
    {
      name: "main with thread actions",
      previous: [...RIBBON_SIDEBAR_MIGRATIONS, THREAD_ACTIONS_MIGRATION, THREAD_ACTIONS_DISPLAY_MIGRATION],
    },
    {
      name: "main with thread actions and icons",
      previous: [
        ...RIBBON_SIDEBAR_MIGRATIONS,
        THREAD_ACTIONS_MIGRATION,
        THREAD_ACTIONS_DISPLAY_MIGRATION,
        ...ICON_MIGRATIONS,
      ],
    },
    {
      name: "an existing install with icons before stage order",
      previous: [
        ...RIBBON_SIDEBAR_MIGRATIONS,
        THREAD_ACTIONS_MIGRATION,
        THREAD_ACTIONS_DISPLAY_MIGRATION,
        ...ICON_MIGRATIONS,
        MAIN_STAGE_ORDER_MIGRATION,
      ],
    },
    {
      name: "bb 0.45 with stage order before icons",
      previous: [
        ...RIBBON_SIDEBAR_MIGRATIONS,
        THREAD_ACTIONS_MIGRATION,
        THREAD_ACTIONS_DISPLAY_MIGRATION,
        MAIN_STAGE_ORDER_MIGRATION,
        ...ICON_MIGRATIONS,
      ],
    },
    {
      name: "main with observed membership before icons",
      previous: [
        ...RIBBON_SIDEBAR_MIGRATIONS,
        THREAD_ACTIONS_MIGRATION,
        THREAD_ACTIONS_DISPLAY_MIGRATION,
        MAIN_STAGE_ORDER_MIGRATION,
        OBSERVED_MEMBERSHIP_MIGRATION,
        ...ICON_MIGRATIONS,
      ],
    },
    {
      name: "an installed action-button preview",
      previous: [
        ...RIBBON_SIDEBAR_MIGRATIONS.slice(0, 4),
        THREAD_ACTIONS_MIGRATION,
        THREAD_ACTIONS_DISPLAY_MIGRATION,
      ],
    },
  ])("upgrades $name without changing recorded migrations", ({ previous }) => {
    const { bb } = createFakePluginHost();
    const database = bb.storage.database();
    if (previous.length) bb.storage.migrate(database, previous);
    if (previous.includes(THREAD_ACTIONS_MIGRATION)) {
      database
        .prepare("INSERT INTO thread_action VALUES (?, ?, ?, ?, ?)")
        .run("thread-a", "action-a", "Update", "Update this thread", 0);
    }
    if (previous.includes(ICON_MIGRATIONS[1])) {
      database
        .prepare("INSERT INTO icon VALUES (?, ?, ?, ?, ?)")
        .run("section", "section-a", "rocket", "teal", 1);
    }

    bb.storage.migrate(database, pluginMigrations(database));
    bb.storage.migrate(database, pluginMigrations(database));

    expect(
      database
        .prepare("SELECT name FROM sqlite_master WHERE name IN ('child_order', 'main_stage_order', 'observed_membership', 'thread_action', 'thread_action_display') ORDER BY name")
        .all(),
    ).toEqual([
      { name: "child_order" },
      { name: "main_stage_order" },
      { name: "observed_membership" },
      { name: "thread_action" },
      { name: "thread_action_display" },
    ]);
    if (previous.includes(THREAD_ACTIONS_MIGRATION)) {
      expect(database.prepare("SELECT label, prompt, steer FROM thread_action").all()).toEqual([
        { label: "Update", prompt: "Update this thread", steer: 0 },
      ]);
    }
    if (previous.includes(ICON_MIGRATIONS[1])) {
      expect(database.prepare("SELECT icon FROM icon WHERE owner_id = ?").get("section-a")).toEqual({
        icon: "rocket",
      });
    }
  });
});


it("folds Waiting into Active without losing orders, history, or unrelated group IDs", () => {
  const { bb } = createFakePluginHost();
  const database = bb.storage.database();
  const migrations = pluginMigrations(database);
  // Simulate the last seven-stage release, before the appended migration.
  bb.storage.migrate(database, migrations.slice(0, -1));
  database.exec(`
    INSERT INTO group_assignment VALUES
      ('plugin:thread-stages:stages', 'waiting', 'Waiting', 123, 'Waiting', 'ui'),
      ('plugin:thread-stages:stages', 'active', 'Active', 456, NULL, 'cli');
    INSERT INTO group_order VALUES
      ('plugin:thread-stages:stages', 'Active', 'active', 'a0', 1),
      ('plugin:thread-stages:stages', 'Waiting', 'active', 'Zz', 0),
      ('plugin:thread-stages:stages', 'Waiting', 'waiting', 'a0', 2),
      ('plugin:thread-stages:stages', 'Active', 'waiting', 'Zz', 0),
      ('builtin:sections', 'Waiting', 'unrelated', 'a0', 3);
    INSERT INTO main_stage_order VALUES
      ('builtin:sections', 'section', 'active', 'Active', 'a0'),
      ('builtin:sections', 'section', 'active', 'Waiting', 'Zz'),
      ('builtin:sections', 'section', 'waiting', 'Active', 'Zz'),
      ('builtin:sections', 'section', 'waiting', 'Waiting', 'a0');
  `);
  bb.storage.migrate(database, pluginMigrations(database));
  bb.storage.migrate(database, pluginMigrations(database));
  expect(database.prepare("SELECT thread_id, group_id, previous_group_id, entered_at_ms, origin FROM group_assignment ORDER BY thread_id").all()).toEqual([
    { thread_id: "active", group_id: "Active", previous_group_id: null, entered_at_ms: 456, origin: "cli" },
    { thread_id: "waiting", group_id: "Active", previous_group_id: "Active", entered_at_ms: 123, origin: "ui" },
  ]);
  expect(database.prepare("SELECT thread_id FROM group_order WHERE grouping_key = 'plugin:thread-stages:stages' AND group_id = 'Active' ORDER BY sort_key, thread_id").all()).toEqual([
    { thread_id: "active" }, { thread_id: "waiting" },
  ]);
  expect(database.prepare("SELECT thread_id, stage_id FROM main_stage_order ORDER BY sort_key, thread_id").all()).toEqual([
    { thread_id: "active", stage_id: "Active" }, { thread_id: "waiting", stage_id: "Active" },
  ]);
  expect(database.prepare("SELECT group_id FROM group_order WHERE thread_id = 'unrelated'").get()).toEqual({ group_id: "Waiting" });
});
