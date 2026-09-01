import {
  definePluginApp,
  experimental_useSidebarThreadActions,
  experimental_useSidebarThreadSplit,
  experimental_useSidebarThreads,
  useRealtime,
  useRealtimeConnectionState,
  useRpc,
  useSettings,
  type PluginSidebarThread,
  type PluginThreadListProps,
} from "@get-bb/plugin-sdk/app";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  Fragment,
  type DragEvent,
  type FormEvent,
  type MouseEvent,
  type CSSProperties,
  type ReactNode,
} from "react";
import type { z } from "zod";
import type { IconDataV1 } from "./contracts";
import type { rpcContract } from "./server";
import type { GroupingKey, PlacementRecordV1 } from "./placement-store";
import {
  changeSidebarGrouping,
  changeSidebarPagesGrouping,
  changeSidebarScope,
  loadSidebarPreferences,
  saveSidebarPreferences,
  type GroupRef,
  type SidebarPreferences,
  type SidebarSort,
} from "./view-state";
import { Button } from "./vendor/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./vendor/components/ui/dialog";
import { Input } from "./vendor/components/ui/input";
import { groupIndicator, ThreadIndicator } from "./thread-indicator";
import {
  ICON_LAYOUT_ATTRIBUTE,
  publishIconStyles,
  type IconFallback,
} from "./icon-styles";
import {
  ThreadActionsContextMenu,
  ThreadActionsDropdown,
  type AssignmentGroupOption,
} from "./thread-actions-menu";
import { ProviderIcon } from "./provider-icon";
import { Icon } from "./vendor/components/ui/icon";
import { usePersistentStringSet } from "./persistent-string-set";
import { SplitPaneMiniMap } from "./split-pane-mini-map";
import { mountSidebarContentSpacing } from "./sidebar-content-spacing";
import { ScopeFilter } from "./scope-filter";
import { SidebarDisplayOptionsMenu } from "./sidebar-display-options-menu";
import { SidebarTopControls } from "./sidebar-top-controls";
import type { ScopeFilterValue } from "./scope-filter-value";
import { orderedGroupings } from "./grouping-order";
import { UnorganizedIcon } from "./unorganized-icon";
import { CHROME_SECTION_LABEL_CLASS } from "./chrome-style-tokens";
import {
  GroupHeaderMenu,
  type HeaderGroupActions,
} from "./group-header-menu";
import {
  mountGroupAwareThreadCreation,
  RIBBON_SIDEBAR_NEW_THREAD_GROUP_REQUESTED_EVENT,
  RIBBON_SIDEBAR_PENDING_NEW_THREAD_PROJECT_ATTRIBUTE,
  RIBBON_SIDEBAR_NEW_THREAD_PROJECT_REQUESTED_EVENT,
  RIBBON_SIDEBAR_PREFERENCES_CHANGED_EVENT,
} from "./new-thread-section";

const COLLAPSED_THREADS_STORAGE_KEY = "bb.sidebar.collapsedThreads";
/** bb keeps project-less threads in the personal project, under a reserved id. */
const PERSONAL_PROJECT_ID = "proj_personal";

type SidebarSnapshot = z.output<
  typeof rpcContract.sidebarSnapshotV1.output
>;
type SearchThread = z.output<
  typeof rpcContract.searchThreadIdsV1.output
>["threads"][number];
type SupplementalThread = z.output<
  typeof rpcContract.listThreadsV1.output
>["threads"][number];
type BuiltinGroupRef = {
  groupingKey: "builtin:projects" | "builtin:sections";
  groupId: string;
};
type EntityDialog =
  | { kind: "create-section"; name: string }
  | { kind: "rename"; scope: BuiltinGroupRef; label: string; name: string }
  | { kind: "delete"; scope: BuiltinGroupRef; label: string };
type DragDestination =
  | {
      kind: "pinned";
      beforeThreadId: string | null;
      indicatorBefore: string | null;
      indicatorAfter: string | null;
    }
  | {
      kind: "placement";
      groupId: string;
      beforeThreadId: string | null;
      indicatorBefore: string | null;
      indicatorAfter: string | null;
    };

function title(thread: PluginSidebarThread) {
  return thread.title ?? thread.titleFallback ?? "Untitled thread";
}

function compareSidebarThreads(
  sort: SidebarSort,
  left: PluginSidebarThread,
  right: PluginSidebarThread,
) {
  if (sort === "updated") return right.updatedAt - left.updatedAt;
  if (sort === "created") return right.createdAt - left.createdAt;
  if (sort === "alphabetical") {
    return title(left).localeCompare(title(right), undefined, {
      sensitivity: "base",
      numeric: true,
    });
  }
  return 0;
}

function descendants(
  rootId: string,
  childrenByParent: ReadonlyMap<string, readonly PluginSidebarThread[]>,
): PluginSidebarThread[] {
  const result: PluginSidebarThread[] = [];
  for (const child of childrenByParent.get(rootId) ?? []) {
    result.push(child, ...descendants(child.id, childrenByParent));
  }
  return result;
}

function rootForThread(
  threadId: string,
  threads: readonly PluginSidebarThread[],
): PluginSidebarThread | undefined {
  const byId = new Map(threads.map((thread) => [thread.id, thread]));
  let current = byId.get(threadId);
  const visited = new Set<string>();
  while (
    current?.parentThreadId &&
    !visited.has(current.parentThreadId) &&
    byId.has(current.parentThreadId)
  ) {
    visited.add(current.id);
    current = byId.get(current.parentThreadId);
  }
  return current;
}

function archivedSearchThread(thread: SearchThread): PluginSidebarThread {
  return {
    ...thread,
    sectionId: null,
    originKind: null,
    originPluginId: null,
    hasPendingInteraction: false,
    activity: {
      workflows: 0,
      backgroundAgents: 0,
      backgroundCommands: 0,
      planMode: 0,
      goals: 0,
    },
    indicator: "none",
    indicatorLabel: null,
    isUnread: false,
    isPinned: false,
    environment: null,
    host: null,
    createdAt: 0,
    updatedAt: 0,
    lastReadAt: null,
    latestAttentionAt: 0,
  };
}

function supplementalSidebarThread(
  thread: SupplementalThread,
): PluginSidebarThread {
  return {
    ...thread,
    hasPendingInteraction: false,
    activity: {
      workflows: 0,
      backgroundAgents: 0,
      backgroundCommands: 0,
      planMode: 0,
      goals: 0,
    },
    indicator: "none",
    indicatorLabel: null,
    isUnread: false,
    environment: null,
    host: null,
  };
}

