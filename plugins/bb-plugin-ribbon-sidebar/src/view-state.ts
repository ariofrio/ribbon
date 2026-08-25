import type { GroupingKey } from "./placement-store";

export type GroupRef = { groupingKey: GroupingKey; groupId: string };
export type Scope = { kind: "all" } | { kind: "group"; group: GroupRef };
export type SidebarView = { scope: Scope; groupingKey: GroupingKey };
export interface SidebarPreferences {
  view: SidebarView;
  collapsed: Set<string>;
}

export const SIDEBAR_PREFERENCES_KEY =
  "bb.plugin.ribbon-sidebar.preferences.v1";
const GROUPING_KEY = /^(?:builtin:(?:projects|sections)|plugin:[^:/]+:[^:/]+)$/u;

function isGroupingKey(value: unknown): value is GroupingKey {
  return typeof value === "string" && GROUPING_KEY.test(value);
}

function storedPreferences(raw: string | null): SidebarPreferences | null {
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) return null;
    const record = value as Record<string, unknown>;
    const view = record.view as Record<string, unknown> | undefined;
    if (!view || !isGroupingKey(view.groupingKey)) return null;
    const rawScope = view.scope as Record<string, unknown> | undefined;
    let scope: Scope;
    if (rawScope?.kind === "all") scope = { kind: "all" };
    else {
      const group = rawScope?.group as Record<string, unknown> | undefined;
      if (
        rawScope?.kind !== "group" ||
        !group ||
        !isGroupingKey(group.groupingKey) ||
        typeof group.groupId !== "string" ||
        group.groupId.length === 0
      ) {
        return null;
      }
      scope = {
        kind: "group",
        group: {
          groupingKey: group.groupingKey,
          groupId: group.groupId,
        },
      };
    }
    const collapsed = Array.isArray(record.collapsed)
      ? record.collapsed.filter(
          (item): item is string => typeof item === "string",
        )
      : [];
    return {
      view: { scope, groupingKey: view.groupingKey },
      collapsed: new Set(collapsed),
    };
  } catch {
    return null;
  }
}

export function saveSidebarPreferences(
  storage: Storage,
  preferences: SidebarPreferences,
) {
  try {
    storage.setItem(
      SIDEBAR_PREFERENCES_KEY,
      JSON.stringify({
        view: preferences.view,
        collapsed: [...preferences.collapsed],
      }),
    );
  } catch {
    // Client-local choices still work for this mount when storage is blocked.
  }
}

export function loadSidebarPreferences(
  storage: Storage,
  availableGroupingKeys: readonly GroupingKey[],
): SidebarPreferences {
  const fallback =
    availableGroupingKeys.find(
      (key) => key === "plugin:thread-stages:stages",
    ) ??
    availableGroupingKeys[0] ??
    "builtin:projects";
  let stored: SidebarPreferences | null = null;
  try {
    stored = storedPreferences(storage.getItem(SIDEBAR_PREFERENCES_KEY));
  } catch {
    return {
      view: { scope: { kind: "all" }, groupingKey: fallback },
      collapsed: new Set(),
    };
  }
  if (stored !== null) {
    return {
      ...stored,
      view: {
        ...stored.view,
        groupingKey: availableGroupingKeys.includes(stored.view.groupingKey)
          ? stored.view.groupingKey
          : fallback,
      },
    };
  }
  const initial = {
    view: { scope: { kind: "all" as const }, groupingKey: fallback },
    collapsed: new Set<string>(),
  };
  saveSidebarPreferences(storage, initial);
  return initial;
}
