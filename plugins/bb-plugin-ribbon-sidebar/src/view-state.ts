import type { GroupingKey } from "./placement-store";

export type GroupRef = { groupingKey: GroupingKey; groupId: string };
export type Scope = { kind: "all" } | { kind: "group"; group: GroupRef };
export type SidebarSort = "updated" | "created" | "alphabetical" | "manual";
export type PullRequestNumberPosition = "left" | "right" | "hidden";
export interface HiddenThreadKinds {
  notArchived: boolean;
  archived: boolean;
  visible: boolean;
  hidden: boolean;
}
export type SidebarView = {
  scope: Scope;
  groupingKey: GroupingKey | null;
  filterGroupingKey: GroupingKey | null;
  iconGroupingKey: GroupingKey | null;
  pullRequestNumberPosition: PullRequestNumberPosition;
  hide: HiddenThreadKinds;
  sort: SidebarSort;
};
export interface SidebarPreferences {
  view: SidebarView;
  collapsed: Set<string>;
}
interface StoredSidebarPreferences {
  view: Omit<SidebarView, "filterGroupingKey"> & {
    filterGroupingKey: GroupingKey | null | undefined;
  };
  collapsed: Set<string>;
}

export const DEFAULT_HIDDEN_THREAD_KINDS: HiddenThreadKinds = {
  notArchived: false,
  archived: true,
  visible: false,
  hidden: true,
};
export const DEFAULT_SIDEBAR_SORT: SidebarSort = "manual";

export const SIDEBAR_PREFERENCES_KEY =
  "bb.plugin.ribbon-sidebar.preferences.v1";
const THREAD_STAGES_COLLAPSED_KEY =
  "bb.plugin.workflow-stage.collapsedStatuses";
const GROUPING_KEY =
  /^(?:builtin:(?:projects|sections)|plugin:[^:/]+:[^:/]+)$/u;

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

function storedPreferences(
  raw: string | null,
): StoredSidebarPreferences | null {
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) return null;
    const record = value as Record<string, unknown>;
    const view = record.view as Record<string, unknown> | undefined;
    if (
      !view ||
      (view.groupingKey !== null && !isGroupingKey(view.groupingKey))
    ) {
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
        filterGroupingKey:
          view.filterGroupingKey === null ||
          isGroupingKey(view.filterGroupingKey)
            ? view.filterGroupingKey
            : undefined,
        iconGroupingKey:
          view.iconGroupingKey === null || isGroupingKey(view.iconGroupingKey)
            ? view.iconGroupingKey
            : "builtin:projects",
        pullRequestNumberPosition:
          view.pullRequestNumberPosition === "left" ||
          view.pullRequestNumberPosition === "hidden"
            ? view.pullRequestNumberPosition
            : "right",
        hide: storedHide(view.hide),
        sort: storedSort(view.sort),
      },
      collapsed: new Set(collapsed),
    };
  } catch {
    return null;
  }
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
  let stored: StoredSidebarPreferences | null = null;
  try {
    stored = storedPreferences(storage.getItem(SIDEBAR_PREFERENCES_KEY));
  } catch {
    /* Use defaults when storage is unavailable. */
  }
  const preferences: SidebarPreferences = {
    view: {
      scope: { kind: "all" },
      groupingKey: "builtin:sections",
      filterGroupingKey: null,
      iconGroupingKey: "plugin:thread-stages:stages",
      sort: "manual",
      hide: stored?.view.hide ?? { ...DEFAULT_HIDDEN_THREAD_KINDS },
      pullRequestNumberPosition:
        stored?.view.pullRequestNumberPosition ?? "right",
    },
    collapsed: stored?.collapsed ?? legacyCollapsed(storage, []),
  };
  saveSidebarPreferences(storage, preferences);
  return preferences;
}
