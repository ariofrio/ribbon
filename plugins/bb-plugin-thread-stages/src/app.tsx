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
  type PluginSidebarThreadActions,
  type PluginThreadListProps,
} from "@get-bb/plugin-sdk/app";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type MouseEvent,
} from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { toast } from "sonner";
import type { z } from "zod";
import type { rpcContract } from "./server";
import {
  DEFAULT_WORKFLOW_STAGE,
  WORKFLOW_STAGES,
  destinationOrder,
  enabledWorkflowStages,
  groupThreadsByStage,
  type ThreadAssignment,
  type WorkflowStage,
} from "./workflow-stage";
import { buildPinnedThreadState } from "./pinned-threads";
import { Icon } from "./components/Icon";
import { WorkflowStageIcon } from "./components/WorkflowStageIcon";
import {
  ThreadActionsContextMenu,
  ThreadActionsDropdown,
  type ThreadSectionOption,
} from "./components/ThreadActionsMenu";
import {
  groupIndicator,
  ThreadIndicator,
} from "./components/ThreadIndicator";
import { StageHeaderStatus } from "./components/StageHeaderStatus";
import { SplitPaneMiniMap } from "./components/SplitPaneMiniMap";
import { ThreadFilter } from "./components/ThreadFilter";
import {
  FilterEntityRemoveDialog,
  FilterEntityRenameDialog,
  type FilterEntityTarget,
} from "./components/FilterEntityDialogs";
import { ThreadRenameDialog } from "./components/ThreadRenameDialog";
import { ThreadSectionDialog } from "./components/ThreadSectionDialog";
import { createNativeCommandDelegate } from "./native-command-delegation";
import { notifyNativeShortcutHandled } from "./native-command-hints";
import { usePersistentStringSet } from "./persistent-string-set";
import {
  fetchIcons,
  subscribeToProjectIconChanges,
  type ProjectIconView,
} from "./icons";
import { shouldSyncThreads } from "./workflow-sync";
import {
  partitionWorkflowThreads,
  withThreadAncestors,
} from "./root-thread-ownership";
import {
  currentThreadId,
  workflowReorderShortcut,
  workflowStageShortcut,
} from "./workflow-shortcuts";
import {
  canDropThreadBeside,
  effectiveHierarchyParentId,
  flattenThreadHierarchy,
} from "./thread-hierarchy";
import {
  filterThreads,
  normalizeThreadFilter,
  serializeThreadFilter,
  type ThreadFilter as ThreadFilterValue,
} from "./thread-filter";
import { mountSidebarContentSpacing } from "./sidebar-content-spacing";
import {
  mountSectionAwareComposeNavigation,
  THREAD_FILTER_CHANGED_EVENT,
} from "./new-thread-section";

type ThreadStagesSettingsUpdate = z.infer<
  typeof rpcContract.updateSettings.input
>;

const COLLAPSED_STATUSES_STORAGE_KEY =
  "bb.plugin.workflow-stage.collapsedStatuses";
const COLLAPSED_THREADS_STORAGE_KEY = "bb.sidebar.collapsedThreads";
const THREAD_FILTER_STORAGE_KEY = "bb.plugin.thread-stages.threadFilter";
const PROJECT_FILTER_STORAGE_KEY = "bb.plugin.thread-stages.projectFilter";
const LEGACY_PROJECT_FILTER_STORAGE_KEY =
  "bb.plugin.thread-workflow.projectFilter";
const OWNERSHIP_TRANSFER_ERROR = "placement ownership has transferred";
const PINNED_SECTION = "Pinned" as const;
type SidebarGroup = WorkflowStage | typeof PINNED_SECTION;
const COLLAPSIBLE_SECTION_SET: ReadonlySet<string> = new Set([
  PINNED_SECTION,
  ...WORKFLOW_STAGES,
]);
const DEFAULT_COLLAPSED_STAGES: ReadonlySet<string> = new Set([
  "Deferred",
  "Completed",
]);
const LEGACY_COLLAPSED_STAGE_ALIASES: ReadonlyMap<string, string> = new Map([
  ["Backlog", "Deferred"],
  ["To do", "Idle"],
  ["Working", "Active"],
  ["Done", "Completed"],
  ["Canceled", "Completed"],
]);

interface OrganizationState {
  assignments: ThreadAssignment[];
}

type SearchState =
  | { query: ""; status: "idle"; threads: readonly SearchThread[] }
  | { query: string; status: "loading"; threads: readonly SearchThread[] }
  | { query: string; status: "ready"; threads: readonly SearchThread[] }
  | { query: string; status: "error"; threads: readonly SearchThread[] };