function ThreadRow({
  active,
  alignAdornmentsToEntireItem,
  actions,
  assignments,
  childrenCollapsed,
  depth,
  hasChildren,
  indicatorThread,
  dragging,
  onDragEnd,
  onDragOver,
  onDragStart,
  onDropBefore,
  onNewSection,
  onOpen,
  onRename,
  onSetSection,
  onToggleChildren,
  placementDisabled,
  preview,
  reorderable,
  sections,
  showDropAfter,
  showDropBefore,
  thread,
}: {
  active: boolean;
  alignAdornmentsToEntireItem: boolean;
  actions: ReturnType<typeof experimental_useSidebarThreadActions>;
  assignments: readonly {
    groupingKey: string;
    currentGroupId: string;
    groups: readonly AssignmentGroupOption[];
    icon?: IconDataV1;
    singularLabel: string;
    onSetGroup(groupId: string): void;
  }[];
  childrenCollapsed: boolean;
  depth: number;
  hasChildren: boolean;
  indicatorThread: PluginSidebarThread;
  dragging: boolean;
  onDragEnd(): void;
  onDragOver(event: DragEvent<HTMLElement>): void;
  onDragStart(event: DragEvent<HTMLElement>): void;
  onDropBefore(event: DragEvent<HTMLElement>): void;
  onNewSection(): void;
  onOpen(split: boolean): void;
  onRename(): void;
  onSetSection(sectionId: string | null): void;
  onToggleChildren(): void;
  placementDisabled: boolean;
  preview: string | null;
  reorderable: boolean;
  sections: readonly { id: string; label: string }[];
  showDropAfter: boolean;
  showDropBefore: boolean;
  thread: PluginSidebarThread;
}) {
  const { splitProps, isAvailable: splitAvailable, layout } =
    experimental_useSidebarThreadSplit(thread.id);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const rowTitle = title(thread);
  const accessibleTitle = preview ? `${rowTitle} — ${preview}` : rowTitle;
  const actionsOpen = dropdownOpen || contextOpen;
  const iconSpansEntireItem = alignAdornmentsToEntireItem && preview !== null;
  const hasTrailingIndicator =
    layout !== null || indicatorThread.indicator !== "none";
  const alignsTrailingIndicatorToTitle =
    hasTrailingIndicator && !alignAdornmentsToEntireItem;
  const reservesTrailingLane =
    hasTrailingIndicator && alignAdornmentsToEntireItem;
  const commonMenuProps = {
    actions,
    assignments,
    disabled: placementDisabled,
    onNewSection,
    onRename,
    onSetSection,
    sections,
    splitAvailable,
    thread,
  };

  function openThread(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    onOpen(splitAvailable && (event.metaKey || event.ctrlKey));
  }

  const row = (
    <li
      className="relative list-none"
      data-thread-id={thread.id}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDragStart={onDragStart}
      onDrop={onDropBefore}
    >
      {showDropBefore ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -top-px left-2 right-2 z-20 h-0.5 rounded-full bg-primary"
          data-sidebar-drop-indicator=""
        />
      ) : null}
      {showDropAfter ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-px left-2 right-2 z-20 h-0.5 rounded-full bg-primary"
          data-sidebar-drop-indicator=""
        />
      ) : null}
      <div
        className={`bb-sidebar-hover-actions-row group/thread-row relative grid w-full items-start rounded-md pr-0 text-sm transition-colors ${
          reservesTrailingLane
            ? "grid-cols-[minmax(0,1fr)_auto] gap-x-2"
            : "grid-cols-1"
        } ${
          active
            ? "bg-state-active text-sidebar-foreground"
            : "cursor-pointer text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground dark:text-sidebar-foreground"
        } ${layout !== null && !active ? "bg-sidebar-accent/50" : ""} ${
          dragging ? "opacity-40" : ""
        } ${reorderable ? "select-none" : ""}`}
        aria-grabbed={dragging ? "true" : undefined}
        draggable={reorderable}
        style={{ paddingLeft: 8 + depth * 24 }}
      >
        {Array.from({ length: depth }, (_, level) => (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 z-[1] w-px bg-border-hairline opacity-70"
            key={level}
            style={{ left: 16 + level * 24 }}
          />
        ))}
        <a
          {...splitProps}
          aria-current={active ? "page" : undefined}
          aria-label={`Open ${accessibleTitle}`}
          className="absolute inset-0 rounded-md outline-none ring-sidebar-ring focus-visible:ring-2"
          data-sidebar-thread-id={thread.id}
          data-sidebar-thread-shortcut-target=""
          draggable={false}
          href={`/projects/${encodeURIComponent(thread.projectId)}/threads/${encodeURIComponent(thread.id)}`}
          onClick={openThread}
        />
        <span
          className={`grid min-w-0 gap-x-2 py-[calc((var(--bb-sidebar-row-height)-1lh)/2)] max-md:pointer-coarse:py-[calc((var(--bb-sidebar-row-height-coarse)-1lh)/2)] ${
            alignsTrailingIndicatorToTitle
              ? "grid-cols-[auto_minmax(0,1fr)_auto]"
              : "grid-cols-[auto_minmax(0,1fr)]"
          }`}
          {...{ [ICON_LAYOUT_ATTRIBUTE]: "" }}
        >
          {/* Empty by design: the box names its project, and icon-styles.ts
              paints it. Without that plugin the box collapses. */}
          <span
            aria-hidden
            className="col-start-1 row-start-1 self-center"
            data-ribbon-icons-project={thread.projectId}
            data-ribbon-sidebar-icon={
              thread.projectId === PERSONAL_PROJECT_ID ? "personal" : "project"
            }
            data-ribbon-sidebar-icon-optional=""
            style={{
              gridRowEnd: iconSpansEntireItem ? "span 2" : "auto",
              gridRowStart: 1,
            }}
          />
          <span
            className="col-start-2 row-start-1 flex min-w-0 items-center gap-1.5"
            style={{
              paddingRight: hasTrailingIndicator ? undefined : 8,
            }}
          >
            <span className="min-w-0 truncate" title={accessibleTitle}>
              {rowTitle}
            </span>
            {hasChildren ? (
              <button
                aria-expanded={!childrenCollapsed}
                aria-label={childrenCollapsed ? `Expand ${rowTitle} threads` : `Collapse ${rowTitle} threads`}
                className="bb-sidebar-hover-actions relative z-20 inline-flex size-5 shrink-0 items-center justify-center rounded-md text-subtle-foreground outline-none ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onToggleChildren();
                }}
                type="button"
              >
                <Icon name="ChevronRight" className={`size-3 transition-transform duration-150 ${childrenCollapsed ? "" : "rotate-90"}`} aria-hidden />
              </button>
            ) : null}
          </span>
          {alignsTrailingIndicatorToTitle ? (
            <span
              aria-hidden="true"
              className="col-start-3 row-start-1 w-7 max-md:pointer-coarse:w-9"
            />
          ) : null}
          {preview ? (
            <span
              className={`col-start-2 row-start-2 truncate text-[11px] leading-4 text-subtle-foreground/75 ${
                alignsTrailingIndicatorToTitle ? "col-end-4" : ""
              }`}
              style={{
                paddingRight: reservesTrailingLane ? undefined : 8,
              }}
              title={preview}
            >
              {preview}
            </span>
          ) : null}
        </span>
        {hasTrailingIndicator ? (
          <span
            className={`flex w-7 shrink-0 items-center justify-end max-md:pointer-coarse:w-9 ${
              alignAdornmentsToEntireItem
                ? "relative self-stretch"
                : "absolute right-0 top-0 z-10 h-[var(--bb-sidebar-row-height)] max-md:pointer-coarse:h-[var(--bb-sidebar-row-height-coarse)]"
            }`}
            style={{
              alignSelf: alignAdornmentsToEntireItem ? "stretch" : "start",
              position: alignAdornmentsToEntireItem ? "relative" : "absolute",
              right: alignAdornmentsToEntireItem ? undefined : 0,
              top: alignAdornmentsToEntireItem ? undefined : 0,
            }}
          >
            <span
              className="bb-sidebar-hover-actions-fade absolute inset-0 flex items-center justify-center text-subtle-foreground"
              data-sidebar-hover-actions-open={actionsOpen ? "true" : undefined}
            >
              {layout ? (
                <span
                  className="inline-flex size-4 items-center justify-center"
                  data-sidebar-thread-trailing-indicator=""
                >
                  <SplitPaneMiniMap
                    active={[
                      "working-draft",
                      "workflow",
                      "background-agent",
                      "background-command",
                      "plan-mode",
                      "goal",
                      "runtime",
                    ].includes(indicatorThread.indicator)}
                    label={
                      indicatorThread.indicatorLabel
                        ? `${rowTitle} — open in split; ${indicatorThread.indicatorLabel}`
                        : `${rowTitle} — open in split`
                    }
                    layout={layout}
                  />
                </span>
              ) : (
                <span
                  className="inline-flex size-4 items-center justify-center"
                  data-sidebar-thread-trailing-indicator=""
                >
                  <ThreadIndicator
                    indicator={indicatorThread.indicator}
                    label={indicatorThread.indicatorLabel}
                  />
                </span>
              )}
            </span>
            {!thread.isArchived ? (
              <span
                className="bb-sidebar-hover-actions absolute inset-y-0 right-0 z-10 flex w-7 items-center justify-end max-md:pointer-coarse:hidden"
                data-sidebar-hover-actions-open={actionsOpen ? "true" : undefined}
              >
                <ThreadActionsDropdown
                  {...commonMenuProps}
                  onOpenChange={setDropdownOpen}
                />
              </span>
            ) : null}
          </span>
        ) : !thread.isArchived ? (
          <span
            className="bb-sidebar-hover-actions absolute right-0 top-0 z-10 col-start-1 row-start-1 flex h-[var(--bb-sidebar-row-height)] w-7 items-center justify-end max-md:pointer-coarse:hidden max-md:pointer-coarse:h-[var(--bb-sidebar-row-height-coarse)] max-md:pointer-coarse:w-9"
            data-sidebar-hover-actions-open={actionsOpen ? "true" : undefined}
          >
            <ThreadActionsDropdown
              {...commonMenuProps}
              onOpenChange={setDropdownOpen}
            />
          </span>
        ) : null}
      </div>
    </li>
  );

  if (thread.isArchived) return row;
  return (
    <ThreadActionsContextMenu {...commonMenuProps} onOpenChange={setContextOpen}>
      {row}
    </ThreadActionsContextMenu>
  );
}

