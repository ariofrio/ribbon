// @vitest-environment jsdom
import { beforeEach, expect, it } from "vitest";
import {
  LEGACY_SIDEBAR_PREFERENCES_KEY,
  SIDEBAR_PREFERENCES_KEY,
  loadSidebarPreferences,
  saveSidebarPreferences,
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
  const result = loadSidebarPreferences(localStorage);
  expect(result.view).toMatchObject({
    scope: { kind: "all" },
    groupingKey: "builtin:sections",
    filterGroupingKey: null,
    iconGroupingKey: "plugin:thread-stages:stages",
    sort: "manual",
    hide: { archived: false },
    // Ribbon's left placement is the right one now.
    pullRequestNumberPosition: "right",
  });
  expect([...result.collapsed]).toEqual([
    "builtin:sections/work",
    "builtin:pinned",
  ]);
  saveSidebarPreferences(localStorage, result);
  expect(loadSidebarPreferences(localStorage)).toEqual(result);
});
it("starts with every section open and keeps the legacy Pinned collapse preference", () => {
  expect(loadSidebarPreferences(localStorage).collapsed.size).toBe(0);
  localStorage.clear();
  localStorage.setItem(
    "bb.plugin.workflow-stage.collapsedStatuses",
    '["Pinned"]',
  );
  expect(
    loadSidebarPreferences(localStorage).collapsed.has("builtin:pinned"),
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
  expect(loadSidebarPreferences(storage).view.sort).toBe("manual");
});

it("persists project grouping independently of section collapse state", () => {
  const preferences = loadSidebarPreferences(localStorage);
  preferences.view.groupingKey = "builtin:projects";
  preferences.collapsed.add("builtin:sections/work");
  saveSidebarPreferences(localStorage, preferences);
  expect(loadSidebarPreferences(localStorage).view.groupingKey).toBe(
    "builtin:projects",
  );
  expect(
    loadSidebarPreferences(localStorage).collapsed.has(
      "builtin:sections/work",
    ),
  ).toBe(true);
});

it("shows the PR number unless hidden, reading Ribbon's left placement as right", () => {
  localStorage.setItem(
    SIDEBAR_PREFERENCES_KEY,
    JSON.stringify({
      view: { scope: { kind: "all" }, groupingKey: null, pullRequestNumberPosition: "left" },
      collapsed: [],
    }),
  );
  expect(loadSidebarPreferences(localStorage).view.pullRequestNumberPosition).toBe("right");
  const preferences = loadSidebarPreferences(localStorage);
  preferences.view.pullRequestNumberPosition = "hidden";
  saveSidebarPreferences(localStorage, preferences);
  expect(loadSidebarPreferences(localStorage).view.pullRequestNumberPosition).toBe("hidden");
});

it("keeps what this client chose in Ribbon sidebar until it chooses here", () => {
  localStorage.clear();
  localStorage.setItem(
    LEGACY_SIDEBAR_PREFERENCES_KEY,
    JSON.stringify({
      view: {
        scope: { kind: "all" },
        groupingKey: "builtin:projects",
        pullRequestNumberPosition: "hidden",
        hide: { notArchived: false, archived: false, visible: false, hidden: true },
      },
      collapsed: ["builtin:projects/proj_a"],
    }),
  );
  const preferences = loadSidebarPreferences(localStorage);
  expect(preferences.view.groupingKey).toBe("builtin:projects");
  expect(preferences.view.pullRequestNumberPosition).toBe("hidden");
  expect(preferences.view.hide.archived).toBe(false);
  expect(preferences.collapsed.has("builtin:projects/proj_a")).toBe(true);
  // Saved under this plugin's key, which wins from now on.
  expect(localStorage.getItem(SIDEBAR_PREFERENCES_KEY)).not.toBeNull();
  localStorage.setItem(LEGACY_SIDEBAR_PREFERENCES_KEY, "garbage");
  expect(loadSidebarPreferences(localStorage).view.groupingKey).toBe("builtin:projects");
});