interface SearchThread {
  id: string;
  projectId: string;
  title: string | null;
  titleFallback: string | null;
  parentThreadId: string | null;
  providerId: string;
  isArchived: boolean;
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

interface ThreadRowProps {
  actions: PluginSidebarThreadActions;
  active: boolean;
  disabled: boolean;
  dragging: boolean;
  depth: number;
  hasChildren: boolean;
  childrenCollapsed: boolean;
  indicatorThread: PluginSidebarThread;
  onChangeStage: (stage: WorkflowStage) => void;
  onCreateSection: (name: string) => Promise<void>;
  onDragEnd: () => void;
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDragStart: (event: DragEvent<HTMLElement>) => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
  onNavigate: () => void;
  onRefreshSections: () => void;
  onSetSection: (sectionId: string | null) => void;
  onToggleChildren: () => void;
  preview: string | null;
  projectIcon: ProjectIconView | null;
  reorderable: boolean;
  sectionIcons: ReadonlyMap<string, ProjectIconView>;
  showDropAfter: boolean;
  showDropBefore: boolean;
  sections: readonly ThreadSectionOption[];
  workflowStage: WorkflowStage | null;
  workflowStages: readonly WorkflowStage[];
  thread: PluginSidebarThread;
}

function threadTitle(thread: PluginSidebarThread): string {
  return thread.title ?? thread.titleFallback ?? "Untitled thread";
}

function ThreadRow({
  actions,
  active,
  disabled,
  dragging,
  depth,
  hasChildren,
  childrenCollapsed,
  indicatorThread,
  onChangeStage,
  onCreateSection,
  onDragEnd,
  onDragOver,
  onDragStart,
  onDrop,
  onNavigate,
  onRefreshSections,
  onSetSection,
  onToggleChildren,
  preview,
  projectIcon,
  reorderable,
  sectionIcons,
  showDropAfter,
  showDropBefore,
  sections,
  workflowStage,
  workflowStages,
  thread,
}: ThreadRowProps) {
  const { splitProps, isAvailable: splitAvailable, layout } =
    experimental_useSidebarThreadSplit(thread.id);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [newSectionOpen, setNewSectionOpen] = useState(false);
  const title = threadTitle(thread);
  const accessibleTitle = preview ? `${title} — ${preview}` : title;
  const actionsOpen = dropdownOpen || contextOpen;

  function openThread(event: MouseEvent<HTMLAnchorElement>): void {
    event.preventDefault();
    if (thread.isArchived) {
      window.location.assign(
        `/projects/${encodeURIComponent(thread.projectId)}/threads/${encodeURIComponent(thread.id)}`,
      );
      onNavigate();
      return;
    }
    actions.open(thread.id, {
      split: splitAvailable && (event.metaKey || event.ctrlKey),
    });
    onNavigate();
  }

  const commonMenuProps = {
    actions,
    disabled,
    sectionIcons,
    sections,
    onNewSection: () =>
      window.setTimeout(() => {
        setNewSectionOpen(true);
      }, 0),
    onRename: () =>
      window.setTimeout(() => {
        setRenameOpen(true);
      }, 0),
    onSetSection,
    onSetWorkflowStage: onChangeStage,
    splitAvailable,
    workflowStage,
    workflowStages,
    thread,
  };

  const row = (
    <li
      className="relative list-none"
      onDragOver={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onDragOver(event);
      }}
      onDrop={onDrop}
    >
      {showDropBefore ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -top-px left-2 right-2 z-20 h-0.5 rounded-full bg-primary"
        />
      ) : null}
      {showDropAfter ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-px left-2 right-2 z-20 h-0.5 rounded-full bg-primary"
        />
      ) : null}
      <div
        className={`bb-sidebar-hover-actions-row group/thread-row relative flex w-full items-center gap-2 rounded-md py-1 pr-0 text-sm transition-colors max-md:pointer-coarse:py-2.5 ${
          active
            ? "bg-state-active text-sidebar-foreground"
            : "cursor-pointer text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground dark:text-sidebar-foreground"
        } ${!active && layout !== null ? "bg-sidebar-accent/50" : ""} ${
          dragging ? "opacity-40" : ""
        } ${disabled ? "" : "select-none"}`}
        draggable={reorderable && !disabled && !thread.isArchived}
        onDragEnd={onDragEnd}
        onDragStart={onDragStart}
        style={{ paddingLeft: 8 + depth * 24 }}
      >
        {Array.from({ length: depth }, (_, level) => (
          <span
            key={level}
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 z-[1] w-px bg-border-hairline opacity-70"
            style={{ left: 16 + level * 24 }}
          />
        ))}
        <a
          {...splitProps}
          aria-label={`Open ${accessibleTitle}`}
          className="absolute inset-0 rounded-md outline-none ring-sidebar-ring focus-visible:ring-2"
          data-sidebar-thread-id={thread.id}
          data-sidebar-thread-shortcut-target=""
          draggable={false}
          href={`/projects/${encodeURIComponent(thread.projectId)}/threads/${encodeURIComponent(thread.id)}`}
          onClick={openThread}
        />
        <span className="flex min-w-0 flex-1 items-center gap-2">
          {projectIcon === null ? null : (
            <HugeiconsIcon
              icon={projectIcon.glyph}
              // An uncolored icon takes the row's own color, so it reads as part
              // of the title it sits beside rather than a dimmer thing near it.
              className="size-4 shrink-0"
              style={projectIcon.color === null ? undefined : { color: projectIcon.color }}
              data-project-icon={projectIcon.name}
              aria-hidden
            />
          )}
          <span className="flex min-w-0 flex-1 flex-col justify-center leading-none">
            <span className="truncate leading-5" title={accessibleTitle}>
              {title}
            </span>
            {preview ? (
              <span
                className="truncate text-[11px] leading-4 text-subtle-foreground/75"
                title={preview}
              >
                {preview}
              </span>
            ) : null}
          </span>
          {hasChildren ? (
            <button
              type="button"
              aria-expanded={!childrenCollapsed}
              aria-label={
                childrenCollapsed
                  ? `Expand ${title} threads`
                  : `Collapse ${title} threads`
              }
              className="bb-sidebar-hover-actions relative z-20 inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-md text-subtle-foreground outline-none ring-sidebar-ring transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onToggleChildren();
              }}
            >
              <Icon
                name="ChevronRight"
                className={`size-3 transition-transform duration-150 ${
                  childrenCollapsed ? "" : "rotate-90"
                }`}
                aria-hidden
              />
            </button>
          ) : null}
        </span>
        <span className="relative -my-1 flex w-7 shrink-0 self-stretch items-center justify-end max-md:pointer-coarse:-my-2.5 max-md:pointer-coarse:w-9">
          <span
            data-sidebar-hover-actions-open={actionsOpen ? "true" : undefined}
            className="bb-sidebar-hover-actions-fade absolute inset-0 flex items-center justify-center text-subtle-foreground"
          >
            {layout ? (
              <span
                data-sidebar-thread-trailing-indicator=""
                className="inline-flex size-4 shrink-0 items-center justify-center"
              >
                <SplitPaneMiniMap
                  layout={layout}
                  label={
                    indicatorThread.indicatorLabel
                      ? `${title} — open in split; ${indicatorThread.indicatorLabel}`
                      : `${title} — open in split`
                  }
                  isActive={[
                    "working-draft",
                    "workflow",
                    "background-agent",
                    "background-command",
                    "plan-mode",
                    "goal",
                    "runtime",
                  ].includes(indicatorThread.indicator)}
                />
              </span>
            ) : indicatorThread.indicator !== "none" ? (
              <span
                data-sidebar-thread-trailing-indicator=""
                className="inline-flex size-4 shrink-0 items-center justify-center"
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
              data-sidebar-hover-actions-open={
                actionsOpen ? "true" : undefined
              }
              className="bb-sidebar-hover-actions absolute inset-0 z-10 flex items-center justify-end max-md:pointer-coarse:hidden"
            >
              <ThreadActionsDropdown
                {...commonMenuProps}
                onOpenChange={(open) => {
                  setDropdownOpen(open);
                  if (open) onRefreshSections();
                }}
              />
            </span>
          ) : null}
        </span>
      </div>
    </li>
  );

  if (thread.isArchived) return row;

  return (
    <>
      <ThreadActionsContextMenu
        {...commonMenuProps}
        onOpenChange={(open) => {
          setContextOpen(open);
          if (open) onRefreshSections();
        }}
      >
        {row}
      </ThreadActionsContextMenu>
      <ThreadRenameDialog
        currentTitle={title}
        open={renameOpen}
        onOpenChange={setRenameOpen}
        onRename={(nextTitle) => actions.rename(thread.id, nextTitle)}
      />
      <ThreadSectionDialog
        open={newSectionOpen}
        onCreate={onCreateSection}
        onOpenChange={setNewSectionOpen}
      />
    </>
  );
}

interface SidebarSectionProps {
  children: React.ReactNode;
  collapsed: boolean;
  count?: number;
  dropTarget: boolean;
  onDropAtEnd: (event: DragEvent<HTMLElement>) => void;
  onDragOverEnd: (event: DragEvent<HTMLElement>) => void;
  onToggle: () => void;
  label: SidebarGroup;
  threads: readonly PluginSidebarThread[];
}