function SidebarMessage({
  action,
  children,
  icon,
  loading = false,
}: {
  action?: { label: string; onClick(): void };
  children: ReactNode;
  icon: "AlertCircle" | "CircleQuestion" | "Loading";
  loading?: boolean;
}) {
  return (
    <div className="flex min-h-20 items-center justify-center px-3 py-6 text-center text-xs text-muted-foreground">
      <div className="flex max-w-52 flex-col items-center gap-2">
        <Icon
          aria-hidden
          className={`size-4 ${loading ? "animate-spin" : ""}`}
          name={icon}
        />
        <span>{children}</span>
        {action ? (
          <Button onClick={action.onClick} size="sm" type="button" variant="outline">
            {action.label}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function RibbonSidebarList({
  activeProjectId,
  activeThreadId,
  experimental_Original: OriginalThreadList,
  onNavigate,
  searchQuery,
}: PluginThreadListProps) {
  const rpc = useRpc<typeof rpcContract>();
  const sidebar = experimental_useSidebarThreads();
  const actions = experimental_useSidebarThreadActions();
  const settings = useSettings();
  const connection = useRealtimeConnectionState();
  const [snapshot, setSnapshot] = useState<SidebarSnapshot | null>(null);
  const [preferences, setPreferences] = useState<SidebarPreferences | null>(
    null,
  );
  const [placements, setPlacements] = useState<readonly PlacementRecordV1[]>(
    [],
  );
  const [assignmentPlacements, setAssignmentPlacements] = useState<
    ReadonlyMap<string, ReadonlyMap<string, PlacementRecordV1>>
  >(new Map());
  const [revision, setRevision] = useState(0);
  const [previews, setPreviews] = useState<ReadonlyMap<string, string | null>>(
    new Map(),
  );
  const [projectActionStates, setProjectActionStates] = useState<
    ReadonlyMap<string, { canAddLocalPath: boolean }>
  >(new Map());
  const [supplementalThreads, setSupplementalThreads] = useState<
    readonly SupplementalThread[]
  >([]);
  const [collapsedThreadIds, setCollapsedThreadIds] =
    usePersistentStringSet(COLLAPSED_THREADS_STORAGE_KEY);
  const [threadRename, setThreadRename] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [threadRenamePending, setThreadRenamePending] = useState(false);
  const [placementsLoaded, setPlacementsLoaded] = useState(false);
  const [previewsLoaded, setPreviewsLoaded] = useState(false);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [pendingNewThreadGroup, setPendingNewThreadGroup] = useState<{
    group: GroupRef;
    activeThreadIdAtSubmission: string | null;
    knownThreadIds: ReadonlySet<string>;
  } | null>(null);
  const [pendingComposerProjectId, setPendingComposerProjectId] = useState<
    string | null
  >(null);
  const [draggingThreadId, setDraggingThreadId] = useState<string | null>(null);
  const [dragDestination, setDragDestination] =
    useState<DragDestination | null>(null);
  const [entityDialog, setEntityDialog] = useState<EntityDialog | null>(null);
  const [entityPending, setEntityPending] = useState(false);
  const [searchResult, setSearchResult] = useState<{
    query: string;
    status: "idle" | "loading" | "ready" | "error";
    threadIds: ReadonlySet<string>;
    threads: readonly SearchThread[];
  }>({ query: "", status: "idle", threadIds: new Set(), threads: [] });
  const [searchAttempt, setSearchAttempt] = useState(0);
  const reconnectPending = useRef(false);
  const mounted = useRef(false);
  const previewRequest = useRef(0);
  const scopeSyncedForThreadId = useRef<string | null>(null);
  const normalizedSearch = searchQuery.trim().toLocaleLowerCase();

  const synchronize = useCallback(async () => {
    const [next, actionStates] = await Promise.all([
      rpc.call("synchronizeV1", {
        migrateThreadStages: !mounted.current,
      }),
      rpc.call("listProjectActionStatesV1", null).catch(() => ({ projects: [] })),
    ]);
    mounted.current = true;
    setSnapshot(next);
    setProjectActionStates(
      new Map(actionStates.projects.map((project) => [project.id, project])),
    );
    setFatalError(null);
    setPreferences((current) => {
      if (current !== null) return current;
      return loadSidebarPreferences(
        window.localStorage,
        next.groupings.map(({ groupingKey }) => groupingKey as GroupingKey),
        next.groupings.flatMap((candidate) =>
          candidate.groups.flatMap((group) =>
            group.defaultCollapsed
              ? [`${candidate.groupingKey}/${group.id}`]
              : [],
          ),
        ),
      );
    });
  }, [rpc]);

  useEffect(() => {
    void synchronize().catch((error: unknown) => {
      setFatalError(
        error instanceof Error ? error.message : "Ribbon sidebar unavailable",
      );
    });
  }, [synchronize]);

  useEffect(() => {
    if (connection !== "connected") {
      reconnectPending.current = true;
      return;
    }
    if (reconnectPending.current) {
      reconnectPending.current = false;
      void synchronize().catch((error: unknown) => {
        setFatalError(
          error instanceof Error ? error.message : "Ribbon sidebar unavailable",
        );
      });
    }
  }, [connection, synchronize]);

  const loadPlacements = useCallback(async () => {
    if (!preferences) return;
    const placementGroupingKey =
      preferences.view.groupingKey ??
      snapshot?.groupings.find(({ available }) => available)?.groupingKey;
    if (!placementGroupingKey) return;
    setPlacementsLoaded(false);
    let threadIds: string[] | undefined;
    const sameGroupingScope =
      !normalizedSearch &&
      preferences.view.scope.kind === "group" &&
      preferences.view.scope.group.groupingKey === placementGroupingKey
        ? preferences.view.scope.group
        : null;
    if (
      !normalizedSearch &&
      preferences.view.scope.kind === "group" &&
      preferences.view.scope.group.groupingKey !==
        placementGroupingKey
    ) {
      const scope = preferences.view.scope.group;
      const scoped = await rpc.call("listPlacementsV1", {
        groupingKey: scope.groupingKey,
      });
      if (!scoped.ok) throw new Error(scoped.error.message);
      threadIds = scoped.value.items
        .filter(({ groupId }) => groupId === scope.groupId)
        .map(({ threadId }) => threadId);
    }
    const result = await rpc.call("listPlacementsV1", {
      groupingKey: placementGroupingKey,
      ...(threadIds === undefined ? {} : { threadIds }),
    });
    if (!result.ok) throw new Error(result.error.message);
    setPlacements(
      result.value.items.filter(
        ({ groupId }) =>
          sameGroupingScope === null || groupId === sameGroupingScope.groupId,
      ) as PlacementRecordV1[],
    );
    setRevision(result.value.revision);
    setPlacementsLoaded(true);
  }, [normalizedSearch, preferences, rpc, snapshot]);

  const loadAssignmentPlacements = useCallback(async () => {
    if (!snapshot) return;
    const writable = snapshot.groupings.filter(
      ({ available, groupingKey, membershipWritable }) =>
        available &&
        membershipWritable &&
        groupingKey !== "builtin:sections",
    );
    const results = await Promise.all(
      writable.map(async (candidate) => {
        const result = await rpc
          .call("listPlacementsV1", {
            groupingKey: candidate.groupingKey,
          })
          .catch(() => null);
        return [candidate.groupingKey, result] as const;
      }),
    );
    setAssignmentPlacements(
      new Map(
        results.flatMap(([groupingKey, result]) =>
          result?.ok
            ? [
                [
                  groupingKey,
                  new Map(
                    result.value.items.map((placement) => [
                      placement.threadId,
                      placement as PlacementRecordV1,
                    ]),
                  ),
                ] as const,
              ]
            : [],
        ),
      ),
    );
  }, [rpc, snapshot]);

  useEffect(() => {
    void loadPlacements().catch((error: unknown) => {
      setFatalError(
        error instanceof Error ? error.message : "Could not load placements",
      );
    });
  }, [loadPlacements]);
  useEffect(() => {
    void loadAssignmentPlacements();
  }, [loadAssignmentPlacements]);

  useRealtime("placements-changed", () => {
    void loadPlacements();
    void loadAssignmentPlacements();
  });
  useRealtime("catalog-changed", () => {
    void synchronize().catch((error: unknown) => {
      setFatalError(
        error instanceof Error ? error.message : "Ribbon sidebar unavailable",
      );
    });
  });

  const changePreferences = useCallback(
    (change: (current: SidebarPreferences) => SidebarPreferences) => {
      setPreferences((current) => {
        if (!current) return current;
        const next = change(current);
        saveSidebarPreferences(window.localStorage, next);
        return next;
      });
    },
    [],
  );

  useEffect(() => {
    if (preferences === null) return;
    window.dispatchEvent(
      new Event(RIBBON_SIDEBAR_PREFERENCES_CHANGED_EVENT),
    );
  }, [preferences]);

  useEffect(() => {
    const capture = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      if (
        typeof detail !== "object" ||
        detail === null ||
        !("groupingKey" in detail) ||
        !("groupId" in detail) ||
        typeof detail.groupingKey !== "string" ||
        typeof detail.groupId !== "string"
      ) {
        return;
      }
      setPendingNewThreadGroup({
        group: detail as GroupRef,
        activeThreadIdAtSubmission: activeThreadId,
        knownThreadIds: new Set(sidebar.threads.map(({ id }) => id)),
      });
    };
    window.addEventListener(
      RIBBON_SIDEBAR_NEW_THREAD_GROUP_REQUESTED_EVENT,
      capture,
    );
    return () => {
      window.removeEventListener(
        RIBBON_SIDEBAR_NEW_THREAD_GROUP_REQUESTED_EVENT,
        capture,
      );
    };
  }, [activeThreadId, sidebar.threads]);

  useEffect(() => {
    if (
      pendingNewThreadGroup === null ||
      activeThreadId === null ||
      activeThreadId === pendingNewThreadGroup.activeThreadIdAtSubmission ||
      snapshot === null
    ) {
      return;
    }
    const { group } = pendingNewThreadGroup;
    if (pendingNewThreadGroup.knownThreadIds.has(activeThreadId)) {
      setPendingNewThreadGroup(null);
      return;
    }
    const descriptor = snapshot.groupings.find(
      ({ groupingKey }) => groupingKey === group.groupingKey,
    );
    const destination = descriptor?.groups.find(({ id }) => id === group.groupId);
    setPendingNewThreadGroup(null);
    if (
      descriptor?.available !== true ||
      !descriptor.membershipWritable ||
      destination?.acceptsAssignments !== true
    ) {
      return;
    }
    void rpc
      .call("placeNewThreadV1", {
        ...group,
        threadId: activeThreadId,
      })
      .then((result) => {
        if (!result.ok) setMutationError(result.error.message);
      })
      .catch((error: unknown) => {
        setMutationError(
          error instanceof Error
            ? error.message
            : "Could not place the new thread",
        );
      });
  }, [activeThreadId, pendingNewThreadGroup, rpc, snapshot]);

  useEffect(() => {
    const capture = (event: Event) => {
      const projectId = (event as CustomEvent<unknown>).detail;
      if (typeof projectId === "string" && projectId.length > 0) {
        if (
          document.documentElement.getAttribute(
            RIBBON_SIDEBAR_PENDING_NEW_THREAD_PROJECT_ATTRIBUTE,
          ) === projectId
        ) {
          document.documentElement.removeAttribute(
            RIBBON_SIDEBAR_PENDING_NEW_THREAD_PROJECT_ATTRIBUTE,
          );
        }
        setPendingComposerProjectId(projectId);
      }
    };
    window.addEventListener(
      RIBBON_SIDEBAR_NEW_THREAD_PROJECT_REQUESTED_EVENT,
      capture,
    );
    const pendingProjectId = document.documentElement.getAttribute(
      RIBBON_SIDEBAR_PENDING_NEW_THREAD_PROJECT_ATTRIBUTE,
    );
    if (pendingProjectId !== null) {
      capture(
        new CustomEvent(RIBBON_SIDEBAR_NEW_THREAD_PROJECT_REQUESTED_EVENT, {
          detail: pendingProjectId,
        }),
      );
    }
    return () => {
      window.removeEventListener(
        RIBBON_SIDEBAR_NEW_THREAD_PROJECT_REQUESTED_EVENT,
        capture,
      );
    };
  }, []);

  useEffect(() => {
    if (pendingComposerProjectId === null || snapshot === null) return;
    const projects = snapshot.groupings.find(
      ({ groupingKey }) => groupingKey === "builtin:projects",
    );
    const projectExists = projects?.groups.some(
      ({ id }) => id === pendingComposerProjectId,
    );
    setPendingComposerProjectId(null);
    if (!projectExists || activeProjectId === pendingComposerProjectId) return;
    actions.openNewThread({
      projectId: pendingComposerProjectId,
      focusPrompt: true,
    });
  }, [actions, activeProjectId, pendingComposerProjectId, snapshot]);

  const grouping = snapshot?.groupings.find(
    ({ groupingKey }) => groupingKey === preferences?.view.groupingKey,
  );
  const placementByThread = useMemo(
    () => new Map(placements.map((placement) => [placement.threadId, placement])),
    [placements],
  );
  useEffect(() => {
    if (
      preferences === null ||
      (preferences.view.hide.archived && preferences.view.hide.hidden)
    ) {
      setSupplementalThreads((current) =>
        current.length === 0 ? current : [],
      );
      return;
    }
    let canceled = false;
    void rpc
      .call("listThreadsV1", null)
      .then(({ threads }) => {
        if (!canceled) setSupplementalThreads(threads);
      })
      .catch(() => {
        if (!canceled) setSupplementalThreads([]);
      });
    return () => {
      canceled = true;
    };
  }, [preferences?.view.hide.archived, preferences?.view.hide.hidden, rpc]);
  const liveThreads = useMemo(() => {
    if (preferences === null) return [];
    const visibility = new Map(
      supplementalThreads.map((thread) => [thread.id, thread.visibility]),
    );
    const known = new Set(sidebar.threads.map(({ id }) => id));
    const combined = [
      ...sidebar.threads,
      ...supplementalThreads
        .filter(({ id }) => !known.has(id))
        .map(supplementalSidebarThread),
    ];
    return combined.filter((thread) => {
      if (
        thread.isArchived
          ? preferences.view.hide.archived
          : preferences.view.hide.notArchived
      ) {
        return false;
      }
      const threadVisibility = visibility.get(thread.id) ?? "visible";
      return threadVisibility === "hidden"
        ? !preferences.view.hide.hidden
        : !preferences.view.hide.visible;
    });
  }, [preferences, sidebar.threads, supplementalThreads]);
  const liveThreadIds = useMemo(
    () => new Set(liveThreads.map(({ id }) => id)),
    [liveThreads],
  );
  const rootThreads = useMemo(
    () =>
      liveThreads.filter(
        ({ parentThreadId }) =>
          parentThreadId === null || !liveThreadIds.has(parentThreadId),
      ),
    [liveThreadIds, liveThreads],
  );
  const displayRootThreads = useMemo(() => {
    if (!normalizedSearch || searchResult.query !== normalizedSearch) {
      return rootThreads;
    }
    const known = new Set(rootThreads.map(({ id }) => id));
    const searchOnly = searchResult.threads.flatMap((thread) => {
      if (known.has(thread.id)) return [];
      known.add(thread.id);
      return [archivedSearchThread(thread)];
    });
    return [...rootThreads, ...searchOnly];
  }, [normalizedSearch, rootThreads, searchResult]);
  useEffect(() => {
    if (activeThreadId === null) {
      scopeSyncedForThreadId.current = null;
      return;
    }
    if (
      sidebar.status !== "ready" ||
      preferences === null ||
      scopeSyncedForThreadId.current === activeThreadId
    ) {
      return;
    }
    const root = rootForThread(activeThreadId, liveThreads);
    if (!root) return;
    scopeSyncedForThreadId.current = activeThreadId;
    if (preferences.view.scope.kind !== "group") return;
    const scope = preferences.view.scope.group;
    const groupId =
      scope.groupingKey === "builtin:projects"
        ? root.projectId
        : scope.groupingKey === "builtin:sections"
          ? (root.sectionId ?? "unsectioned")
          : null;
    if (groupId === null || groupId === scope.groupId) return;
    changePreferences((current) => ({
      ...current,
      view: {
        ...current.view,
        scope: {
          kind: "group",
          group: { groupingKey: scope.groupingKey, groupId },
        },
      },
    }));
  }, [
    activeThreadId,
    changePreferences,
    liveThreads,
    preferences,
    sidebar.status,
  ]);
  const refreshPreviews = useCallback(() => {
    const request = ++previewRequest.current;
    setPreviewsLoaded(false);
    if (
      sidebar.status !== "ready" ||
      preferences === null ||
      settings.values?.showMessagePreviews === false
    ) {
      setPreviews(new Map());
      setPreviewsLoaded(true);
      return;
    }
    void rpc
      .call("listPreviewsV1", {
        threadIds: liveThreads.map(({ id }) => id),
      })
      .then(({ previews: next }) => {
        if (previewRequest.current === request) {
          setPreviews(
            new Map(next.map(({ threadId, preview }) => [threadId, preview])),
          );
          setPreviewsLoaded(true);
        }
      })
      .catch(() => {
        if (previewRequest.current === request) setPreviewsLoaded(true);
      });
  }, [
    liveThreads,
    preferences,
    rpc,
    settings.values?.showMessagePreviews,
    sidebar.status,
  ]);
  useEffect(() => {
    refreshPreviews();
    return () => {
      previewRequest.current += 1;
    };
  }, [refreshPreviews]);
  useRealtime("previews-changed", () => {
    refreshPreviews();
  });
  // Inserted once: the icons arrive through the cascade, so neither a list that
  // moved nor an edited icon costs this plugin anything.
  useEffect(() => publishIconStyles(), []);
  const childrenByParent = useMemo(() => {
    const result = new Map<string, PluginSidebarThread[]>();
    for (const child of liveThreads.filter(
      ({ parentThreadId }) => parentThreadId && liveThreadIds.has(parentThreadId),
    )) {
      const list = result.get(child.parentThreadId!) ?? [];
      list.push(child);
      result.set(child.parentThreadId!, list);
    }
    if (preferences !== null && preferences.view.sort !== "manual") {
      for (const children of result.values()) {
        children.sort((left, right) =>
          compareSidebarThreads(preferences.view.sort, left, right),
        );
      }
    }
    return result;
  }, [liveThreadIds, liveThreads, preferences]);
  useEffect(() => {
    if (!normalizedSearch) {
      setSearchResult({
        query: "",
        status: "idle",
        threadIds: new Set(),
        threads: [],
      });
      return;
    }
    let canceled = false;
    setSearchResult({
      query: normalizedSearch,
      status: "loading",
      threadIds: new Set(),
      threads: [],
    });
    void rpc
      .call("searchThreadIdsV1", { query: searchQuery.trim() })
      .then(({ threadIds, threads }) => {
        if (!canceled) {
          setSearchResult({
            query: normalizedSearch,
            status: "ready",
            threadIds: new Set(threadIds),
            threads,
          });
        }
      })
      .catch(() => {
        if (!canceled) {
          setSearchResult({
            query: normalizedSearch,
            status: "error",
            threadIds: new Set(),
            threads: [],
          });
        }
      });
    return () => {
      canceled = true;
    };
  }, [normalizedSearch, rpc, searchAttempt, searchQuery]);
  const matchesSearch = useCallback(
    (root: PluginSidebarThread) => {
      if (!normalizedSearch) return true;
      if (searchResult.query !== normalizedSearch) return false;
      return [root, ...descendants(root.id, childrenByParent)].some(
        ({ id }) => searchResult.threadIds.has(id),
      );
    },
    [childrenByParent, normalizedSearch, searchResult],
  );
  const visiblePlacementIds = useMemo(
    () => new Set(placements.map(({ threadId }) => threadId)),
    [placements],
  );
  const supplementalThreadIds = useMemo(
    () => new Set(supplementalThreads.map(({ id }) => id)),
    [supplementalThreads],
  );
  const hasGroupScope = preferences?.view.scope.kind === "group";
  // Pinned membership and ordering come directly from bb. An active Ribbon
  // scope still controls which pinned roots are visible.
  const pinnedRoots = useMemo(
    () =>
      displayRootThreads.filter(
        (thread) =>
          thread.isPinned &&
          (Boolean(normalizedSearch) ||
            !hasGroupScope ||
            visiblePlacementIds.has(thread.id)) &&
          matchesSearch(thread),
      ),
    [
      displayRootThreads,
      hasGroupScope,
      matchesSearch,
      normalizedSearch,
      visiblePlacementIds,
    ],
  );
  const placementOrder = new Map(
    placements.map(({ threadId }, index) => [threadId, index]),
  );
  const displayGroupId = (thread: PluginSidebarThread) =>
    grouping
      ? placementByThread.get(thread.id)?.groupId ??
        (grouping.groupingKey === "builtin:projects"
          ? thread.projectId
          : grouping.groupingKey === "builtin:sections"
            ? (thread.sectionId ?? "unsectioned")
            : (normalizedSearch && thread.isArchived) ||
                supplementalThreadIds.has(thread.id)
              ? grouping.defaultGroupId
              : undefined)
      : "ungrouped";
  const unpinnedRoots = displayRootThreads.filter(
    (thread) =>
      !thread.isPinned &&
      (visiblePlacementIds.has(thread.id) ||
        supplementalThreadIds.has(thread.id) ||
        (Boolean(normalizedSearch) && thread.isArchived)) &&
      matchesSearch(thread),
  );
  if (preferences?.view.sort !== "manual") {
    unpinnedRoots.sort((left, right) =>
      compareSidebarThreads(preferences?.view.sort ?? "updated", left, right),
    );
  } else if (grouping) {
    unpinnedRoots.sort(
      (left, right) =>
        (placementOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
        (placementOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER),
    );
  }

  const groupDefinitions = useMemo(() => {
    if (!grouping) {
      return [
        {
          id: "ungrouped",
          label: "Threads",
          icon: undefined,
          visibleWhenEmpty: true,
          acceptsAssignments: false,
          defaultCollapsed: false,
        },
      ];
    }
    const known = new Set(grouping.groups.map(({ id }) => id));
    const orphanIds = placements
      .map(({ groupId }) => groupId)
      .filter((groupId, index, all) => !known.has(groupId) && all.indexOf(groupId) === index);
    return [
      ...grouping.groups,
      ...orphanIds.map((id) => ({
        id,
        label: `${id} (unavailable)`,
        icon: undefined,
        visibleWhenEmpty: true,
        acceptsAssignments: false,
        defaultCollapsed: false,
      })),
    ];
  }, [grouping, placements]);
  const matchingScope =
    !normalizedSearch &&
    preferences?.view.scope.kind === "group" &&
    preferences.view.scope.group.groupingKey === grouping?.groupingKey
      ? preferences.view.scope.group
      : null;
  const displayedGroupDefinitions = matchingScope
    ? groupDefinitions.filter(({ id }) => id === matchingScope.groupId)
    : groupDefinitions;
  const sections =
    snapshot?.groupings
      .find(({ groupingKey }) => groupingKey === "builtin:sections")
      ?.groups.filter(({ id }) => id !== "unsectioned") ?? [];

  const activeScope =
    preferences?.view.scope.kind === "group"
      ? preferences.view.scope.group
      : null;

  const submitEntityName = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (entityDialog?.kind !== "create-section" && entityDialog?.kind !== "rename") {
        return;
      }
      const name = entityDialog.name.trim();
      if (!name) return;
      setEntityPending(true);
      setMutationError(null);
      try {
        if (entityDialog.kind === "create-section") {
          await rpc.call("createSectionV1", { name });
        } else {
          await rpc.call("renameEntityV1", {
            groupingKey: entityDialog.scope.groupingKey,
            id: entityDialog.scope.groupId,
            name,
          });
        }
        setEntityDialog(null);
        await synchronize();
      } catch (error) {
        setMutationError(
          error instanceof Error ? error.message : "Could not save the entity",
        );
      } finally {
        setEntityPending(false);
      }
    },
    [entityDialog, rpc, synchronize],
  );

  const deleteEntity = useCallback(async () => {
    if (entityDialog?.kind !== "delete") return;
    setEntityPending(true);
    setMutationError(null);
    try {
      await rpc.call("deleteEntityV1", {
        groupingKey: entityDialog.scope.groupingKey,
        id: entityDialog.scope.groupId,
      });
      setEntityDialog(null);
      changePreferences((current) => ({
        ...current,
        view: { ...current.view, scope: { kind: "all" } },
      }));
      await synchronize();
    } catch (error) {
      setMutationError(
        error instanceof Error ? error.message : "Could not delete the entity",
      );
    } finally {
      setEntityPending(false);
    }
  }, [changePreferences, entityDialog, rpc, synchronize]);

  const updatePlacement = useCallback(
    async (
      threadId: string,
      groupId: string,
      anchor: { kind: "before"; threadId: string } | { kind: "end" },
    ) => {
      if (!preferences?.view.groupingKey) return;
      setMutationError(null);
      const input = {
        groupingKey: preferences.view.groupingKey,
        groupId,
        threadId,
        anchor,
        expectedRevision: revision,
        origin: "ui" as const,
      };
      let result = await rpc.call("updatePlacementV1", input);
      if (
        !result.ok &&
        result.error.code === "REVISION_CONFLICT" &&
        result.error.revision !== undefined
      ) {
        result = await rpc.call("updatePlacementV1", {
          ...input,
          expectedRevision: result.error.revision,
        });
      }
      if (!result.ok) {
        setMutationError(result.error.message);
        await loadPlacements();
        return;
      }
      await loadPlacements();
    },
    [loadPlacements, preferences, revision, rpc],
  );

  const updateSection = useCallback(
    async (threadId: string, sectionId: string | null) => {
      setMutationError(null);
      const result = await rpc.call("updatePlacementV1", {
        groupingKey: "builtin:sections",
        groupId: sectionId ?? "unsectioned",
        threadId,
        anchor: { kind: "preserve" },
        origin: "ui",
      });
      if (!result.ok) {
        setMutationError(result.error.message);
        return;
      }
      await synchronize();
      await loadPlacements();
    },
    [loadPlacements, rpc, synchronize],
  );

  const updateAssignment = useCallback(
    async (
      groupingKey: GroupingKey,
      threadId: string,
      groupId: string,
    ) => {
      setMutationError(null);
      const result = await rpc.call("updatePlacementV1", {
        groupingKey,
        groupId,
        threadId,
        anchor: { kind: "preserve" },
        origin: "ui",
      });
      if (!result.ok) {
        setMutationError(result.error.message);
        return;
      }
      await Promise.all([loadPlacements(), loadAssignmentPlacements()]);
    },
    [loadAssignmentPlacements, loadPlacements, rpc],
  );

  const clearDrag = useCallback(() => {
    setDraggingThreadId(null);
    setDragDestination(null);
  }, []);

  if (fatalError) {
    return (
      <div>
        <SidebarMessage
          action={{
            label: "Retry",
            onClick: () => {
              setFatalError(null);
              void synchronize().catch((error: unknown) =>
                setFatalError(
                  error instanceof Error
                    ? error.message
                    : "Ribbon sidebar unavailable",
                ),
              );
            },
          }}
          icon="AlertCircle"
        >
          Ribbon sidebar unavailable: {fatalError}
        </SidebarMessage>
        <OriginalThreadList />
      </div>
    );
  }
  if (!snapshot || !preferences) {
    return (
      <div aria-label="Loading Ribbon sidebar" className="space-y-1.5 px-2 pt-1">
        {["w-2/3", "w-1/2"].map((width) => (
          <div className="flex h-7 animate-pulse items-center gap-2 rounded-md" key={width}>
            <span className="size-4 shrink-0 rounded-md bg-sidebar-border/60" />
            <span className={`h-3 ${width} rounded-sm bg-sidebar-border/50`} />
          </div>
        ))}
      </div>
    );
  }

  const movingThread = draggingThreadId
    ? rootThreads.find(({ id }) => id === draggingThreadId)
    : undefined;
  const movingPlacement = movingThread
    ? placementByThread.get(movingThread.id)
    : undefined;
  const canDropPlacementInto = (groupId: string) => {
    if (!grouping || !movingThread || movingThread.isPinned || !movingPlacement) {
      return false;
    }
    if (movingPlacement.groupId === groupId) return true;
    const destination = groupDefinitions.find(({ id }) => id === groupId);
    return grouping.membershipWritable && destination?.acceptsAssignments === true;
  };
  const scopeFilterValue: ScopeFilterValue = activeScope;
  const hasDisplayedThreads = pinnedRoots.length + unpinnedRoots.length > 0;
  const pinnedSectionCollapsed =
    !normalizedSearch && preferences.collapsed.has("builtin:pinned");
  const pinnedActivePreview =
    pinnedSectionCollapsed && activeThreadId !== null
      ? pinnedRoots
          .flatMap((root) => [
            root,
            ...descendants(root.id, childrenByParent),
          ])
          .find(({ id }) => id === activeThreadId)
      : undefined;
  const emptyMessage =
    normalizedSearch !== ""
      ? "No matching threads"
      : preferences.view.scope.kind === "group" &&
          preferences.view.scope.group.groupingKey === "builtin:projects"
        ? "No threads in this project"
        : preferences.view.scope.kind === "group" &&
            preferences.view.scope.group.groupingKey === "builtin:sections"
          ? "No threads in this section"
          : "No threads yet";

  async function updatePinnedOrder(
    threadId: string,
    beforeThreadId: string | null,
  ) {
    const remaining = pinnedRoots.filter(({ id }) => id !== threadId);
    const insertionIndex =
      beforeThreadId === null
        ? remaining.length
        : remaining.findIndex(({ id }) => id === beforeThreadId);
    if (insertionIndex < 0) return;
    setMutationError(null);
    try {
      await rpc.call("reorderPinnedV1", {
        threadId,
        previousThreadId: remaining[insertionIndex - 1]?.id ?? null,
        nextThreadId: remaining[insertionIndex]?.id ?? null,
      });
    } catch (error) {
      setMutationError(
        error instanceof Error ? error.message : "Could not reorder pinned thread",
      );
    } finally {
      clearDrag();
    }
  }

  const renderRoot = (
    root: PluginSidebarThread,
    depth = 0,
    includeDescendants = true,
    rowContext?: {
      kind: "pinned" | "placement";
      roots: readonly PluginSidebarThread[];
      groupId?: string;
    },
  ) => {
    const destination = placementByThread.get(root.id);
    const children = childrenByParent.get(root.id) ?? [];
    const childrenCollapsed = collapsedThreadIds.has(root.id);
    const indicatorThread =
      childrenCollapsed && children.length > 0
        ? (groupIndicator([root, ...descendants(root.id, childrenByParent)]) ?? root)
        : root;
    const reorderable =
      depth === 0 &&
      preferences.view.sort === "manual" &&
      !normalizedSearch &&
      !root.isArchived &&
      rowContext !== undefined;
    return (
      <Fragment key={root.id}>
        <ThreadRow
          active={activeThreadId === root.id}
          alignAdornmentsToEntireItem={
            settings.values?.threadAdornmentAlignment === "Entire item"
          }
          actions={actions}
          assignments={
            depth === 0
              ? orderedGroupings(snapshot.groupings).flatMap((candidate) => {
                  if (
                    !candidate.available ||
                    !candidate.membershipWritable ||
                    candidate.groupingKey === "builtin:sections"
                  ) {
                    return [];
                  }
                  const current = assignmentPlacements
                    .get(candidate.groupingKey)
                    ?.get(root.id);
                  if (!current) return [];
                  return [
                    {
                      groupingKey: candidate.groupingKey,
                      currentGroupId: current.groupId,
                      groups: candidate.groups,
                      icon: candidate.icon,
                      singularLabel: candidate.singularLabel,
                      onSetGroup: (groupId: string) => {
                        void updateAssignment(
                          candidate.groupingKey as GroupingKey,
                          root.id,
                          groupId,
                        );
                      },
                    },
                  ];
                })
              : []
          }
          childrenCollapsed={childrenCollapsed}
          depth={depth}
          hasChildren={children.length > 0}
          indicatorThread={indicatorThread}
          dragging={draggingThreadId === root.id}
          onDragEnd={clearDrag}
          onDragOver={(event) => {
            if (
              !reorderable ||
              !draggingThreadId ||
              !movingThread ||
              (rowContext.kind === "pinned") !== movingThread.isPinned ||
              (rowContext.kind === "placement" &&
                !canDropPlacementInto(rowContext.groupId!))
            ) {
              setDragDestination(null);
              return;
            }
            event.preventDefault();
            event.stopPropagation();
            const bounds = event.currentTarget.getBoundingClientRect();
            const after = event.clientY > bounds.top + bounds.height / 2;
            const index = rowContext.roots.findIndex(({ id }) => id === root.id);
            const beforeThreadId = after
              ? (rowContext.roots[index + 1]?.id ?? null)
              : root.id;
            setDragDestination(
              rowContext.kind === "pinned"
                ? {
                    kind: "pinned",
                    beforeThreadId,
                    indicatorBefore: after ? null : root.id,
                    indicatorAfter: after ? root.id : null,
                  }
                : {
                    kind: "placement",
                    groupId: rowContext.groupId!,
                    beforeThreadId,
                    indicatorBefore: after ? null : root.id,
                    indicatorAfter: after ? root.id : null,
                  },
            );
          }}
          onDragStart={(event) => {
            if (!reorderable) return;
            event.stopPropagation();
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", root.id);
            setDraggingThreadId(root.id);
          }}
          onDropBefore={(event) => {
            if (!reorderable || !draggingThreadId) return;
            event.preventDefault();
            event.stopPropagation();
            if (draggingThreadId === root.id) {
              clearDrag();
              return;
            }
            if (!dragDestination) return;
            if (dragDestination.kind === "pinned") {
              void updatePinnedOrder(
                draggingThreadId,
                dragDestination.beforeThreadId,
              );
            } else {
              if (!canDropPlacementInto(dragDestination.groupId)) {
                clearDrag();
                return;
              }
              void updatePlacement(
                draggingThreadId,
                dragDestination.groupId,
                dragDestination.beforeThreadId === null
                  ? { kind: "end" }
                  : {
                      kind: "before",
                      threadId: dragDestination.beforeThreadId,
                    },
              );
              clearDrag();
            }
          }}
          onNewSection={() =>
            setEntityDialog({ kind: "create-section", name: "" })
          }
          onOpen={(split) => {
            if (root.isArchived) {
              window.location.assign(
                `/projects/${encodeURIComponent(root.projectId)}/threads/${encodeURIComponent(root.id)}`,
              );
            } else {
              actions.open(root.id, { split });
            }
            onNavigate();
          }}
          onRename={() => setThreadRename({ id: root.id, name: title(root) })}
          onSetSection={(sectionId) => {
            void updateSection(root.id, sectionId);
          }}
          onToggleChildren={() => {
            setCollapsedThreadIds((current) => {
              const next = new Set(current);
              if (next.has(root.id)) next.delete(root.id);
              else next.add(root.id);
              return next;
            });
          }}
          placementDisabled={Boolean(normalizedSearch)}
          preview={
            settings.values?.showMessagePreviews === false
              ? null
              : (previews.get(root.id) ?? null)
          }
          reorderable={reorderable}
          sections={sections}
          showDropAfter={dragDestination?.indicatorAfter === root.id}
          showDropBefore={dragDestination?.indicatorBefore === root.id}
          thread={root}
        />
        {includeDescendants && !childrenCollapsed
          ? children.map((child) =>
              renderRoot(child, depth + 1),
            )
          : null}
      </Fragment>
    );
  };

  return (
    <div
      className="relative flex w-full min-w-0 flex-col"
      data-sidebar="group"
      data-sidebar-sticky-density="compact-actions"
      data-sidebar-sticky-stack=""
      data-ribbon-sidebar-ready={
        placementsLoaded && previewsLoaded ? "" : undefined
      }
      data-ribbon-sidebar-root=""
      data-ribbon-sidebar-scope-group-id={
        normalizedSearch ? undefined : activeScope?.groupId
      }
      data-ribbon-sidebar-scope-grouping-key={
        normalizedSearch ? undefined : activeScope?.groupingKey
      }
      onKeyDown={(event) => {
        if (event.key === "Escape") clearDrag();
      }}
      style={
        {
          "--bb-sidebar-sticky-label-top":
            "calc(var(--bb-sidebar-sticky-stack-padding-top) + 2.75rem)",
        } as CSSProperties
      }
    >
      {settings.values?.showProjectsAndSections !== false ? (
        <SidebarTopControls>
          <ScopeFilter
            filterGroupingKey={preferences.view.filterGroupingKey}
            groupings={orderedGroupings(
              snapshot.groupings.filter(({ available }) => available),
            )}
            onAddProjectLocalPath={(project) => {
              void rpc
                .call("addProjectLocalPathV1", { projectId: project.id })
                .then(() => synchronize())
                .catch((error: unknown) =>
                  setMutationError(
                    error instanceof Error
                      ? error.message
                      : "Could not add local path",
                  ),
                );
            }}
            onChange={(next) =>
              changePreferences((current) => ({
                ...current,
                view: changeSidebarScope(
                  current.view,
                  next === null
                    ? { kind: "all" }
                    : { kind: "group", group: next },
                ),
              }))
            }
            onNewProject={() => {
              void rpc
                .call("createProjectV1", null)
                .then(() => synchronize())
                .catch((error: unknown) =>
                  setMutationError(
                    error instanceof Error
                      ? error.message
                      : "Could not create project",
                  ),
                );
            }}
            onNewSection={() =>
              setEntityDialog({ kind: "create-section", name: "" })
            }
            onOpenProjectSettings={(project) => {
              window.location.assign(
                `/projects/${encodeURIComponent(project.id)}/settings`,
              );
              onNavigate();
            }}
            onRemoveProject={(project) =>
              setEntityDialog({
                kind: "delete",
                scope: {
                  groupingKey: "builtin:projects",
                  groupId: project.id,
                },
                label: project.name,
              })
            }
            onRemoveSection={(section) =>
              setEntityDialog({
                kind: "delete",
                scope: {
                  groupingKey: "builtin:sections",
                  groupId: section.id,
                },
                label: section.name,
              })
            }
            onRenameProject={(project) =>
              setEntityDialog({
                kind: "rename",
                scope: {
                  groupingKey: "builtin:projects",
                  groupId: project.id,
                },
                label: project.name,
                name: project.name,
              })
            }
            onRenameSection={(section) =>
              setEntityDialog({
                kind: "rename",
                scope: {
                  groupingKey: "builtin:sections",
                  groupId: section.id,
                },
                label: section.name,
                name: section.name,
              })
            }
            projectActionStates={projectActionStates}
            projects={sidebar.projects}
            sections={sections.map(({ id, label }) => ({ id, name: label }))}
            value={scopeFilterValue}
          />
          <SidebarDisplayOptionsMenu
            groupings={orderedGroupings(
              snapshot.groupings.filter(({ available }) => available),
            )}
            headingsGroupingKey={preferences.view.groupingKey}
            hide={preferences.view.hide}
            onHeadingsGroupingChange={(groupingKey) =>
              changePreferences((current) =>
                current.view.groupingKey === groupingKey
                  ? current
                  : {
                      ...current,
                      view: changeSidebarGrouping(current.view, groupingKey),
                    },
              )
            }
            onHideChange={(kind, hidden) =>
              changePreferences((current) => ({
                ...current,
                view: {
                  ...current.view,
                  hide: { ...current.view.hide, [kind]: hidden },
                },
              }))
            }
            onPagesGroupingChange={(groupingKey) =>
              changePreferences((current) => ({
                ...current,
                view: changeSidebarPagesGrouping(current.view, groupingKey),
              }))
            }
            onSortChange={(sort) =>
              changePreferences((current) => ({
                ...current,
                view: { ...current.view, sort },
              }))
            }
            pagesGroupingKey={preferences.view.filterGroupingKey}
            sort={preferences.view.sort}
          />
        </SidebarTopControls>
      ) : null}
      {mutationError ? (
        <div className="rounded-md bg-destructive/10 px-2 py-1 text-xs text-destructive">
          {mutationError}
        </div>
      ) : null}

      <Dialog
        open={entityDialog !== null}
        onOpenChange={(open) => {
          if (!open && !entityPending) setEntityDialog(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {entityDialog?.kind === "create-section"
                ? "New section"
                : entityDialog?.kind === "rename"
                  ? `Rename ${entityDialog.label}`
                  : entityDialog?.kind === "delete"
                    ? `Delete ${entityDialog.label}?`
                    : "Edit entity"}
            </DialogTitle>
            <DialogDescription>
              {entityDialog?.kind === "delete"
                ? "This removes the group from bb."
                : entityDialog?.kind === "create-section"
                  ? "Create a section for threads."
                  : "Choose a new name for this section."}
            </DialogDescription>
          </DialogHeader>
          {entityDialog?.kind === "create-section" ||
          entityDialog?.kind === "rename" ? (
            <form className="space-y-4" onSubmit={(event) => void submitEntityName(event)}>
              <Input
                aria-label={
                  entityDialog.kind === "create-section" ? "Section name" : "New name"
                }
                autoFocus
                disabled={entityPending}
                onChange={(event) =>
                  setEntityDialog((current) =>
                    current?.kind === "create-section" || current?.kind === "rename"
                      ? { ...current, name: event.target.value }
                      : current,
                  )
                }
                value={entityDialog.name}
              />
              <DialogFooter>
                <Button disabled={entityPending || !entityDialog.name.trim()} type="submit">
                  {entityDialog.kind === "create-section" ? "Create section" : "Rename"}
                </Button>
              </DialogFooter>
            </form>
          ) : entityDialog?.kind === "delete" ? (
            <DialogFooter>
              <Button
                disabled={entityPending}
                onClick={() => void deleteEntity()}
                type="button"
                variant="destructive"
              >
                Delete
              </Button>
            </DialogFooter>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={threadRename !== null}
        onOpenChange={(open) => {
          if (!open && !threadRenamePending) setThreadRename(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename thread</DialogTitle>
            <DialogDescription>Choose the title shown in bb.</DialogDescription>
          </DialogHeader>
          {threadRename ? (
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                const nextTitle = threadRename.name.trim();
                if (!nextTitle) return;
                setThreadRenamePending(true);
                void Promise.resolve(actions.rename(threadRename.id, nextTitle))
                  .then(() => setThreadRename(null))
                  .catch((error: unknown) => {
                    setMutationError(
                      error instanceof Error ? error.message : "Could not rename thread",
                    );
                  })
                  .finally(() => setThreadRenamePending(false));
              }}
            >
              <Input
                aria-label="Thread title"
                autoFocus
                disabled={threadRenamePending}
                onChange={(event) =>
                  setThreadRename((current) =>
                    current ? { ...current, name: event.target.value } : current,
                  )
                }
                value={threadRename.name}
              />
              <DialogFooter>
                <Button
                  disabled={threadRenamePending || !threadRename.name.trim()}
                  type="submit"
                >
                  Rename
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>

      {normalizedSearch && searchResult.status === "loading" ? (
        <SidebarMessage icon="Loading" loading>
          Searching threads…
        </SidebarMessage>
      ) : normalizedSearch && searchResult.status === "error" ? (
        <SidebarMessage
          action={{
            label: "Retry",
            onClick: () => setSearchAttempt((current) => current + 1),
          }}
          icon="AlertCircle"
        >
          Search failed.
        </SidebarMessage>
      ) : !hasDisplayedThreads ? (
        <SidebarMessage icon="CircleQuestion">{emptyMessage}</SidebarMessage>
      ) : (
        <div className="space-y-4">
      {pinnedRoots.length > 0 ? (
        <section
          aria-label="Pinned threads"
          className={`group/sidebar-section min-w-0 rounded-md transition-colors ${
            dragDestination?.kind === "pinned" &&
            dragDestination.beforeThreadId === null
              ? "bg-sidebar-accent/60"
              : ""
          }`}
          data-sidebar-sticky-group=""
          onDragOver={(event) => {
            if (!draggingThreadId || !movingThread?.isPinned) {
              setDragDestination(null);
              return;
            }
            event.preventDefault();
            setDragDestination({
              kind: "pinned",
              beforeThreadId: null,
              indicatorBefore: null,
              indicatorAfter: null,
            });
          }}
          onDrop={(event) => {
            if (!draggingThreadId || !movingThread?.isPinned) return;
            event.preventDefault();
            void updatePinnedOrder(draggingThreadId, null);
          }}
        >
          <div
            className={`bb-sidebar-hover-actions-row sticky z-[60] flex h-6 items-center rounded-md bg-sidebar pl-2 pr-0 ${CHROME_SECTION_LABEL_CLASS} max-md:pointer-coarse:h-9`}
            data-sidebar="group-label"
            data-sidebar-sticky-tier="label"
          >
            <span className="flex min-w-0 flex-1 items-center">
              <span className="min-w-0 truncate">Pinned</span>
              <button
                aria-expanded={!pinnedSectionCollapsed}
                aria-label={
                  pinnedSectionCollapsed
                    ? "Expand Pinned section"
                    : "Collapse Pinned section"
                }
                className={`${
                  pinnedSectionCollapsed ? "" : "bb-sidebar-hover-actions"
                } inline-flex size-6 shrink-0 items-center justify-center rounded-md text-subtle-foreground outline-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2`}
                onClick={() =>
                  changePreferences((current) => {
                    const collapsed = new Set(current.collapsed);
                    if (collapsed.has("builtin:pinned")) {
                      collapsed.delete("builtin:pinned");
                    } else {
                      collapsed.add("builtin:pinned");
                    }
                    return { ...current, collapsed };
                  })
                }
                type="button"
              >
                <Icon
                  aria-hidden
                  className={`size-3 transition-transform duration-150 ${
                    pinnedSectionCollapsed ? "" : "rotate-90"
                  }`}
                  name="ChevronRight"
                />
              </button>
            </span>
            <GroupHeaderMenu
              actions={null}
              activeGroupingKey={grouping?.groupingKey ?? null}
              groupings={orderedGroupings(
                snapshot.groupings.filter(({ available }) => available),
              )}
              label="Pinned"
              onGroupingChange={(groupingKey) =>
                changePreferences((current) => ({
                  ...current,
                  view: changeSidebarGrouping(
                    current.view,
                    groupingKey as GroupingKey | null,
                  ),
                }))
              }
            />
          </div>
          {!pinnedSectionCollapsed ? (
            <ul>
              {pinnedRoots.map((root) =>
                renderRoot(root, 0, true, {
                  kind: "pinned",
                  roots: pinnedRoots,
                }),
              )}
            </ul>
          ) : pinnedActivePreview ? (
            <ul>{renderRoot(pinnedActivePreview, 0, false)}</ul>
          ) : null}
        </section>
      ) : null}

      {displayedGroupDefinitions.map((group) => {
        const roots = unpinnedRoots.filter(
          (thread) => displayGroupId(thread) === group.id,
        );
        if (normalizedSearch && roots.length === 0) return null;
        if (roots.length === 0 && !group.visibleWhenEmpty) return null;
        const ref = `${grouping?.groupingKey ?? "ungrouped"}/${group.id}`;
        const collapsed =
          grouping !== undefined &&
          !normalizedSearch &&
          preferences.collapsed.has(ref);
        const groupThreads = roots.flatMap((root) => [
          root,
          ...descendants(root.id, childrenByParent),
        ]);
        const activityThread =
          collapsed &&
          (grouping?.groupingKey === "plugin:thread-stages:stages" ||
            settings.values?.showCollapsedGroupIndicators === true)
            ? groupIndicator(groupThreads)
            : null;
        const activePreview =
          collapsed && activeThreadId !== null
            ? groupThreads.find(({ id }) => id === activeThreadId)
            : undefined;
        const sameKeyScope =
          preferences.view.scope.kind === "group" &&
          preferences.view.scope.group.groupingKey === grouping?.groupingKey &&
          preferences.view.scope.group.groupId === group.id;
        // A group heading takes the same icon its rows do: whichever was chosen
        // for that project or section, or this plugin's own glyph until one is.
        const entityGroupIcon: { kind: "project" | "section"; fallback: IconFallback } | undefined =
          grouping?.groupingKey === "builtin:projects"
            ? {
                kind: "project",
                fallback: sidebar.projects.find(({ id }) => id === group.id)
                  ?.isPersonal
                  ? "personal"
                  : "project",
              }
            : grouping?.groupingKey === "builtin:sections"
              ? { kind: "section", fallback: "section" }
              : undefined;
        const unorganizedGroup =
          grouping?.groupingKey === "builtin:sections" &&
          group.id === "unsectioned";
        const section =
          grouping?.groupingKey === "builtin:sections" && !unorganizedGroup
            ? sections.find(({ id }) => id === group.id)
            : undefined;
        const project =
          grouping?.groupingKey === "builtin:projects"
            ? sidebar.projects.find(({ id }) => id === group.id)
            : undefined;
        const headerActions: HeaderGroupActions | null = section
          ? {
              kind: "section",
              onRemove: () =>
                setEntityDialog({
                  kind: "delete",
                  scope: {
                    groupingKey: "builtin:sections",
                    groupId: section.id,
                  },
                  label: section.label,
                }),
              onRename: () =>
                setEntityDialog({
                  kind: "rename",
                  scope: {
                    groupingKey: "builtin:sections",
                    groupId: section.id,
                  },
                  label: section.label,
                  name: section.label,
                }),
            }
          : project && !project.isPersonal
            ? {
                kind: "project",
                canAddLocalPath:
                  projectActionStates.get(project.id)?.canAddLocalPath ?? false,
                onAddLocalPath: () => {
                  void rpc
                    .call("addProjectLocalPathV1", { projectId: project.id })
                    .then(() => synchronize())
                    .catch((error: unknown) =>
                      setMutationError(
                        error instanceof Error
                          ? error.message
                          : "Could not add local path",
                      ),
                    );
                },
                onOpenSettings: () => {
                  window.location.assign(
                    `/projects/${encodeURIComponent(project.id)}/settings`,
                  );
                  onNavigate();
                },
                onRemove: () =>
                  setEntityDialog({
                    kind: "delete",
                    scope: {
                      groupingKey: "builtin:projects",
                      groupId: project.id,
                    },
                    label: project.name,
                  }),
                onRename: () =>
                  setEntityDialog({
                    kind: "rename",
                    scope: {
                      groupingKey: "builtin:projects",
                      groupId: project.id,
                    },
                    label: project.name,
                    name: project.name,
                  }),
              }
            : null;
        return (
          <section
            aria-label={`${group.label} group`}
            className={`group/sidebar-section min-w-0 rounded-md transition-colors ${
              dragDestination?.kind === "placement" &&
              dragDestination.groupId === group.id &&
              dragDestination.beforeThreadId === null
                ? "bg-sidebar-accent/60"
                : ""
            }`}
            data-sidebar-sticky-group=""
            data-testid={sameKeyScope ? "scope-end-drop-target" : undefined}
            key={group.id}
            onDragOver={(event) => {
              if (!canDropPlacementInto(group.id)) {
                setDragDestination(null);
                return;
              }
              event.preventDefault();
              setDragDestination({
                kind: "placement",
                groupId: group.id,
                beforeThreadId: null,
                indicatorBefore: null,
                indicatorAfter: null,
              });
            }}
            onDrop={(event) => {
              if (!draggingThreadId || !canDropPlacementInto(group.id)) return;
              event.preventDefault();
              void updatePlacement(draggingThreadId, group.id, { kind: "end" });
              clearDrag();
            }}
          >
            {!sameKeyScope ? (
              <div
                className={`bb-sidebar-hover-actions-row sticky z-[60] flex h-6 items-center rounded-md bg-sidebar pl-2 pr-0 ${CHROME_SECTION_LABEL_CLASS} transition-colors max-md:pointer-coarse:h-9`}
                data-sidebar="group-label"
                data-sidebar-sticky-tier="label"
              >
                <span className="relative z-10 flex min-w-0 flex-1 items-center gap-1 text-left">
                  <span className="flex min-w-0 items-center gap-2 text-left">
                    {settings.values?.showGroupHeaderIcons !== false &&
                    unorganizedGroup ? (
                      <UnorganizedIcon />
                    ) : settings.values?.showGroupHeaderIcons !== false &&
                      entityGroupIcon ? (
                      <span
                        aria-hidden
                        {...(entityGroupIcon.kind === "project"
                          ? { "data-ribbon-icons-project": group.id }
                          : { "data-ribbon-icons-section": group.id })}
                        data-ribbon-sidebar-icon={entityGroupIcon.fallback}
                      />
                    ) : settings.values?.showGroupHeaderIcons !== false &&
                      group.icon ? (
                      <ProviderIcon
                        icon={group.icon}
                        label={`${group.label} group icon`}
                      />
                    ) : null}
                    <span className="min-w-0 truncate" title={group.label}>
                      {group.label}
                    </span>
                  </span>
                  {grouping ? <button
                    aria-expanded={!collapsed}
                    aria-label={
                      collapsed
                        ? `Expand ${group.label} section`
                        : `Collapse ${group.label} section`
                    }
                    className={`${collapsed ? "" : "bb-sidebar-hover-actions"} relative z-20 inline-flex size-6 shrink-0 items-center justify-center rounded-md text-subtle-foreground outline-none ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2`}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      changePreferences((current) => {
                        const next = new Set(current.collapsed);
                        if (next.has(ref)) next.delete(ref);
                        else next.add(ref);
                        return { ...current, collapsed: next };
                      });
                    }}
                    type="button"
                  >
                    <Icon
                      aria-hidden
                      className={`size-3 transition-transform duration-150 ${collapsed ? "" : "rotate-90"}`}
                      name="ChevronRight"
                    />
                  </button> : null}
                </span>
                <GroupHeaderMenu
                  actions={headerActions}
                  activeGroupingKey={grouping?.groupingKey ?? null}
                  groupings={orderedGroupings(
                    snapshot.groupings.filter(({ available }) => available),
                  )}
                  label={group.label}
                  onGroupingChange={(groupingKey) =>
                    changePreferences((current) => ({
                      ...current,
                      view: changeSidebarGrouping(
                        current.view,
                        groupingKey as GroupingKey | null,
                      ),
                    }))
                  }
                  trailing={
                    activityThread ? (
                      <ThreadIndicator
                        indicator={activityThread.indicator}
                        label={activityThread.indicatorLabel}
                      />
                    ) : collapsed && roots.length > 0 ? (
                      <span
                        aria-label={`${roots.length} ${roots.length === 1 ? "thread" : "threads"}`}
                        className="tabular-nums text-xs text-subtle-foreground/60"
                      >
                        {roots.length}
                      </span>
                    ) : null
                  }
                />
              </div>
            ) : null}
            <div className={grouping && !collapsed ? "mt-1" : undefined}>
              {!collapsed
                ? (
                    <ul>
                      {roots.map((root) =>
                        renderRoot(
                          root,
                          0,
                          true,
                          grouping
                            ? {
                                kind: "placement",
                                roots,
                                groupId: group.id,
                              }
                            : undefined,
                        ),
                      )}
                    </ul>
                  )
                : activePreview
                  ? (
                      <ul>
                        {renderRoot(activePreview, 0, false, {
                          kind: "placement",
                          roots,
                          groupId: group.id,
                        })}
                      </ul>
                    )
                  : null}
            </div>
          </section>
        );
      })}
        </div>
      )}
    </div>
  );
}

export default definePluginApp((app) => {
  app.slots.experimental_threadList({
    id: "ribbon-sidebar",
    title: "Ribbon sidebar",
    description: "Organize every thread grouping through one Ribbon sidebar.",
    component: RibbonSidebarList,
  });
  app.contentScripts.register({
    id: "new-thread-group",
    mount({ signal }) {
      const dispose = mountGroupAwareThreadCreation(window);
      signal.addEventListener("abort", dispose, { once: true });
      return dispose;
    },
  });
  app.contentScripts.register({
    id: "sidebar-content-spacing",
    mount({ signal }) {
      return mountSidebarContentSpacing(signal);
    },
  });
});
