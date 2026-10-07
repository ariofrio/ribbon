import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { describe, expect, it } from "vitest";
import { RIBBON_SIDEBAR_MIGRATIONS } from "./placement-store";
import { sidebarMigrations } from "./sidebar-migrations";
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

    bb.storage.migrate(database, sidebarMigrations(database));
    bb.storage.migrate(database, sidebarMigrations(database));

    expect(
      database
        .prepare("SELECT name FROM sqlite_master WHERE name IN ('child_order', 'main_stage_order', 'thread_action', 'thread_action_display') ORDER BY name")
        .all(),
    ).toEqual([
      { name: "child_order" },
      { name: "main_stage_order" },
      { name: "thread_action" },
      { name: "thread_action_display" },
    ]);
    if (previous.includes(THREAD_ACTIONS_MIGRATION)) {
      expect(database.prepare("SELECT label, prompt FROM thread_action").all()).toEqual([
        { label: "Update", prompt: "Update this thread" },
      ]);
    }
  });
});