function SidebarSection({
  children,
  collapsed,
  count,
  dropTarget,
  onDropAtEnd,
  onDragOverEnd,
  onToggle,
  label,
  threads,
}: SidebarSectionProps) {
  const activityThread =
    collapsed && label !== PINNED_SECTION ? groupIndicator(threads) : null;
  const id = `thread-stages-group-${label.replace(/\s/g, "-")}`;
  return (
    <section
      data-sidebar-sticky-group=""
      aria-labelledby={id}
      className={`group/sidebar-section min-w-0 rounded-md transition-colors ${
        dropTarget ? "bg-sidebar-accent/60" : ""
      }`}
      onDragOver={onDragOverEnd}
      onDrop={onDropAtEnd}
    >
      <div
        data-sidebar="group-label"
        data-sidebar-sticky-tier="label"
        className="bb-sidebar-hover-actions-row sticky z-[60] flex h-6 items-center rounded-md bg-sidebar pl-2 pr-0 text-xs font-normal leading-5 text-subtle-foreground/75 transition-colors max-md:pointer-coarse:h-9"
      >
        <span className="relative z-10 flex min-w-0 flex-1 items-center gap-1 text-left">
          {label === PINNED_SECTION ? null : (
            <WorkflowStageIcon stage={label} className="mr-1 size-4 shrink-0" />
          )}
          <span id={id} className="min-w-0 truncate" title={label}>
            {label}
          </span>
          <button
            type="button"
            aria-expanded={!collapsed}
            aria-label={
              collapsed
                ? `Expand ${label} section`
                : `Collapse ${label} section`
            }
            className={`${collapsed ? "" : "bb-sidebar-hover-actions"} relative z-20 inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-subtle-foreground outline-none ring-sidebar-ring transition-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2`}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onToggle();
            }}
            onDragStart={(event) => event.preventDefault()}
          >
            <Icon
              name="ChevronRight"
              className={`size-3 transition-transform duration-150 ${
                collapsed ? "" : "rotate-90"
              }`}
              aria-hidden
            />
          </button>
        </span>
        <StageHeaderStatus
          activityThread={activityThread}
          collapsed={collapsed}
          count={count}
        />
      </div>
      {collapsed ? null : <div className="mt-1">{children}</div>}
    </section>
  );
}

function LoadingState() {
  return (
    <div
      aria-label="Loading sidebar navigation"
      className="space-y-1.5 px-2 pt-1"
    >
      {["w-2/3", "w-1/2"].map((width) => (
        <div key={width} className="flex h-7 animate-pulse items-center gap-2 rounded-md">
          <span className="size-4 shrink-0 rounded-md bg-sidebar-border/60" />
          <span className={`h-3 ${width} rounded-sm bg-sidebar-border/50`} />
        </div>
      ))}
    </div>
  );
}

function SidebarMessage({
  action,
  children,
  icon,
  isLoading = false,
}: {
  action?: { label: string; onClick: () => void };
  children: React.ReactNode;
  icon: "AlertCircle" | "CircleQuestion" | "Loading";
  isLoading?: boolean;
}) {
  return (
    <div className="flex min-h-8 items-center gap-2 px-2 py-2 text-xs text-muted-foreground">
      <Icon
        name={icon}
        className={`size-4 shrink-0 ${isLoading ? "animate-spin" : ""}`}
        aria-hidden
      />
      <span className="min-w-0 flex-1">{children}</span>
      {action ? (
        <button
          type="button"
          className="shrink-0 rounded-md px-2 py-1 text-xs text-foreground outline-none ring-sidebar-ring hover:bg-sidebar-accent focus-visible:ring-2"
          onClick={action.onClick}
        >
          {action.label}
        </button>
      ) : null}
    </div>
  );
}

