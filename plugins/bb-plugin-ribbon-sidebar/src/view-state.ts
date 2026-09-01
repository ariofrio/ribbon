import type { GroupingKey } from "./placement-store";

export type GroupRef = { groupingKey: GroupingKey; groupId: string };
export type Scope = { kind: "all" } | { kind: "group"; group: GroupRef };
export type SidebarSort = "updated" | "created" | "alphabetical" | "manual";
export interface HiddenThreadKinds {
  notArchived: boolean;
  archived: boolean;
  visible: boolean;
  hidden: boolean;
}
export type SidebarView = {
  scope: Scope;
  groupingKey: GroupingKey | null;
  filterGroupingKey: GroupingKey;
  hide: HiddenThreadKinds;
  sort: SidebarSort;
};
export interface SidebarPreferences {
  view: SidebarView;
  collapsed: Set<string>;
}
interface StoredSidebarPreferences {
  view: Omit<SidebarView, "filterGroupingKey"> & {
    filterGroupingKey: GroupingKey | null;
  };
  collapsed: Set<string>;
}

export const DEFAULT_HIDDEN_THREAD_KINDS: HiddenThreadKinds = {
  notArchived: false,
  archived: true,
  visible: false,
  hidden: true,
};
export const DEFAULT_SIDEBAR_SORT: SidebarSort = "updated";

export const SIDEBAR_PREFERENCES_KEY =
  "bb.plugin.ribbon-sidebar.preferences.v1";
const THREAD_STAGES_FILTER_KEYS = [
  "bb.plugin.thread-stages.threadFilter",
  "bb.plugin.thread-stages.projectFilter",
  "bb.plugin.thread-workflow.projectFilter",
] as const;
const THREAD_STAGES_COLLAPSED_KEY =
  "bb.plugin.workflow-stage.collapsedStatuses";
const GROUPING_KEY = /^(?:builtin:(?:projects|sections)|plugin:[^:/]+:[^:/]+)$/u;

function isGroupingKey(value: unknown): value is GroupingKey {
  return typeof value === "string" && GROUPING_KEY.test(value);
}

function storedHide(value: unknown): HiddenThreadKinds {
  if (typeof value !== "object" || value === null) {
    return { ...DEFAULT_HIDDEN_THREAD_KINDS };
  }
  const record = value as Record<string, unknown>;
  return {
    notArchived:
      typeof record.notArchived === "boolean"
        ? record.notArchived
        : DEFAULT_HIDDEN_THREAD_KINDS.notArchived,
    archived:
      typeof record.archived === "boolean"
        ? record.archived
        : DEFAULT_HIDDEN_THREAD_KINDS.archived,
    visible:
      typeof record.visible === "boolean"
        ? record.visible
        : DEFAULT_HIDDEN_THREAD_KINDS.visible,
    hidden:
      typeof record.hidden === "boolean"
        ? record.hidden
        : DEFAULT_HIDDEN_THREAD_KINDS.hidden,
  };
}

function storedSort(value: unknown): SidebarSort {
  return value === "updated" ||
    value === "created" ||
    value === "alphabetical" ||
    value === "manual"
    ? value
    : DEFAULT_SIDEBAR_SORT;
}

function storedPreferences(raw: string | null): StoredSidebarPreferences | null {
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) return null;
    const record = value as Record<string, unknown>;
    const view = record.view as Record<string, unknown> | undefined;
    if (!view || (view.groupingKey !== null && !isGroupingKey(view.groupingKey))) {
      return null;
    }
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
      view: {
        scope,
        groupingKey: view.groupingKey,
        filterGroupingKey: isGroupingKey(view.filterGroupingKey)
          ? view.filterGroupingKey
          : null,
        hide: storedHide(view.hide),
        sort: storedSort(view.sort),
      },
      collapsed: new Set(collapsed),
    };
  } catch {
    return null;
  }
}

export function normalizeSidebarView(view: SidebarView): SidebarView {
  if (
    view.groupingKey !== null &&
    view.scope.kind === "group" &&
    view.scope.group.groupingKey === view.groupingKey
  ) {
    return { ...view, groupingKey: null };
  }
  return view;
}

export function changeSidebarScope(
  view: SidebarView,
  scope: Scope,
): SidebarView {
  return normalizeSidebarView({
    ...view,
    scope,
    filterGroupingKey:
      scope.kind === "group" ? scope.group.groupingKey : view.filterGroupingKey,
  });
}

