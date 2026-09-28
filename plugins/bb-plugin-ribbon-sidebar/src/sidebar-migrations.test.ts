import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { describe, expect, it } from "vitest";
import { RIBBON_SIDEBAR_MIGRATIONS } from "./placement-store";
import { THREAD_PREVIEW_SOURCE_MIGRATION } from "./preview-store";
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
      name: "an installed action-button preview",
      previous: [
        ...RIBBON_SIDEBAR_MIGRATIONS.slice(0, 4),
        THREAD_ACTIONS_MIGRATION,
        THREAD_ACTIONS_DISPLAY_MIGRATION,
      ],
    },
    {
      name: "timeline-derived previews",
      previous: [
        ...RIBBON_SIDEBAR_MIGRATIONS,
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
        .prepare("SELECT name FROM sqlite_master WHERE name IN ('child_order', 'thread_action', 'thread_action_display') ORDER BY name")
        .all(),
    ).toEqual([
      { name: "child_order" },
      { name: "thread_action" },
      { name: "thread_action_display" },
    ]);
    expect(sidebarMigrations(database).at(-1)).toBe(THREAD_PREVIEW_SOURCE_MIGRATION);
    expect(
      database.prepare("SELECT name FROM pragma_table_info('thread_preview') WHERE name = 'source_seq'").all(),
    ).toEqual([{ name: "source_seq" }]);
    if (previous.includes(THREAD_ACTIONS_MIGRATION)) {
      expect(database.prepare("SELECT label, prompt FROM thread_action").all()).toEqual([
        { label: "Update", prompt: "Update this thread" },
      ]);
    }
  });
});
