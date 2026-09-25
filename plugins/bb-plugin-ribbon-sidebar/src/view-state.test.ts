// @vitest-environment jsdom
import { beforeEach, expect, it } from "vitest";
import {
  loadSidebarPreferences,
  saveSidebarPreferences,
  SIDEBAR_PREFERENCES_KEY,
} from "./view-state";
beforeEach(() => localStorage.clear());
it("migrates page choices to all sections and preserves unrelated display preferences", () => {
  localStorage.setItem(
    SIDEBAR_PREFERENCES_KEY,
    JSON.stringify({
      view: {
        scope: {
          kind: "group",
          group: { groupingKey: "builtin:sections", groupId: "work" },
        },
        groupingKey: "plugin:thread-stages:stages",
        iconGroupingKey: null,
        sort: "updated",
        hide: {
          archived: false,
          hidden: true,
          visible: false,
          notArchived: false,
        },
        pullRequestNumberPosition: "left",
      },
      collapsed: ["builtin:sections/work", "builtin:pinned"],
    }),
  );
  const result = loadSidebarPreferences(localStorage, []);
  expect(result.view).toMatchObject({
    scope: { kind: "all" },
    groupingKey: "builtin:sections",
    filterGroupingKey: null,
    iconGroupingKey: "plugin:thread-stages:stages",
    sort: "manual",
    hide: { archived: false },
    pullRequestNumberPosition: "left",
  });
  expect([...result.collapsed]).toEqual([
    "builtin:sections/work",
    "builtin:pinned",
  ]);
  saveSidebarPreferences(localStorage, result);
  expect(loadSidebarPreferences(localStorage, [])).toEqual(result);
});
it("starts with every section open and keeps the legacy Pinned collapse preference", () => {
  expect(loadSidebarPreferences(localStorage, []).collapsed.size).toBe(0);
  localStorage.clear();
  localStorage.setItem(
    "bb.plugin.workflow-stage.collapsedStatuses",
    '["Pinned"]',
  );
  expect(
    loadSidebarPreferences(localStorage, []).collapsed.has("builtin:pinned"),
  ).toBe(true);
});
it("uses the fixed layout if local storage cannot be read or written", () => {
  const storage = {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
  } as unknown as Storage;
  expect(loadSidebarPreferences(storage, []).view.sort).toBe("manual");
});

it("persists project grouping independently of section collapse state", () => {
  const preferences = loadSidebarPreferences(localStorage, []);
  preferences.view.groupingKey = "builtin:projects";
  preferences.collapsed.add("builtin:sections/work");
  saveSidebarPreferences(localStorage, preferences);
  expect(loadSidebarPreferences(localStorage, []).view.groupingKey).toBe(
    "builtin:projects",
  );
  expect(
    loadSidebarPreferences(localStorage, []).collapsed.has(
      "builtin:sections/work",
    ),
  ).toBe(true);
});
