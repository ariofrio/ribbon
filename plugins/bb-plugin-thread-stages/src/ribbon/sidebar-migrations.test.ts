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
      expect(database.prepare("SELECT label, prompt FROM thread_action").all()).toEqual([
        { label: "Update", prompt: "Update this thread" },
      ]);
    }
    if (previous.includes(ICON_MIGRATIONS[1])) {
      expect(database.prepare("SELECT icon FROM icon WHERE owner_id = ?").get("section-a")).toEqual({
        icon: "rocket",
      });
    }
  });
});