function SidebarStageLayout({
  children,
  dialog,
  error,
  filterControl,
  onDragEnd,
}: {
  children: React.ReactNode;
  dialog: React.ReactNode;
  error: string | null;
  filterControl: React.ReactNode;
  onDragEnd: (event: DragEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      data-sidebar="group"
      data-sidebar-sticky-stack=""
      data-sidebar-sticky-density="compact-actions"
      data-thread-stages-sidebar-root=""
      className="relative flex w-full min-w-0 flex-col"
      style={
        {
          "--bb-sidebar-sticky-label-top":
            "calc(var(--bb-sidebar-sticky-stack-padding-top) + 2.75rem)",
        } as CSSProperties
      }
      onDragEnd={onDragEnd}
    >
      {error ? (
        <div className="mb-2 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
          {error}
        </div>
      ) : null}
      {filterControl}
      {children}
      {dialog}
    </div>
  );
}

function WorkflowStageList({
  activeThreadId,
  experimental_Original: OriginalThreadList,
  onNavigate,
  searchQuery,
}: PluginThreadListProps) {
  const rpc = useRpc<typeof rpcContract>();
  const sidebar = experimental_useSidebarThreads();
  const actions = experimental_useSidebarThreadActions();
  const connectionState = useRealtimeConnectionState();
  const settings = useSettings();
  const [organization, setOrganization] = useState<OrganizationState | null>(
    null,
  );
  const [previews, setPreviews] = useState<ReadonlyMap<string, string | null>>(
    () => new Map(),
  );
  const [sections, setSections] = useState<readonly ThreadSectionOption[]>([]);
  const [sectionsLoaded, setSectionsLoaded] = useState(false);
  const organizationLoaded = useRef(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState<SearchState>({
    query: "",
    status: "idle",
    threads: [],
  });
  const [draggingThreadId, setDraggingThreadId] = useState<string | null>(null);
  const [dropBefore, setDropBefore] = useState<string | null>(null);
  const [dropAfter, setDropAfter] = useState<string | null>(null);
  const [dropGroup, setDropGroup] = useState<SidebarGroup | null>(null);
  const [collapsedSections, setCollapsedSections] = usePersistentStringSet(
    COLLAPSED_STATUSES_STORAGE_KEY,
    COLLAPSIBLE_SECTION_SET,
    DEFAULT_COLLAPSED_STAGES,
    LEGACY_COLLAPSED_STAGE_ALIASES,
  );
  const [collapsedThreads, setCollapsedThreads] = usePersistentStringSet(
    COLLAPSED_THREADS_STORAGE_KEY,
  );
  const showThreadPreviews = settings.values?.showThreadPreviews !== false;
  const enabledStages = useMemo(
    () => enabledWorkflowStages(settings.values),
    [settings.values?.showBlockedStage, settings.values?.showDeferredStage],
  );
  const enabledStageSet = useMemo(() => new Set(enabledStages), [enabledStages]);
  const showSidebarFilter = settings.values?.showSidebarFilter !== false;
  const [mutationPending, setMutationPending] = useState(false);
  const [pinnedThreadIds, setPinnedThreadIds] = useState<readonly string[]>([]);
  const [storedThreadFilter, setStoredThreadFilter] = useState<string | null>(
    () =>
      typeof window === "undefined"
        ? null
        : (window.localStorage.getItem(THREAD_FILTER_STORAGE_KEY) ??
          window.localStorage.getItem(PROJECT_FILTER_STORAGE_KEY) ??
          window.localStorage.getItem(LEGACY_PROJECT_FILTER_STORAGE_KEY)),
  );
  const [newSectionOpen, setNewSectionOpen] = useState(false);
  const [renameTarget, setRenameTarget] =
    useState<FilterEntityTarget | null>(null);
  const [removeTarget, setRemoveTarget] =
    useState<FilterEntityTarget | null>(null);
  const [projectCreatePending, setProjectCreatePending] = useState(false);
  const wasConnected = useRef(false);
  const syncInFlight = useRef(false);

  const saveSettings = useCallback(
    async (values: ThreadStagesSettingsUpdate) => {
      try {
        await rpc.call("updateSettings", values);
      } catch (cause) {
        toast.error(
          cause instanceof Error
            ? cause.message
            : "Could not save Thread stages settings.",
        );
      }
    },
    [rpc],
  );

  const clearDrag = useCallback(() => {
    setDraggingThreadId(null);
    setDropBefore(null);
    setDropAfter(null);
    setDropGroup(null);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const state = await rpc.call("listState", null);
      setOrganization(state);
      organizationLoaded.current = true;
      setLoadError(null);
      setError(null);
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "Could not load stages.";
      if (message.includes(OWNERSHIP_TRANSFER_ERROR)) {
        organizationLoaded.current = false;
        setOrganization(null);
        setLoadError(message);
        setError(null);
      } else if (organizationLoaded.current) setError(message);
      else setLoadError(message);
    }
  }, [rpc]);

  const refreshPreviews = useCallback(async () => {
    try {
      const result = await rpc.call("listPreviews", null);
      setPreviews(
        new Map(
          result.previews.map((preview) => [
            preview.threadId,
            preview.preview,
          ]),
        ),
      );
    } catch {
      // A missing preview is a valid transient state while the backend catches
      // up; stage organization remains usable without secondary text.
    }
  }, [rpc]);

  const refreshSections = useCallback(async () => {
    try {
      const result = await rpc.call("listSections", null);
      setSections(result.sections);
      setSectionsLoaded(true);
    } catch {
      // Section organization remains usable through the native sidebar if its
      // options are temporarily unavailable to this plugin surface.
    }
  }, [rpc]);

  useEffect(() => {
    void refresh();
    void refreshPreviews();
    void refreshSections();
  }, [refresh, refreshPreviews, refreshSections]);

  useRealtime("state-changed", () => {
    void refresh();
  });

  useRealtime("previews-changed", () => {
    void refreshPreviews();
  });

  useEffect(() => {
    if (connectionState === "connected" && wasConnected.current) {
      void refresh();
      void refreshPreviews();
      void refreshSections();
    }
    wasConnected.current = connectionState === "connected";
  }, [connectionState, refresh, refreshPreviews, refreshSections]);

  const rootThreads = useMemo(
    () => sidebar.threads.filter((thread) => !thread.isArchived),
    [sidebar.threads],
  );
  const workflowPartition = useMemo(
    () => partitionWorkflowThreads(rootThreads),
    [rootThreads],
  );

  const projectIds = useMemo(
    () => sidebar.projects.map((project) => project.id).sort().join(","),
    [sidebar.projects],
  );
  const threadFilter = useMemo(
    () =>
      normalizeThreadFilter(
        storedThreadFilter,
        sidebar.projects,
        sectionsLoaded ? sections : null,
      ),
    [sections, sectionsLoaded, sidebar.projects, storedThreadFilter],
  );
  useEffect(() => {
    if (sidebar.status !== "ready" || !sectionsLoaded) return;
    const normalizedValue = serializeThreadFilter(threadFilter);
    if (normalizedValue === storedThreadFilter) return;
    setStoredThreadFilter(normalizedValue);
    if (normalizedValue === null) {
      window.localStorage.removeItem(THREAD_FILTER_STORAGE_KEY);
    } else {
      window.localStorage.setItem(THREAD_FILTER_STORAGE_KEY, normalizedValue);
    }
    window.localStorage.removeItem(PROJECT_FILTER_STORAGE_KEY);
    window.localStorage.removeItem(LEGACY_PROJECT_FILTER_STORAGE_KEY);
  }, [sectionsLoaded, sidebar.status, storedThreadFilter, threadFilter]);
  const changeThreadFilter = useCallback((filter: ThreadFilterValue) => {
    const storedValue = serializeThreadFilter(filter);
    setStoredThreadFilter(storedValue);
    if (storedValue === null) {
      window.localStorage.removeItem(THREAD_FILTER_STORAGE_KEY);
    } else {
      window.localStorage.setItem(THREAD_FILTER_STORAGE_KEY, storedValue);
    }
    window.localStorage.removeItem(PROJECT_FILTER_STORAGE_KEY);
    window.localStorage.removeItem(LEGACY_PROJECT_FILTER_STORAGE_KEY);
    window.dispatchEvent(new Event(THREAD_FILTER_CHANGED_EVENT));
  }, []);
  const [projectIcons, setProjectIcons] = useState<
    ReadonlyMap<string, ProjectIconView>
  >(new Map());
  const [sectionIcons, setSectionIcons] = useState<
    ReadonlyMap<string, ProjectIconView>
  >(new Map());
  const [projectActionStates, setProjectActionStates] = useState<
    ReadonlyMap<string, { canAddLocalPath: boolean }>
  >(new Map());
  useEffect(() => {
    let canceled = false;
    const load = () => {
      void fetchIcons(
        () => rpc.call("listProjectIcons", null),
        projectIds.split(",").filter(Boolean),
      ).then((icons) => {
        if (canceled) return;
        setProjectIcons(icons.projects);
        setSectionIcons(icons.sections);
      });
    };
    load();
    const unsubscribe = subscribeToProjectIconChanges(load);
    return () => {
      canceled = true;
      unsubscribe();
    };
  }, [projectIds, rpc]);
  useEffect(() => {
    const lend = () =>
      actions.openNewThread({
        projectId: PERSONAL_PROJECT_ID,
        focusPrompt: true,
      });
    openPersonalCompose = lend;
    return () => {
      // bb mounts one list today, but a stale instance clearing a live
      // one would strand the chord for the session.
      if (openPersonalCompose === lend) openPersonalCompose = null;
    };
  }, [actions]);

  const refreshProjectActionStates = useCallback(async () => {
    try {
      const result = await rpc.call("listProjectActionStates", null);
      setProjectActionStates(
        new Map(
          result.projects.map(({ id, canAddLocalPath }) => [
            id,
            { canAddLocalPath },
          ]),
        ),
      );
    } catch {
      setProjectActionStates(new Map());
    }
  }, [rpc]);
  useEffect(() => {
    void refreshProjectActionStates();
  }, [projectIds, refreshProjectActionStates]);
  const explicitPinnedThreadIds = useMemo(
    () =>
      rootThreads
        .filter((thread) => thread.isPinned)
        .map((thread) => thread.id),
    [rootThreads],
  );

  useEffect(() => {
    if (explicitPinnedThreadIds.length === 0) return;
    let canceled = false;
    void rpc
      .call("listPinnedThreadIds", null)
      .then(({ threadIds }) => {
        if (!canceled) setPinnedThreadIds(threadIds);
      })
      .catch(() => {
        // Live pin membership remains usable in source order when the
        // authoritative fractional order cannot be loaded.
      });
    return () => {
      canceled = true;
    };
  }, [explicitPinnedThreadIds, rpc]);

  const unsyncedThreadIds = useMemo(() => {
    const assigned = new Set(
      (organization?.assignments ?? []).map(
        (assignment) => assignment.threadId,
      ),
    );
    return [
      ...workflowPartition.rootThreads
        .map((thread) => thread.id)
        .filter((threadId) => !assigned.has(threadId)),
      ...workflowPartition.childThreads
        .map((thread) => thread.id)
        .filter((threadId) => assigned.has(threadId)),
    ];
  }, [organization?.assignments, workflowPartition]);

  useEffect(() => {
    if (
      !shouldSyncThreads({
        hasOrganization: organization !== null,
        loadError,
        sidebarStatus: sidebar.status,
        syncInFlight: syncInFlight.current,
        unsyncedCount: unsyncedThreadIds.length,
      })
    ) {
      return;
    }
    syncInFlight.current = true;
    void rpc
      .call("syncThreads", {
        rootThreadIds: workflowPartition.rootThreads.map((thread) => thread.id),
        childThreadIds: workflowPartition.childThreads.map((thread) => thread.id),
      })
      .then((state) => {
        setOrganization(state);
        setError(null);
      })
      .catch((cause) => {
        const message =
          cause instanceof Error
            ? cause.message
            : "Could not save stage order.";
        if (message.includes(OWNERSHIP_TRANSFER_ERROR)) {
          organizationLoaded.current = false;
          setOrganization(null);
          setLoadError(message);
          setError(null);
        } else {
          setError(message);
        }
      })
      .finally(() => {
        syncInFlight.current = false;
      });
  }, [
    loadError,
    organization,
    rpc,
    sidebar.status,
    rootThreads,
    workflowPartition,
    unsyncedThreadIds.length,
  ]);

  const normalizedSearch = searchQuery.trim().toLocaleLowerCase();

  useEffect(() => {
    if (!normalizedSearch) {
      setSearch({ query: "", status: "idle", threads: [] });
      return;
    }
    let canceled = false;
    const timeout = window.setTimeout(() => {
      setSearch({ query: normalizedSearch, status: "loading", threads: [] });
      void rpc
        .call("searchThreads", { query: searchQuery.trim() })
        .then(({ threads }) => {
          if (!canceled) {
            setSearch({
              query: normalizedSearch,
              status: "ready",
              threads,
            });
          }
        })
        .catch(() => {
          if (!canceled) {
            setSearch({
              query: normalizedSearch,
              status: "error",
              threads: [],
            });
          }
        });
    }, 150);
    return () => {
      canceled = true;
      window.clearTimeout(timeout);
    };
  }, [normalizedSearch, rpc, searchQuery]);

  const unfilteredDisplayThreads = useMemo(() => {
    if (!normalizedSearch) return rootThreads;
    if (search.query !== normalizedSearch || search.status !== "ready") return [];
    const liveThreads = new Map(
      sidebar.threads.map((thread) => [thread.id, thread] as const),
    );
    const matches = search.threads.map(
      (thread) => liveThreads.get(thread.id) ?? archivedSearchThread(thread),
    );
    const allThreads = [
      ...sidebar.threads,
      ...matches.filter((thread) => !liveThreads.has(thread.id)),
    ];
    return withThreadAncestors(matches, allThreads);
  }, [normalizedSearch, search, sidebar.threads, rootThreads]);
  const displayThreads = useMemo(
    () => filterThreads(unfilteredDisplayThreads, threadFilter),
    [threadFilter, unfilteredDisplayThreads],
  );
  const pinnedState = useMemo(
    () => buildPinnedThreadState(displayThreads, pinnedThreadIds),
    [displayThreads, pinnedThreadIds],
  );
  const statusThreads = useMemo(
    () =>
      displayThreads.filter(
        (thread) => !pinnedState.effectivePinnedThreadIds.has(thread.id),
      ),
    [displayThreads, pinnedState.effectivePinnedThreadIds],
  );
  const groups = useMemo(
    () => groupThreadsByStage(statusThreads, organization?.assignments ?? []),
    [organization?.assignments, statusThreads],
  );
  const displayedStages = useMemo(
    () =>
      WORKFLOW_STAGES.filter(
        (stage) => enabledStageSet.has(stage) || groups[stage].length > 0,
      ),
    [enabledStageSet, groups],
  );
  const assignmentByThreadId = useMemo(
    () =>
      new Map(
        (organization?.assignments ?? []).map((assignment) => [
          assignment.threadId,
          assignment,
        ]),
      ),
    [organization?.assignments],
  );
  const pinnedHierarchyRows = useMemo(
    () => flattenThreadHierarchy(pinnedState.pinnedThreads, collapsedThreads),
    [collapsedThreads, pinnedState.pinnedThreads],
  );
  const pinnedRootThreads = useMemo(
    () =>
      pinnedHierarchyRows
        .filter(({ depth }) => depth === 0)
        .map(({ thread }) => thread),
    [pinnedHierarchyRows],
  );
  const pinnedRootIds = useMemo(
    () => new Set(pinnedRootThreads.map((thread) => thread.id)),
    [pinnedRootThreads],
  );

  const commitMove = useCallback(
    async (
      threadId: string,
      stage: WorkflowStage,
      beforeThreadId: string | null,
    ) => {
      if (
        mutationPending ||
        unsyncedThreadIds.length > 0 ||
        !enabledStageSet.has(stage)
      )
        return;
      const order = destinationOrder(
        flattenThreadHierarchy(groups[stage], new Set<string>())
          .filter(({ depth }) => depth === 0)
          .map(({ thread }) => thread.id),
        threadId,
        beforeThreadId,
      );
      const movedIndex = order.indexOf(threadId);
      setMutationPending(true);
      setError(null);
      try {
        const state = await rpc.call("moveThread", {
          threadId,
          workflowStage: stage,
          previousThreadId: order[movedIndex - 1] ?? null,
          nextThreadId: order[movedIndex + 1] ?? null,
        });
        setOrganization(state);
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : "Could not move the thread.",
        );
        await refresh();
      } finally {
        setMutationPending(false);
        clearDrag();
      }
    },
    [
      clearDrag,
      enabledStageSet,
      groups,
      mutationPending,
      refresh,
      rpc,
      unsyncedThreadIds.length,
    ],
  );

  const commitPinnedMove = useCallback(
    async (threadId: string, beforeThreadId: string | null) => {
      if (mutationPending || !pinnedRootIds.has(threadId)) return;
      const order = destinationOrder(
        pinnedRootThreads.map((thread) => thread.id),
        threadId,
        beforeThreadId,
      );
      const movedIndex = order.indexOf(threadId);
      setMutationPending(true);
      setError(null);
      try {
        const { threadIds } = await rpc.call("reorderPinnedThread", {
          threadId,
          previousThreadId: order[movedIndex - 1] ?? null,
          nextThreadId: order[movedIndex + 1] ?? null,
        });
        setPinnedThreadIds(threadIds);
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not reorder the pinned thread.",
        );
      } finally {
        setMutationPending(false);
        clearDrag();
      }
    },
    [clearDrag, mutationPending, pinnedRootIds, pinnedRootThreads, rpc],
  );

  const setThreadSection = useCallback(
    async (threadId: string, sectionId: string | null) => {
      try {
        await rpc.call("setThreadSection", { threadId, sectionId });
      } catch (cause) {
        toast.error(
          cause instanceof Error
            ? cause.message
            : "Could not change the thread section.",
        );
      }
    },
    [rpc],
  );

  const createSectionForThread = useCallback(
    async (threadId: string, name: string) => {
      const { section } = await rpc.call("createSectionForThread", {
        threadId,
        name,
      });
      setSections((current) => [
        ...current.filter(({ id }) => id !== section.id),
        section,
      ]);
    },
    [rpc],
  );

  const createSection = useCallback(
    async (name: string) => {
      const { section } = await rpc.call("createSection", { name });
      setSections((current) => [
        ...current.filter(({ id }) => id !== section.id),
        section,
      ]);
      setSectionsLoaded(true);
    },
    [rpc],
  );

  const createProject = useCallback(async () => {
    if (projectCreatePending) return;
    setProjectCreatePending(true);
    try {
      const { project } = await rpc.call("createProjectFromFolder", null);
      if (project) toast.success(`Created ${project.name}`);
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "Could not create project.",
      );
    } finally {
      setProjectCreatePending(false);
    }
  }, [projectCreatePending, rpc]);

  const addProjectLocalPath = useCallback(
    async (projectId: string) => {
      try {
        const { added } = await rpc.call("addProjectLocalPath", { projectId });
        if (added) {
          toast.success("Added local path");
          await refreshProjectActionStates();
        }
      } catch (cause) {
        toast.error(
          cause instanceof Error
            ? cause.message
            : "Could not add the local path.",
        );
      }
    },
    [refreshProjectActionStates, rpc],
  );

  const renameFilterEntity = useCallback(
    async (target: FilterEntityTarget, name: string) => {
      if (target.kind === "project") {
        await rpc.call("renameProject", { projectId: target.id, name });
        return;
      }
      await rpc.call("renameSection", { sectionId: target.id, name });
      setSections((current) =>
        current.map((section) =>
          section.id === target.id ? { ...section, name } : section,
        ),
      );
    },
    [rpc],
  );

  const removeFilterEntity = useCallback(
    async (target: FilterEntityTarget) => {
      if (target.kind === "project") {
        await rpc.call("deleteProject", { projectId: target.id });
      } else {
        await rpc.call("deleteSection", { sectionId: target.id });
        setSections((current) =>
          current.filter((section) => section.id !== target.id),
        );
      }
      if (threadFilter?.kind === target.kind && threadFilter.id === target.id) {
        changeThreadFilter(null);
      }
    },
    [changeThreadFilter, rpc, threadFilter],
  );

  const filterControl = showSidebarFilter ? (
    <ThreadFilter
      newProjectDisabled={projectCreatePending}
      projectIcons={projectIcons}
      sectionIcons={sectionIcons}
      projectActionStates={projectActionStates}
      projects={sidebar.projects}
      sections={sections}
      value={threadFilter}
      onChange={changeThreadFilter}
      onHide={() => void saveSettings({ showSidebarFilter: false })}
      onNewProject={() => void createProject()}
      onNewSection={() => setNewSectionOpen(true)}
      onAddProjectLocalPath={(project) =>
        void addProjectLocalPath(project.id)
      }
      onOpenProjectSettings={(project) => {
        window.location.assign(
          `/projects/${encodeURIComponent(project.id)}/settings`,
        );
      }}
      onRemoveProject={(project) =>
        setRemoveTarget({ kind: "project", ...project })
      }
      onRemoveSection={(section) =>
        setRemoveTarget({ kind: "section", ...section })
      }
      onRenameProject={(project) =>
        setRenameTarget({ kind: "project", ...project })
      }
      onRenameSection={(section) =>
        setRenameTarget({ kind: "section", ...section })
      }
    />
  ) : null;
  const filterDialogs = (
    <>
      <ThreadSectionDialog
        open={newSectionOpen}
        onCreate={createSection}
        onOpenChange={setNewSectionOpen}
      />
      <FilterEntityRenameDialog
        target={renameTarget}
        onOpenChange={(open) => {
          if (!open) setRenameTarget(null);
        }}
        onRename={renameFilterEntity}
      />
      <FilterEntityRemoveDialog
        target={removeTarget}
        onOpenChange={(open) => {
          if (!open) setRemoveTarget(null);
        }}
        onRemove={removeFilterEntity}
      />
    </>
  );

  function toggleCollapsed(group: SidebarGroup): void {
    setCollapsedSections((current) => {
      const next = new Set(current);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  }

  function toggleThreadCollapsed(threadId: string): void {
    setCollapsedThreads((current) => {
      const next = new Set(current);
      if (next.has(threadId)) next.delete(threadId);
      else next.add(threadId);
      return next;
    });
  }

  if (
    sidebar.status === "loading" ||
    (organization === null && loadError === null)
  ) {
    return <LoadingState />;
  }
  if (sidebar.status === "error") {
    return (
      <SidebarMessage icon="AlertCircle">Could not load threads.</SidebarMessage>
    );
  }
  if (organization === null) {
    if (loadError?.includes(OWNERSHIP_TRANSFER_ERROR)) {
      return (
        <div className="flex min-w-0 flex-col gap-1">
          <SidebarMessage icon="CircleQuestion">
            Ribbon sidebar now owns stage placement. The original thread list is
            available below while Ribbon recovers.
          </SidebarMessage>
          <OriginalThreadList />
        </div>
      );
    }
    return (
      <SidebarMessage
        icon="AlertCircle"
        action={{
          label: "Retry",
          onClick: () => {
            setLoadError(null);
            void refresh();
          },
        }}
      >
        Could not load stages.
      </SidebarMessage>
    );
  }

  if (
    normalizedSearch &&
    (search.query !== normalizedSearch || search.status === "loading")
  ) {
    return (
      <SidebarMessage icon="Loading" isLoading>
        Searching threads...
      </SidebarMessage>
    );
  }
  if (normalizedSearch && search.status === "error") {
    return <SidebarMessage icon="AlertCircle">Search failed.</SidebarMessage>;
  }
  if (displayThreads.length === 0) {
    return (
      <SidebarStageLayout
        dialog={filterDialogs}
        error={error}
        filterControl={filterControl}
        onDragEnd={clearDrag}
      >
        <SidebarMessage icon="CircleQuestion">
          {normalizedSearch
            ? "No matching threads"
            : threadFilter?.kind === "project"
              ? "No threads in this project"
              : threadFilter?.kind === "section"
                ? "No threads in this section"
                : "No threads yet"}
        </SidebarMessage>
      </SidebarStageLayout>
    );
  }
  return (
    <SidebarStageLayout
      dialog={filterDialogs}
      error={error}
      filterControl={filterControl}
      onDragEnd={clearDrag}
    >
      <div className="space-y-4">
        {pinnedState.pinnedThreads.length > 0 ? (
          <SidebarSection
            label={PINNED_SECTION}
            threads={pinnedState.pinnedThreads}
            collapsed={collapsedSections.has(PINNED_SECTION)}
            dropTarget={
              dropGroup === PINNED_SECTION &&
              dropBefore === null &&
              dropAfter === null
            }
            onToggle={() => toggleCollapsed(PINNED_SECTION)}
            onDragOverEnd={(event) => {
              if (!draggingThreadId || !pinnedRootIds.has(draggingThreadId)) {
                return;
              }
              event.preventDefault();
              setDropGroup(PINNED_SECTION);
              setDropBefore(null);
              setDropAfter(null);
            }}
            onDropAtEnd={(event) => {
              if (!draggingThreadId || !pinnedRootIds.has(draggingThreadId)) {
                return;
              }
              event.preventDefault();
              void commitPinnedMove(draggingThreadId, null);
            }}
          >
            <ul>
              {pinnedHierarchyRows.map(
                ({ thread, depth, hasChildren, descendants }) => {
                  const rootIndex = pinnedRootThreads.findIndex(
                    (item) => item.id === thread.id,
                  );
                  const isRoot = rootIndex >= 0;
                  const childrenCollapsed = collapsedThreads.has(thread.id);
                  const indicatorThread =
                    childrenCollapsed && hasChildren
                      ? (groupIndicator([thread, ...descendants]) ?? thread)
                      : thread;
                  const workflowStage =
                    isRoot
                      ? (assignmentByThreadId.get(thread.id)?.workflowStage ??
                        DEFAULT_WORKFLOW_STAGE)
                      : null;
                  return (
                    <ThreadRow
                      key={thread.id}
                      actions={actions}
                      active={thread.id === activeThreadId}
                      childrenCollapsed={childrenCollapsed}
                      depth={depth}
                      disabled={
                        Boolean(normalizedSearch) ||
                        mutationPending ||
                        unsyncedThreadIds.length > 0
                      }
                      dragging={thread.id === draggingThreadId}
                      hasChildren={hasChildren}
                      indicatorThread={indicatorThread}
                      onChangeStage={(nextStage) => {
                        void commitMove(thread.id, nextStage, null);
                      }}
                      onCreateSection={(name) =>
                        createSectionForThread(thread.id, name)
                      }
                      onDragEnd={clearDrag}
                      onDragOver={(event) => {
                        if (
                          !isRoot ||
                          !draggingThreadId ||
                          !pinnedRootIds.has(draggingThreadId)
                        ) {
                          setDropGroup(null);
                          setDropBefore(null);
                          setDropAfter(null);
                          return;
                        }
                        setDropGroup(PINNED_SECTION);
                        const bounds =
                          event.currentTarget.getBoundingClientRect();
                        const isAfter =
                          event.clientY > bounds.top + bounds.height / 2;
                        if (isAfter) {
                          setDropBefore(
                            pinnedRootThreads[rootIndex + 1]?.id ?? null,
                          );
                          setDropAfter(thread.id);
                        } else {
                          setDropBefore(thread.id);
                          setDropAfter(null);
                        }
                      }}
                      onDragStart={(event) => {
                        event.stopPropagation();
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("text/plain", thread.id);
                        setDraggingThreadId(thread.id);
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        if (
                          !isRoot ||
                          !draggingThreadId ||
                          !pinnedRootIds.has(draggingThreadId)
                        ) {
                          clearDrag();
                          return;
                        }
                        void commitPinnedMove(draggingThreadId, dropBefore);
                      }}
                      onNavigate={onNavigate}
                      onRefreshSections={() => void refreshSections()}
                      onSetSection={(sectionId) =>
                        void setThreadSection(thread.id, sectionId)
                      }
                      onToggleChildren={() =>
                        toggleThreadCollapsed(thread.id)
                      }
                      preview={
                        showThreadPreviews
                          ? (previews.get(thread.id) ?? null)
                          : null
                      }
                      projectIcon={projectIcons.get(thread.projectId) ?? null}
                      reorderable={isRoot && !Boolean(normalizedSearch)}
                      sectionIcons={sectionIcons}
                      showDropAfter={
                        dropGroup === PINNED_SECTION &&
                        dropAfter === thread.id
                      }
                      showDropBefore={
                        dropGroup === PINNED_SECTION &&
                        dropAfter === null &&
                        dropBefore === thread.id
                      }
                      sections={sections}
                      workflowStage={workflowStage}
                      workflowStages={enabledStages}
                      thread={thread}
                    />
                  );
                },
              )}
            </ul>
          </SidebarSection>
        ) : null}
        {displayedStages.map((stage) => {
          const allThreads = groups[stage];
          const shownThreads = allThreads;
          const idsInStage = new Set(allThreads.map((thread) => thread.id));
          const hierarchyRows = flattenThreadHierarchy(
            shownThreads,
            normalizedSearch ? new Set<string>() : collapsedThreads,
          );
          const rootThreads = flattenThreadHierarchy(
            allThreads,
            new Set<string>(),
          )
            .filter(({ depth }) => depth === 0)
            .map(({ thread }) => thread);
          const isCollapsed = collapsedSections.has(stage);
          if (normalizedSearch && shownThreads.length === 0) return null;
          return (
            <SidebarSection
              key={stage}
              label={stage}
              count={rootThreads.length}
              threads={shownThreads}
              collapsed={isCollapsed}
              dropTarget={
                dropGroup === stage && dropBefore === null && dropAfter === null
              }
              onToggle={() => toggleCollapsed(stage)}
              onDragOverEnd={(event) => {
                if (
                  !draggingThreadId ||
                  pinnedRootIds.has(draggingThreadId) ||
                  !enabledStageSet.has(stage)
                ) {
                  return;
                }
                event.preventDefault();
                setDropGroup(stage);
                setDropBefore(null);
                setDropAfter(null);
              }}
              onDropAtEnd={(event) => {
                if (
                  !draggingThreadId ||
                  pinnedRootIds.has(draggingThreadId) ||
                  !enabledStageSet.has(stage)
                ) {
                  return;
                }
                event.preventDefault();
                void commitMove(draggingThreadId, stage, null);
              }}
            >
              <ul>
                {hierarchyRows.map(
                  ({ thread, depth, hasChildren, descendants }) => {
                    const rootIndex = rootThreads.findIndex(
                      (item) => item.id === thread.id,
                    );
                    const isRoot = rootIndex >= 0;
                    const childrenCollapsed = collapsedThreads.has(thread.id);
                    const indicatorThread =
                      childrenCollapsed && hasChildren
                        ? (groupIndicator([thread, ...descendants]) ?? thread)
                        : thread;
                    return (
                      <ThreadRow
                        key={thread.id}
                        actions={actions}
                        active={thread.id === activeThreadId}
                        childrenCollapsed={childrenCollapsed}
                        depth={depth}
                        disabled={
                          Boolean(normalizedSearch) ||
                          mutationPending ||
                          unsyncedThreadIds.length > 0
                        }
                        dragging={thread.id === draggingThreadId}
                        hasChildren={hasChildren}
                        indicatorThread={indicatorThread}
                        onChangeStage={(nextStage) => {
                          if (isRoot) {
                            void commitMove(thread.id, nextStage, null);
                          }
                        }}
                        onCreateSection={(name) =>
                          createSectionForThread(thread.id, name)
                        }
                        onDragEnd={clearDrag}
                        onDragOver={(event) => {
                          const draggedThread = rootThreads.find(
                            (item) => item.id === draggingThreadId,
                          );
                          if (
                            !isRoot ||
                            draggedThread === undefined ||
                            pinnedRootIds.has(draggedThread.id) ||
                            !canDropThreadBeside(
                              draggedThread,
                              thread,
                              idsInStage,
                            )
                          ) {
                            setDropGroup(null);
                            setDropBefore(null);
                            setDropAfter(null);
                            return;
                          }
                          setDropGroup(stage);
                          const bounds =
                            event.currentTarget.getBoundingClientRect();
                          const isAfter =
                            event.clientY > bounds.top + bounds.height / 2;
                          if (isAfter) {
                            setDropBefore(rootThreads[rootIndex + 1]?.id ?? null);
                            setDropAfter(thread.id);
                          } else {
                            setDropBefore(thread.id);
                            setDropAfter(null);
                          }
                        }}
                        onDragStart={(event) => {
                          event.stopPropagation();
                          event.dataTransfer.effectAllowed = "move";
                          event.dataTransfer.setData("text/plain", thread.id);
                          setDraggingThreadId(thread.id);
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          if (!draggingThreadId) return;
                          const draggedThread = rootThreads.find(
                            (item) => item.id === draggingThreadId,
                          );
                          if (
                            !isRoot ||
                            draggedThread === undefined ||
                            pinnedRootIds.has(draggedThread.id) ||
                            !canDropThreadBeside(
                              draggedThread,
                              thread,
                              idsInStage,
                            )
                          ) {
                            clearDrag();
                            return;
                          }
                          void commitMove(draggingThreadId, stage, dropBefore);
                        }}
                        onNavigate={onNavigate}
                        onRefreshSections={() => void refreshSections()}
                        onSetSection={(sectionId) =>
                          void setThreadSection(thread.id, sectionId)
                        }
                        onToggleChildren={() =>
                          toggleThreadCollapsed(thread.id)
                        }
                        preview={
                          showThreadPreviews
                            ? (previews.get(thread.id) ?? null)
                            : null
                        }
                        projectIcon={projectIcons.get(thread.projectId) ?? null}
                        reorderable={isRoot && !Boolean(normalizedSearch)}
                        sectionIcons={sectionIcons}
                        showDropAfter={
                          dropGroup === stage && dropAfter === thread.id
                        }
                        showDropBefore={
                          dropGroup === stage &&
                          dropAfter === null &&
                          dropBefore === thread.id
                        }
                        sections={sections}
                        workflowStage={isRoot ? stage : null}
                        workflowStages={enabledStages}
                        thread={thread}
                      />
                    );
                  },
                )}
              </ul>
            </SidebarSection>
          );
        })}
      </div>
    </SidebarStageLayout>
  );
}

type RpcEnvelope<Result> =
  | { ok: true; result: Result }
  | { ok: false; error: unknown };

function rpcErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "string") return error;
  if (
    error !== null &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }
  return fallback;
}

