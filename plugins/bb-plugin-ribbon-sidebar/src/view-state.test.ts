import { describe, expect, it } from "vitest";
import { loadSidebarPreferences } from "./view-state";

function storage(entries: Record<string, string> = {}): Storage {
  const values = new Map(Object.entries(entries));
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => void values.delete(key),
    setItem: (key, value) => void values.set(key, value),
  };
}

describe("client-local sidebar preferences", () => {
  it("starts fresh without importing legacy Thread stages preferences", () => {
    const local = storage({
      "bb.plugin.thread-stages.threadFilter": "section:release",
      "bb.plugin.workflow-stage.collapsedStatuses": JSON.stringify([
        "Deferred",
        "Active",
      ]),
    });
    expect(loadSidebarPreferences(local, [
      "builtin:projects",
      "builtin:sections",
      "plugin:thread-stages:stages",
    ])).toEqual({
      view: {
        scope: { kind: "all" },
        groupingKey: "plugin:thread-stages:stages",
      },
      collapsed: new Set(),
    });
  });

  it("recovers an unavailable saved grouping and preserves orphan scope", () => {
    const local = storage({
      "bb.plugin.ribbon-sidebar.preferences.v1": JSON.stringify({
        view: {
          scope: {
            kind: "group",
            group: {
              groupingKey: "plugin:removed:status",
              groupId: "Waiting",
            },
          },
          groupingKey: "plugin:removed:status",
        },
        collapsed: ["plugin:removed:status/Waiting"],
      }),
    });
    expect(loadSidebarPreferences(local, ["builtin:projects"])).toEqual({
      view: {
        scope: {
          kind: "group",
          group: {
            groupingKey: "plugin:removed:status",
            groupId: "Waiting",
          },
        },
        groupingKey: "builtin:projects",
      },
      collapsed: new Set(["plugin:removed:status/Waiting"]),
    });
  });
});