export function changeSidebarGrouping(
  view: SidebarView,
  groupingKey: GroupingKey | null,
): SidebarView {
  const nextGroupingKey =
    groupingKey !== null && view.groupingKey === groupingKey
      ? null
      : groupingKey;
  return {
    ...view,
    groupingKey: nextGroupingKey,
    scope:
      nextGroupingKey !== null &&
      view.scope.kind === "group" &&
      view.scope.group.groupingKey === nextGroupingKey
        ? { kind: "all" }
        : view.scope,
  };
}

export function changeSidebarPagesGrouping(
  view: SidebarView,
  filterGroupingKey: GroupingKey,
): SidebarView {
  if (view.filterGroupingKey === filterGroupingKey) return view;
  return {
    ...view,
    filterGroupingKey,
    scope: { kind: "all" },
  };
}

function legacyScope(storage: Storage): Scope {
  const filter = THREAD_STAGES_FILTER_KEYS.map((key) => storage.getItem(key)).find(
    (value) => value !== null,
  );
  if (!filter) return { kind: "all" };
  if (filter === "uncategorized") {
    return {
      kind: "group",
      group: { groupingKey: "builtin:sections", groupId: "unsectioned" },
    };
  }
  const separator = filter.indexOf(":");
  const kind = separator < 0 ? "project" : filter.slice(0, separator);
  const groupId = separator < 0 ? filter : filter.slice(separator + 1);
  if (!groupId || (kind !== "project" && kind !== "section")) {
    return { kind: "all" };
  }
  return {
    kind: "group",
    group: {
      groupingKey:
        kind === "project" ? "builtin:projects" : "builtin:sections",
      groupId,
    },
  };
}

function legacyCollapsed(
  storage: Storage,
  defaultCollapsed: readonly string[],
): Set<string> {
  try {
    const raw = storage.getItem(THREAD_STAGES_COLLAPSED_KEY);
    if (raw === null) return new Set(defaultCollapsed);
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(
      parsed
        .filter((value): value is string => typeof value === "string")
        .map((groupId) =>
          groupId === "Pinned"
            ? "builtin:pinned"
            : `plugin:thread-stages:stages/${groupId}`,
        ),
    );
  } catch {
    return new Set();
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
  defaultCollapsed: readonly string[] = [],
): SidebarPreferences {
  const filterFallback =
    availableGroupingKeys.find((key) => key === "builtin:sections") ??
    availableGroupingKeys[0] ??
    "builtin:sections";
  const fallback =
    availableGroupingKeys.find(
      (key) => key === "plugin:thread-stages:stages",
    ) ??
    availableGroupingKeys[0] ??
    "builtin:projects";
  let stored: StoredSidebarPreferences | null = null;
  try {
    stored = storedPreferences(storage.getItem(SIDEBAR_PREFERENCES_KEY));
  } catch {
    return {
      view: {
        scope: { kind: "all" },
        groupingKey: fallback,
        filterGroupingKey: filterFallback,
        hide: { ...DEFAULT_HIDDEN_THREAD_KINDS },
        sort: DEFAULT_SIDEBAR_SORT,
      },
      collapsed: new Set(),
    };
  }
  if (stored !== null) {
    const groupingKey =
      stored.view.groupingKey === null ||
      availableGroupingKeys.includes(stored.view.groupingKey)
        ? stored.view.groupingKey
        : fallback;
    return {
      ...stored,
      view: normalizeSidebarView({
        ...stored.view,
        groupingKey,
        filterGroupingKey: stored.view.filterGroupingKey ?? filterFallback,
      }),
    };
  }
  let migrated: SidebarPreferences;
  try {
    migrated = {
      view: {
        scope: legacyScope(storage),
        groupingKey: fallback,
        filterGroupingKey: filterFallback,
        hide: { ...DEFAULT_HIDDEN_THREAD_KINDS },
        sort: DEFAULT_SIDEBAR_SORT,
      },
      collapsed: legacyCollapsed(storage, defaultCollapsed),
    };
  } catch {
    migrated = {
      view: {
        scope: { kind: "all" },
        groupingKey: fallback,
        filterGroupingKey: filterFallback,
        hide: { ...DEFAULT_HIDDEN_THREAD_KINDS },
        sort: DEFAULT_SIDEBAR_SORT,
      },
      collapsed: new Set(),
    };
  }
  saveSidebarPreferences(storage, migrated);
  return migrated;
}