/**
 * The stage chords run in a content script, where the SDK's hooks do not
 * reach. The sidebar list is mounted wherever it draws, so it lends the
 * chords bb's own "new thread in this project" action instead of the plugin
 * arranging the composer's project itself.
 */
let openPersonalCompose: (() => void) | null = null;
/** bb keeps project-less threads in the personal project, under a reserved id. */
const PERSONAL_PROJECT_ID = "proj_personal";

type ChordDestination =
  | { kind: "stay" }
  | { kind: "thread"; threadId: string; projectId: string | null }
  | { kind: "compose" };

/** Routes bb's SPA without a reload, and only in this client. */
function navigate(path: string): void {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate", { state: {} }));
}

function goTo(
  destination: ChordDestination,
  openComposer: () => void,
): void {
  if (destination.kind === "stay") return;
  if (destination.kind === "thread") {
    // bb routes a personal-project thread without a project segment; the
    // project-scoped path would land on the composer instead.
    const projectless =
      destination.projectId === null ||
      destination.projectId === PERSONAL_PROJECT_ID;
    navigate(
      projectless
        ? `/threads/${encodeURIComponent(destination.threadId)}`
        : `/projects/${encodeURIComponent(destination.projectId ?? "")}/threads/${encodeURIComponent(destination.threadId)}`,
    );
    return;
  }
  if (openPersonalCompose !== null) {
    openPersonalCompose();
    return;
  }
  // Without the list mounted there is nothing to ask, so fall back to bb's
  // own New thread command, which opens the composer where it left off.
  openComposer();
}

