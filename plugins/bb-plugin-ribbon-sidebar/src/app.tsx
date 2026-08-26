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
import { HugeiconsIcon } from "@hugeicons/react";
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
import type { rpcContract } from "./server";
import type { GroupingKey, PlacementRecordV1 } from "./placement-store";
import {
  loadSidebarPreferences,
  saveSidebarPreferences,
  type GroupRef,
  type SidebarPreferences,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./vendor/components/ui/dropdown-menu";
import { Input } from "./vendor/components/ui/input";
import { groupIndicator, ThreadIndicator } from "./thread-indicator";
import {
  fetchEntityIcons,
  subscribeToIconChanges,
  type EntityIconView,
} from "./icons";
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
import type { ScopeFilterValue } from "./scope-filter-value";

const COLLAPSED_THREADS_STORAGE_KEY = "bb.sidebar.collapsedThreads";
const THREAD_STAGES_GROUPING_KEY = "plugin:thread-stages:stages";

type SidebarSnapshot = z.output<
  typeof rpcContract.sidebarSnapshotV1.output
>;
type SnapshotGrouping = SidebarSnapshot["groupings"][number];
type SearchThread = z.output<
  typeof rpcContract.searchThreadIdsV1.output
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

function GroupingActionIcon({ grouping }: { grouping: SnapshotGrouping }) {
  const activeStageIcon =
    grouping.groupingKey === THREAD_STAGES_GROUPING_KEY
      ? grouping.groups.find(({ id }) => id === "Active")?.icon
      : undefined;

  return activeStageIcon ? (
    <ProviderIcon icon={activeStageIcon} label="Active stage" />
  ) : (
    <Icon aria-hidden className="size-3.5" name="Workflow" />
  );
}

function title(thread: PluginSidebarThread) {
  return thread.title ?? thread.titleFallback ?? "Untitled thread";
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

function ThreadRow({
  active,
  actions,
  assignment,
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
  projectIcon,
  reorderable,
  sectionIcons,
  sections,
  showDropAfter,
  showDropBefore,
  thread,
}: {
  active: boolean;
  actions: ReturnType<typeof experimental_useSidebarThreadActions>;
  assignment?: {
    currentGroupId: string;
    groups: readonly AssignmentGroupOption[];
    singularLabel: string;
    onSetGroup(groupId: string): void;
  };
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
  projectIcon: EntityIconView | null;
  reorderable: boolean;
  sectionIcons: ReadonlyMap<string, EntityIconView>;
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
  const commonMenuProps = {
    actions,
    assignment,
    disabled: placementDisabled,
    onNewSection,
    onRename,
    onSetSection,
    sectionIcons,
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
        className={`bb-sidebar-hover-actions-row group/thread-row relative flex w-full items-center gap-2 rounded-md py-1 pr-0 text-sm transition-colors max-md:pointer-coarse:py-2.5 ${
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
        <span className="flex min-w-0 flex-1 items-center gap-2">
          {projectIcon ? (
            <HugeiconsIcon
              aria-hidden
              className="size-4 shrink-0"
              data-project-icon={projectIcon.name}
              icon={projectIcon.glyph}
              style={projectIcon.color === null ? undefined : { color: projectIcon.color }}
            />
          ) : null}
          <span className="flex min-w-0 flex-1 flex-col justify-center leading-none">
            <span className="truncate leading-5" title={accessibleTitle}>{rowTitle}</span>
            {preview ? (
              <span className="truncate text-[11px] leading-4 text-subtle-foreground/75" title={preview}>
                {preview}
              </span>
            ) : null}
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
        <span className="relative -my-1 flex w-7 shrink-0 self-stretch items-center justify-end max-md:pointer-coarse:-my-2.5 max-md:pointer-coarse:w-9">
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
            ) : indicatorThread.indicator !== "none" ? (
              <span
                className="inline-flex size-4 items-center justify-center"
                data-sidebar-thread-trailing-indicator=""
              >
                <ThreadIndicator
                  indicator={indicatorThread.indicator}
                  label={indicatorThread.indicatorLabel}
                />
              </span>
            ) : null}
          </span>
          {!thread.isArchived ? (
            <span
              className="bb-sidebar-hover-actions absolute inset-0 z-10 flex items-center justify-end max-md:pointer-coarse:hidden"
              data-sidebar-hover-actions-open={actionsOpen ? "true" : undefined}
            >
              <ThreadActionsDropdown
                {...commonMenuProps}
                onOpenChange={setDropdownOpen}
              />
            </span>
          ) : null}
        </span>
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
  const [revision, setRevision] = useState(0);
  const [previews, setPreviews] = useState<ReadonlyMap<string, string | null>>(
    new Map(),
  );
  const [projectIcons, setProjectIcons] = useState<
    ReadonlyMap<string, EntityIconView>
  >(new Map());
  const [sectionIcons, setSectionIcons] = useState<
    ReadonlyMap<string, EntityIconView>
  >(new Map());
  const [projectActionStates, setProjectActionStates] = useState<
    ReadonlyMap<string, { canAddLocalPath: boolean }>
  >(new Map());
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
    setPlacementsLoaded(false);
    let threadIds: string[] | undefined;
    if (
      !normalizedSearch &&
      preferences.view.scope.kind === "group" &&
      preferences.view.scope.group.groupingKey !==
        preferences.view.groupingKey
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
      groupingKey: preferences.view.groupingKey,
      ...(threadIds === undefined ? {} : { threadIds }),
    });
    if (!result.ok) throw new Error(result.error.message);
    setPlacements(result.value.items as PlacementRecordV1[]);
    setRevision(result.value.revision);
    setPlacementsLoaded(true);
  }, [normalizedSearch, preferences, rpc]);

  useEffect(() => {
    void loadPlacements().catch((error: unknown) => {
      setFatalError(
        error instanceof Error ? error.message : "Could not load placements",
      );
    });
  }, [loadPlacements]);

  useRealtime("placements-changed", () => {
    void loadPlacements();
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

  const grouping = snapshot?.groupings.find(
    ({ groupingKey }) => groupingKey === preferences?.view.groupingKey,
  );
  const placementByThread = useMemo(
    () => new Map(placements.map((placement) => [placement.threadId, placement])),
    [placements],
  );
  const liveThreads = useMemo(
    () => sidebar.threads.filter((thread) => !thread.isArchived),
    [sidebar.threads],
  );
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
  useEffect(() => {
    setPreviewsLoaded(false);
    if (
      sidebar.status !== "ready" ||
      settings.values?.showMessagePreviews === false
    ) {
      setPreviews(new Map());
      setPreviewsLoaded(true);
      return;
    }
    let canceled = false;
    void rpc
      .call("listPreviewsV1", {
        threadIds: liveThreads.map(({ id }) => id),
      })
      .then(({ previews: next }) => {
        if (!canceled) {
          setPreviews(
            new Map(next.map(({ threadId, preview }) => [threadId, preview])),
          );
          setPreviewsLoaded(true);
        }
      })
      .catch(() => {
        if (!canceled) setPreviewsLoaded(true);
      });
    return () => {
      canceled = true;
    };
  }, [liveThreads, rpc, settings.values?.showMessagePreviews, sidebar.status]);
  useEffect(() => {
    let canceled = false;
    const refresh = () => {
      void fetchEntityIcons(
        () => rpc.call("listEntityIconsV1", null),
        sidebar.projects.map(({ id }) => id),
      ).then((icons) => {
          if (!canceled) {
            setProjectIcons(icons.projects);
            setSectionIcons(icons.sections);
          }
        },
      );
    };
    refresh();
    const unsubscribe = subscribeToIconChanges(refresh);
    return () => {
      canceled = true;
      unsubscribe();
    };
  }, [rpc, sidebar.projects]);
  const childrenByParent = useMemo(() => {
    const result = new Map<string, PluginSidebarThread[]>();
    for (const child of liveThreads.filter(
      ({ parentThreadId }) => parentThreadId && liveThreadIds.has(parentThreadId),
    )) {
      const list = result.get(child.parentThreadId!) ?? [];
      list.push(child);
      result.set(child.parentThreadId!, list);
    }
    return result;
  }, [liveThreadIds, liveThreads]);
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
  // Pinned membership and ordering come directly from bb; placement never
  // participates in this array.
  const pinnedRoots = useMemo(
    () =>
      displayRootThreads.filter(
        (thread) => thread.isPinned && matchesSearch(thread),
      ),
    [displayRootThreads, matchesSearch],
  );
  const visiblePlacementIds = new Set(placements.map(({ threadId }) => threadId));
  const placementOrder = new Map(
    placements.map(({ threadId }, index) => [threadId, index]),
  );
  const displayGroupId = (thread: PluginSidebarThread) =>
    placementByThread.get(thread.id)?.groupId ??
    (normalizedSearch && thread.isArchived
      ? grouping?.defaultGroupId
      : undefined);
  const unpinnedRoots = displayRootThreads.filter(
    (thread) =>
      !thread.isPinned &&
      (visiblePlacementIds.has(thread.id) ||
        (Boolean(normalizedSearch) && thread.isArchived)) &&
      matchesSearch(thread),
  ).sort(
    (left, right) =>
      (placementOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
      (placementOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER),
  );

  const groupDefinitions = useMemo(() => {
    if (!grouping) return [];
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

  const scopeLabel = useMemo(() => {
    if (!preferences || preferences.view.scope.kind === "all") return null;
    const scope = preferences.view.scope.group;
    const scopeGrouping = snapshot?.groupings.find(
      ({ groupingKey }) => groupingKey === scope.groupingKey,
    );
    return (
      scopeGrouping?.groups.find(({ id }) => id === scope.groupId)?.label ??
      `${scope.groupId} (unavailable)`
    );
  }, [preferences, snapshot]);
  const activeScope =
    preferences?.view.scope.kind === "group"
      ? preferences.view.scope.group
      : null;
  const activeScopeProviderIcon = activeScope
    ? snapshot?.groupings
        .find(({ groupingKey }) => groupingKey === activeScope.groupingKey)
        ?.groups.find(({ id }) => id === activeScope.groupId)?.icon
    : undefined;

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
      if (!preferences) return;
      setMutationError(null);
      const result = await rpc.call("updatePlacementV1", {
        groupingKey: preferences.view.groupingKey,
        groupId,
        threadId,
        anchor,
        expectedRevision: revision,
        origin: "ui",
      });
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
  if (!snapshot || !preferences || !grouping) {
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
    if (!movingThread || movingThread.isPinned || !movingPlacement) return false;
    if (movingPlacement.groupId === groupId) return true;
    const destination = groupDefinitions.find(({ id }) => id === groupId);
    return grouping.membershipWritable && destination?.acceptsAssignments === true;
  };
  const scopeFilterValue: ScopeFilterValue =
    activeScope?.groupingKey === "builtin:projects"
      ? { kind: "project", id: activeScope.groupId }
      : activeScope?.groupingKey === "builtin:sections"
        ? activeScope.groupId === "unsectioned"
          ? { kind: "uncategorized" }
          : { kind: "section", id: activeScope.groupId }
        : null;
  const hasDisplayedThreads = pinnedRoots.length + unpinnedRoots.length > 0;
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
      depth === 0 && !normalizedSearch && !root.isArchived && rowContext !== undefined;
    return (
      <Fragment key={root.id}>
        <ThreadRow
          active={activeThreadId === root.id}
          actions={actions}
          assignment={
            depth === 0 &&
            destination &&
            grouping.membershipWritable
              ? {
                  currentGroupId: destination.groupId,
                  groups: grouping.groups,
                  singularLabel: grouping.singularLabel,
                  onSetGroup: (groupId) => {
                    void updatePlacement(root.id, groupId, { kind: "end" });
                  },
                }
              : undefined
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
          projectIcon={projectIcons.get(root.projectId) ?? null}
          reorderable={reorderable}
          sectionIcons={sectionIcons}
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
        <ScopeFilter
          activeOverride={
            activeScope &&
            !["builtin:projects", "builtin:sections"].includes(
              activeScope.groupingKey,
            ) &&
            scopeLabel
              ? {
                  label: scopeLabel,
                  icon: activeScopeProviderIcon ? (
                    <ProviderIcon
                      icon={activeScopeProviderIcon}
                      label={`${scopeLabel} icon`}
                    />
                  ) : undefined,
                }
              : undefined
          }
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
              view: {
                ...current.view,
                scope:
                  next === null
                    ? { kind: "all" }
                    : {
                        kind: "group",
                        group:
                          next.kind === "project"
                            ? {
                                groupingKey: "builtin:projects",
                                groupId: next.id,
                              }
                            : {
                                groupingKey: "builtin:sections",
                                groupId:
                                  next.kind === "uncategorized"
                                    ? "unsectioned"
                                    : next.id,
                              },
                      },
              },
            }))
          }
          onHide={() => {
            void rpc.call("updateSettingsV1", {
              showProjectsAndSections: false,
            });
          }}
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
              scope: { groupingKey: "builtin:projects", groupId: project.id },
              label: project.name,
            })
          }
          onRemoveSection={(section) =>
            setEntityDialog({
              kind: "delete",
              scope: { groupingKey: "builtin:sections", groupId: section.id },
              label: section.name,
            })
          }
          onRenameProject={(project) =>
            setEntityDialog({
              kind: "rename",
              scope: { groupingKey: "builtin:projects", groupId: project.id },
              label: project.name,
              name: project.name,
            })
          }
          onRenameSection={(section) =>
            setEntityDialog({
              kind: "rename",
              scope: { groupingKey: "builtin:sections", groupId: section.id },
              label: section.name,
              name: section.name,
            })
          }
          projectActionStates={projectActionStates}
          projectIcons={projectIcons}
          projects={sidebar.projects}
          sectionIcons={sectionIcons}
          sections={sections.map(({ id, label }) => ({ id, name: label }))}
          trailing={
            <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    aria-label={`Group by ${grouping.pluralLabel}`}
                    className="flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2 text-xs text-subtle-foreground outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 data-[state=open]:bg-state-active max-md:pointer-coarse:h-9"
                    type="button"
                  >
                    <GroupingActionIcon grouping={grouping} />
                    <span className="max-w-20 truncate">
                      {grouping.pluralLabel}
                    </span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {snapshot.groupings
                    .filter(({ available }) => available)
                    .map((candidate) => (
                      <DropdownMenuItem
                        key={candidate.groupingKey}
                        onSelect={() =>
                          changePreferences((current) => ({
                            ...current,
                            view: {
                              ...current.view,
                              groupingKey:
                                candidate.groupingKey as GroupingKey,
                            },
                          }))
                        }
                      >
                        {candidate.pluralLabel}
                      </DropdownMenuItem>
                    ))}
                </DropdownMenuContent>
              </DropdownMenu>
              {scopeLabel ? (
                <>
                  <span aria-live="polite" className="sr-only">
                    {scopeLabel} scope
                  </span>
                  {matchingScope ? (
                    <button
                      aria-expanded={
                        !preferences.collapsed.has(
                          `${matchingScope.groupingKey}/${matchingScope.groupId}`,
                        )
                      }
                      aria-label={
                        preferences.collapsed.has(
                          `${matchingScope.groupingKey}/${matchingScope.groupId}`,
                        )
                          ? `Expand ${scopeLabel} section`
                          : `Collapse ${scopeLabel} section`
                      }
                      className="bb-sidebar-hover-actions inline-flex size-7 shrink-0 items-center justify-center rounded-md text-subtle-foreground outline-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 max-md:pointer-coarse:size-9"
                      onClick={() =>
                        changePreferences((current) => {
                          const collapsed = new Set(current.collapsed);
                          const ref = `${matchingScope.groupingKey}/${matchingScope.groupId}`;
                          if (collapsed.has(ref)) collapsed.delete(ref);
                          else collapsed.add(ref);
                          return { ...current, collapsed };
                        })
                      }
                      type="button"
                    >
                      <Icon
                        aria-hidden
                        className={`size-3 transition-transform duration-150 ${
                          preferences.collapsed.has(
                            `${matchingScope.groupingKey}/${matchingScope.groupId}`,
                          )
                            ? ""
                            : "rotate-90"
                        }`}
                        name="ChevronRight"
                      />
                    </button>
                  ) : null}
                  <button
                    aria-label="Clear scope"
                    className="bb-sidebar-hover-actions inline-flex size-7 shrink-0 items-center justify-center rounded-md text-subtle-foreground outline-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 max-md:pointer-coarse:size-9"
                    onClick={() =>
                      changePreferences((current) => ({
                        ...current,
                        view: { ...current.view, scope: { kind: "all" } },
                      }))
                    }
                    type="button"
                  >
                    <Icon aria-hidden className="size-4" name="X" />
                  </button>
                </>
              ) : null}
            </>
          }
          value={scopeFilterValue}
        />
      ) : (
        <div className="sticky top-[var(--bb-sidebar-sticky-stack-padding-top)] z-[70] mb-4 flex justify-end bg-sidebar">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                aria-label={`Group by ${grouping.pluralLabel}`}
                className="flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2 text-xs text-subtle-foreground outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 data-[state=open]:bg-state-active max-md:pointer-coarse:h-9"
                type="button"
              >
                <GroupingActionIcon grouping={grouping} />
                <span className="max-w-20 truncate">{grouping.pluralLabel}</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {snapshot.groupings
                .filter(({ available }) => available)
                .map((candidate) => (
                  <DropdownMenuItem
                    key={candidate.groupingKey}
                    onSelect={() =>
                      changePreferences((current) => ({
                        ...current,
                        view: {
                          ...current.view,
                          groupingKey: candidate.groupingKey as GroupingKey,
                        },
                      }))
                    }
                  >
                    {candidate.pluralLabel}
                  </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
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
                : "Choose the name shown in the Ribbon sidebar."}
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
            className="bb-sidebar-hover-actions-row sticky z-[60] flex h-6 items-center rounded-md bg-sidebar pl-2 pr-0 text-xs font-normal leading-5 text-subtle-foreground/75 max-md:pointer-coarse:h-9"
            data-sidebar="group-label"
            data-sidebar-sticky-tier="label"
          >
            <span className="min-w-0 flex-1 truncate">Pinned</span>
            <button
              aria-expanded={
                normalizedSearch ? true : !preferences.collapsed.has("builtin:pinned")
              }
              aria-label={
                !normalizedSearch && preferences.collapsed.has("builtin:pinned")
                  ? "Expand Pinned section"
                  : "Collapse Pinned section"
              }
              className={`${
                !normalizedSearch && preferences.collapsed.has("builtin:pinned")
                  ? ""
                  : "bb-sidebar-hover-actions"
              } inline-flex size-6 shrink-0 items-center justify-center rounded-md text-subtle-foreground outline-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2`}
              onClick={() =>
                changePreferences((current) => {
                  const collapsed = new Set(current.collapsed);
                  if (collapsed.has("builtin:pinned")) collapsed.delete("builtin:pinned");
                  else collapsed.add("builtin:pinned");
                  return { ...current, collapsed };
                })
              }
              type="button"
            >
              <Icon
                aria-hidden
                className={`size-3 transition-transform duration-150 ${
                  !normalizedSearch && preferences.collapsed.has("builtin:pinned")
                    ? ""
                    : "rotate-90"
                }`}
                name="ChevronRight"
              />
            </button>
          </div>
          {normalizedSearch || !preferences.collapsed.has("builtin:pinned") ? (
            <ul>
              {pinnedRoots.map((root) =>
                renderRoot(root, 0, true, {
                  kind: "pinned",
                  roots: pinnedRoots,
                }),
              )}
            </ul>
          ) : null}
        </section>
      ) : null}

      {displayedGroupDefinitions.map((group) => {
        const roots = unpinnedRoots.filter(
          (thread) => displayGroupId(thread) === group.id,
        );
        if (normalizedSearch && roots.length === 0) return null;
        if (roots.length === 0 && !group.visibleWhenEmpty) return null;
        const ref = `${grouping.groupingKey}/${group.id}`;
        const collapsed = !normalizedSearch && preferences.collapsed.has(ref);
        const groupThreads = roots.flatMap((root) => [
          root,
          ...descendants(root.id, childrenByParent),
        ]);
        const activityThread =
          collapsed &&
          (grouping.groupingKey === "plugin:thread-stages:stages" ||
            settings.values?.showCollapsedGroupIndicators === true)
            ? groupIndicator(groupThreads)
            : null;
        const activePreview =
          collapsed && activeThreadId !== null
            ? groupThreads.find(({ id }) => id === activeThreadId)
            : undefined;
        const sameKeyScope =
          preferences.view.scope.kind === "group" &&
          preferences.view.scope.group.groupingKey === grouping.groupingKey &&
          preferences.view.scope.group.groupId === group.id;
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
                className={`bb-sidebar-hover-actions-row sticky z-[60] flex h-6 items-center rounded-md bg-sidebar pl-2 text-xs font-normal leading-5 text-subtle-foreground/75 transition-colors max-md:pointer-coarse:h-9 ${
                  collapsed && roots.length > 0
                    ? activityThread
                      ? "pr-14"
                      : "pr-7"
                    : "pr-0"
                }`}
                data-sidebar="group-label"
                data-sidebar-sticky-tier="label"
              >
                <span className="relative z-10 flex min-w-0 flex-1 items-center gap-1 text-left">
                  <button
                    aria-label={`Filter to ${group.label}`}
                    className="flex min-w-0 items-center gap-2 rounded-md text-left outline-none ring-sidebar-ring hover:text-sidebar-accent-foreground focus-visible:ring-2"
                    onClick={() =>
                      changePreferences((current) => ({
                        ...current,
                        view: {
                          ...current.view,
                          scope: {
                            kind: "group",
                            group: {
                              groupingKey: grouping.groupingKey as GroupingKey,
                              groupId: group.id,
                            },
                          },
                        },
                      }))
                    }
                    type="button"
                  >
                    {group.icon ? (
                      <ProviderIcon
                        icon={group.icon}
                        label={`${group.label} group icon`}
                      />
                    ) : null}
                    <span className="min-w-0 truncate" title={group.label}>
                      {group.label}
                    </span>
                  </button>
                  <button
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
                  </button>
                </span>
                {collapsed && roots.length > 0 ? (
                  <span
                    aria-label={`${roots.length} ${roots.length === 1 ? "thread" : "threads"}`}
                    className={`pointer-events-none absolute z-20 inline-flex size-7 items-center justify-center tabular-nums text-xs text-subtle-foreground/60 ${activityThread ? "right-7" : "right-0"}`}
                  >
                    {roots.length}
                  </span>
                ) : null}
                {activityThread ? (
                  <span className="pointer-events-none absolute right-0 top-1/2 z-20 inline-flex size-7 -translate-y-1/2 items-center justify-center text-subtle-foreground">
                    <ThreadIndicator
                      indicator={activityThread.indicator}
                      label={activityThread.indicatorLabel}
                    />
                  </span>
                ) : null}
              </div>
            ) : null}
            <div className={!collapsed ? "mt-1" : undefined}>
              {!collapsed
                ? (
                    <ul>
                      {roots.map((root) =>
                        renderRoot(root, 0, true, {
                          kind: "placement",
                          roots,
                          groupId: group.id,
                        }),
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
    id: "sidebar-content-spacing",
    mount({ signal }) {
      return mountSidebarContentSpacing(signal);
    },
  });
});
