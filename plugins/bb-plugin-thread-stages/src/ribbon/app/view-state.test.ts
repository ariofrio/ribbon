// @vitest-environment jsdom
import { beforeEach, expect, it } from "vitest";
import {
  LEGACY_SIDEBAR_PREFERENCES_KEY,
  SIDEBAR_PREFERENCES_KEY,
  loadSidebarPreferences,
  saveSidebarPreferences,
} from "./view-state";
beforeEach(() => localStorage.clear());

it("reads only the PR number placement from a Ribbon-era record", () => {
  localStorage.setItem(
    SIDEBAR_PREFERENCES_KEY,
    JSON.stringify({
      view: {
        scope: { kind: "group", group: { groupingKey: "builtin:sections", groupId: "work" } },
        groupingKey: "plugin:thread-stages:stages",
        sort: "updated",
        pullRequestNumberPosition: "hidden",
      },
      collapsed: ["builtin:sections/work", "builtin:pinned"],
    }),
  );
  const result = loadSidebarPreferences(localStorage);
  expect(result).toEqual({ view: { pullRequestNumberPosition: "hidden" } });
  saveSidebarPreferences(localStorage, result);
  expect(loadSidebarPreferences(localStorage)).toEqual(result);
});

it("uses the defaults if local storage cannot be read or written", () => {
  const storage = {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
  } as unknown as Storage;
  expect(loadSidebarPreferences(storage).view.pullRequestNumberPosition).toBe("right");
});

it("shows the PR number unless hidden, reading Ribbon's left placement as right", () => {
  localStorage.setItem(
    SIDEBAR_PREFERENCES_KEY,
    JSON.stringify({ view: { pullRequestNumberPosition: "left" } }),
  );
  expect(loadSidebarPreferences(localStorage).view.pullRequestNumberPosition).toBe("right");
  const preferences = loadSidebarPreferences(localStorage);
  preferences.view.pullRequestNumberPosition = "hidden";
  saveSidebarPreferences(localStorage, preferences);
  expect(loadSidebarPreferences(localStorage).view.pullRequestNumberPosition).toBe("hidden");
});

it("keeps what this client chose in Ribbon sidebar until it chooses here", () => {
  localStorage.setItem(
    LEGACY_SIDEBAR_PREFERENCES_KEY,
    JSON.stringify({ view: { pullRequestNumberPosition: "hidden" }, collapsed: [] }),
  );
  expect(loadSidebarPreferences(localStorage).view.pullRequestNumberPosition).toBe("hidden");
  // Saved under this plugin's key, which wins from now on.
  expect(localStorage.getItem(SIDEBAR_PREFERENCES_KEY)).not.toBeNull();
  localStorage.setItem(LEGACY_SIDEBAR_PREFERENCES_KEY, "garbage");
  expect(loadSidebarPreferences(localStorage).view.pullRequestNumberPosition).toBe("hidden");
});