async function listAppKeybindings(pluginId: string): Promise<unknown> {
  const response = await fetch(
    `/api/v1/plugins/${encodeURIComponent(pluginId)}/rpc/listAppKeybindings`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "null",
      credentials: "same-origin",
    },
  );
  const envelope = (await response.json()) as RpcEnvelope<unknown>;
  if (!response.ok || !envelope.ok) {
    throw new Error(
      !envelope.ok
        ? rpcErrorMessage(envelope.error, "Failed to read bb's keybindings")
        : `Keybinding request failed (${response.status})`,
    );
  }
  return envelope.result;
}

async function callWorkflowRpc(
  pluginId: string,
  method: "setWorkflowStage" | "reorderThread",
  input: Record<string, unknown>,
): Promise<unknown> {
  const response = await fetch(
    `/api/v1/plugins/${encodeURIComponent(pluginId)}/rpc/${method}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
      credentials: "same-origin",
    },
  );
  const envelope = (await response.json()) as RpcEnvelope<unknown>;
  if (!response.ok || !envelope.ok) {
    throw new Error(
      !envelope.ok
        ? rpcErrorMessage(envelope.error, "Failed to move the thread")
        : `Stage request failed (${response.status})`,
    );
  }
  return envelope.result;
}

export default definePluginApp((app) => {
  app.slots.experimental_threadList({
    id: "workflow-stage",
    title: "Thread stages",
    description: "Organize root threads into manually ordered stages.",
    component: WorkflowStageList,
  });

  app.contentScripts.register({
    id: "new-thread-section",
    mount({ signal }) {
      const dispose = mountSectionAwareComposeNavigation(window);
      signal.addEventListener("abort", dispose, { once: true });
      return dispose;
    },
  });

  app.contentScripts.register({
    id: "workflow-shortcuts",
    mount({ pluginId, signal }) {
      let shortcutStages: readonly WorkflowStage[] = WORKFLOW_STAGES;
      const refreshShortcutStages = async () => {
        try {
          const response = await fetch(
            `/api/v1/plugins/${encodeURIComponent(pluginId)}/settings`,
            { credentials: "same-origin", signal },
          );
          if (!response.ok) return;
          const body = (await response.json()) as {
            values?: Record<string, string | boolean>;
          };
          shortcutStages = enabledWorkflowStages(body.values);
        } catch {
          // Keep the last known settings while the host is reconnecting.
        }
      };
      void refreshShortcutStages();
      window.addEventListener("focus", () => void refreshShortcutStages(), {
        signal,
      });
      const createKeyboardEvent = (type: string, init: KeyboardEventInit) =>
        new KeyboardEvent(type, init);
      const newThreadCommand = createNativeCommandDelegate({
        command: "thread.new",
        createEvent: createKeyboardEvent,
        fetchConfig: () => listAppKeybindings(pluginId),
        isMac: /Mac|iPhone|iPad|iPod/u.test(navigator.platform),
        target: window,
      });
      void newThreadCommand.prefetch();
      window.addEventListener(
        "keydown",
        (event) => {
          if (newThreadCommand.isDelegatedEvent(event)) return;
          const workflowStage = workflowStageShortcut(event, shortcutStages);
          const reorder = workflowReorderShortcut(event);
          if (workflowStage === null && reorder === null) return;
          const threadId = currentThreadId(window.location.pathname);
          if (threadId === null) return;

          // Claim the chord everywhere, including editors and composers.
          event.preventDefault();
          event.stopPropagation();
          notifyNativeShortcutHandled(window, createKeyboardEvent);
          const request =
            reorder === null
              ? callWorkflowRpc(pluginId, "setWorkflowStage", {
                  workflowStage,
                  threadId,
                }).then((result) => {
                  goTo(
                    (result as { destination: ChordDestination }).destination,
                    () => void newThreadCommand.dispatch(),
                  );
                })
              : callWorkflowRpc(pluginId, "reorderThread", {
                  threadId,
                  scope: reorder.scope,
                  direction: reorder.direction,
                });
          void request.catch((error: unknown) => {
            toast.error(rpcErrorMessage(error, "Failed to move the thread"));
          });
        },
        { capture: true, signal },
      );
    },
  });

  app.contentScripts.register({
    id: "sidebar-content-spacing",
    mount({ signal }) {
      return mountSidebarContentSpacing(signal);
    },
  });
});
