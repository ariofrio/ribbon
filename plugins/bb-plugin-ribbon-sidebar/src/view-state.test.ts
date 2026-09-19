import { describe, expect, it } from "vitest";
import {
  changeSidebarGrouping,
  changeSidebarScope,
  loadSidebarPreferences,
  saveSidebarPreferences,
} from "./view-state";

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
  it("defaults PR numbers to the right and persists each placement", () => {
    const local = storage();
    const keys = ["builtin:projects", "builtin:sections"] as const;
    const preferences = loadSidebarPreferences(local, keys);
    expect(preferences.view.pullRequestNumberPosition).toBe("right");
    for (const pullRequestNumberPosition of ["left", "right", "hidden"] as const) {
      saveSidebarPreferences(local, {
        ...preferences,
        view: { ...preferences.view, pullRequestNumberPosition },
      });
      expect(loadSidebarPreferences(local, keys).view).toEqual({
        ...preferences.view,
        pullRequestNumberPosition,
      });
    }
  });

  it.each([undefined, null, "invalid", 42])(
    "defaults missing or invalid PR placement (%s) without losing other preferences",
    (pullRequestNumberPosition) => {
      const local = storage({
        "bb.plugin.ribbon-sidebar.preferences.v1": JSON.stringify({
          view: {
            scope: { kind: "all" },
            groupingKey: null,
            sort: "manual",
            pullRequestNumberPosition,
          },
          collapsed: ["builtin:pinned"],
        }),
      });
      const restored = loadSidebarPreferences(local, ["builtin:projects"]);
      expect(restored.view.pullRequestNumberPosition).toBe("right");
      expect(restored.view.sort).toBe("manual");
      expect(restored.collapsed).toEqual(new Set(["builtin:pinned"]));
    },
  );

  it("persists an independent icon grouping, including no icons", () => {
    const local = storage();
    const keys = [
      "builtin:projects",
      "builtin:sections",
      "plugin:thread-stages:stages",
    ] as const;
    const preferences = loadSidebarPreferences(local, keys);
    expect(preferences.view.iconGroupingKey).toBe("builtin:projects");
    for (const iconGroupingKey of [...keys, null]) {
      saveSidebarPreferences(local, {
        ...preferences,
        view: { ...preferences.view, iconGroupingKey },
      });
      const restored = loadSidebarPreferences(local, keys);
      expect(restored.view.iconGroupingKey).toBe(iconGroupingKey);
      expect(restored.view.groupingKey).toBe(preferences.view.groupingKey);
      expect(restored.view.filterGroupingKey).toBe(
        preferences.view.filterGroupingKey,
      );
    }
  });

  it("defaults to the requested pages, headings, hide, and sort view", () => {
    const preferences = loadSidebarPreferences(storage(), [
      "builtin:projects",
      "builtin:sections",
      "plugin:thread-stages:stages",
    ]);

    expect(preferences.view).toEqual({
      scope: { kind: "all" },
      groupingKey: "plugin:thread-stages:stages",
      filterGroupingKey: "builtin:sections",
      iconGroupingKey: "builtin:projects",
      pullRequestNumberPosition: "right" as const,
      hide: {
        notArchived: false,
        archived: true,
        visible: false,
        hidden: true,
      },
      sort: "updated",
    });
  });

  it("migrates the existing v1 view without changing its pages or headings", () => {
    const local = storage({
      "bb.plugin.ribbon-sidebar.preferences.v1": JSON.stringify({
        view: {
          scope: {
            kind: "group",
            group: { groupingKey: "builtin:projects", groupId: "atlas" },
          },
          groupingKey: "plugin:thread-stages:stages",
          filterGroupingKey: "builtin:projects",
          iconGroupingKey: "builtin:projects",
        },
        collapsed: ["plugin:thread-stages:stages/Idle"],
      }),
    });

    expect(
      loadSidebarPreferences(local, [
        "builtin:projects",
        "builtin:sections",
        "plugin:thread-stages:stages",
      ]),
    ).toEqual({
      view: {
        scope: {
          kind: "group",
          group: { groupingKey: "builtin:projects", groupId: "atlas" },
        },
        groupingKey: "plugin:thread-stages:stages",
        filterGroupingKey: "builtin:projects",
        iconGroupingKey: "builtin:projects",
        pullRequestNumberPosition: "right" as const,
        hide: {
          notArchived: false,
          archived: true,
          visible: false,
          hidden: true,
        },
        sort: "updated",
      },
      collapsed: new Set(["plugin:thread-stages:stages/Idle"]),
    });
  });

  it("defaults a never-selected filter grouping to Sections", () => {
    const local = storage({
      "bb.plugin.ribbon-sidebar.preferences.v1": JSON.stringify({
        view: { scope: { kind: "all" }, groupingKey: null },
        collapsed: [],
      }),
    });

    expect(
      loadSidebarPreferences(local, [
        "builtin:projects",
        "builtin:sections",
        "plugin:thread-stages:stages",
      ]).view.filterGroupingKey,
    ).toBe("builtin:sections");
  });

  it("keeps filter and display grouping dimensions distinct", () => {
    const groupedBySections = {
      scope: { kind: "all" as const },
      groupingKey: "builtin:sections" as const,
      filterGroupingKey: "builtin:sections" as const,
      iconGroupingKey: "builtin:projects" as const,
      pullRequestNumberPosition: "right" as const,
      hide: {
        notArchived: false,
        archived: true,
        visible: false,
        hidden: true,
      },
      sort: "updated" as const,
    };

    expect(
      changeSidebarScope(groupedBySections, {
        kind: "group",
        group: { groupingKey: "builtin:sections", groupId: "release" },
      }),
    ).toEqual({
      scope: {
        kind: "group",
        group: { groupingKey: "builtin:sections", groupId: "release" },
      },
      groupingKey: null,
      filterGroupingKey: "builtin:sections",
      iconGroupingKey: "builtin:projects",
      pullRequestNumberPosition: "right" as const,
      hide: {
        notArchived: false,
        archived: true,
        visible: false,
        hidden: true,
      },
      sort: "updated",
    });
    expect(
      changeSidebarGrouping(
        {
          scope: {
            kind: "group",
            group: { groupingKey: "builtin:sections", groupId: "release" },
          },
          groupingKey: "plugin:thread-stages:stages",
          filterGroupingKey: "builtin:sections",
          iconGroupingKey: "builtin:projects",
          pullRequestNumberPosition: "right" as const,
          hide: groupedBySections.hide,
          sort: groupedBySections.sort,
        },
        "builtin:sections",
      ),
    ).toEqual({
      scope: { kind: "all" },
      groupingKey: "builtin:sections",
      filterGroupingKey: "builtin:sections",
      iconGroupingKey: "builtin:projects",
      pullRequestNumberPosition: "right" as const,
      hide: groupedBySections.hide,
      sort: groupedBySections.sort,
    });
    expect(
      changeSidebarGrouping(groupedBySections, "builtin:sections"),
    ).toEqual({
      scope: { kind: "all" },
      groupingKey: null,
      filterGroupingKey: "builtin:sections",
      iconGroupingKey: "builtin:projects",
      pullRequestNumberPosition: "right" as const,
      hide: groupedBySections.hide,
      sort: groupedBySections.sort,
    });

    const filteredByProject = changeSidebarScope(groupedBySections, {
      kind: "group",
      group: { groupingKey: "builtin:projects", groupId: "storefront" },
    });
    expect(filteredByProject.filterGroupingKey).toBe("builtin:projects");
    expect(
      changeSidebarScope(filteredByProject, { kind: "all" })
        .filterGroupingKey,
    ).toBe("builtin:projects");
  });

  it("normalizes a previously stored matching filter and grouping to flat", () => {
    const local = storage({
      "bb.plugin.ribbon-sidebar.preferences.v1": JSON.stringify({
        view: {
          scope: {
            kind: "group",
            group: { groupingKey: "builtin:sections", groupId: "release" },
          },
          groupingKey: "builtin:sections",
        },
        collapsed: [],
      }),
    });

    expect(
      loadSidebarPreferences(local, [
        "builtin:sections",
        "plugin:thread-stages:stages",
      ]).view,
    ).toEqual({
      scope: {
        kind: "group",
        group: { groupingKey: "builtin:sections", groupId: "release" },
      },
      groupingKey: null,
      filterGroupingKey: "builtin:sections",
      iconGroupingKey: "builtin:projects",
      pullRequestNumberPosition: "right" as const,
      hide: {
        notArchived: false,
        archived: true,
        visible: false,
        hidden: true,
      },
      sort: "updated",
    });
  });

  it("migrates Thread stages scope, grouping, and collapsed stages once", () => {
    const local = storage({
      "bb.plugin.thread-stages.threadFilter": "section:release",
      "bb.plugin.workflow-stage.collapsedStatuses": JSON.stringify([
        "Pinned",
        "Deferred",
        "Active",
      ]),
    });
    const first = loadSidebarPreferences(local, [
      "builtin:projects",
      "builtin:sections",
      "plugin:thread-stages:stages",
    ]);
    expect(first).toEqual({
      view: {
        scope: {
          kind: "group",
          group: { groupingKey: "builtin:sections", groupId: "release" },
        },
        groupingKey: "plugin:thread-stages:stages",
        filterGroupingKey: "builtin:sections",
        iconGroupingKey: "builtin:projects",
        pullRequestNumberPosition: "right" as const,
        hide: {
          notArchived: false,
          archived: true,
          visible: false,
          hidden: true,
        },
        sort: "updated",
      },
      collapsed: new Set([
        "builtin:pinned",
        "plugin:thread-stages:stages/Deferred",
        "plugin:thread-stages:stages/Active",
      ]),
    });

    local.setItem("bb.plugin.thread-stages.threadFilter", "project:changed");
    expect(
      loadSidebarPreferences(local, [
        "builtin:projects",
        "plugin:thread-stages:stages",
      ]),
    ).toEqual(first);
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
        filterGroupingKey: "builtin:projects",
        iconGroupingKey: "builtin:projects",
        pullRequestNumberPosition: "right" as const,
        hide: {
          notArchived: false,
          archived: true,
          visible: false,
          hidden: true,
        },
        sort: "updated",
      },
      collapsed: new Set(["plugin:removed:status/Waiting"]),
    });
  });

  it("uses provider collapse defaults only when no prior collapse choice exists", () => {
    const defaults = [
      "plugin:thread-stages:stages/Deferred",
      "plugin:thread-stages:stages/Completed",
    ];
    expect(
      loadSidebarPreferences(
        storage(),
        ["plugin:thread-stages:stages"],
        defaults,
      ).collapsed,
    ).toEqual(new Set(defaults));
    expect(
      loadSidebarPreferences(
        storage({
          "bb.plugin.workflow-stage.collapsedStatuses": "[]",
        }),
        ["plugin:thread-stages:stages"],
        defaults,
      ).collapsed,
    ).toEqual(new Set());
  });
});
