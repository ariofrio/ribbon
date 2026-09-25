import { useSortable } from "@dnd-kit/sortable";
import {
  definePluginApp,
  experimental_useSidebarThreadActions,
  experimental_useSidebarThreadPullRequest,
  experimental_useSidebarThreads,
  experimental_useSidebarThreadSplit,
  useBbNavigate,
  useRealtime,
  useRealtimeConnectionState,
  useRpc,
  useSettings,
  useSidebarThreadDraftIds,
  useSidebarThreadRowStatuses,
  type PluginSidebarThread,
  type PluginThreadListProps,
} from "@get-bb/plugin-sdk/app";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import type { z } from "zod";
import { CHROME_SECTION_LABEL_CLASS } from "./chrome-style-tokens";
import type { IconDataV1 } from "./contracts";
import { GroupHeaderMenu, type HeaderGroupActions } from "./group-header-menu";
import { orderedGroupings } from "./grouping-order";
import {
  ICON_INDICATOR_SPACE_ATTRIBUTE,
  ICON_LAYOUT_ATTRIBUTE,
  publishIconStyles,
  type IconFallback,
} from "./icon-styles";
import { usePersistentStringSet } from "./persistent-string-set";
import type { GroupingKey, PlacementRecordV1 } from "./placement-store";
import { ProviderIcon } from "./provider-icon";
import { sectionBands } from "./section-layout";
import type { rpcContract } from "./server";
import { mountSidebarContentSpacing } from "./sidebar-content-spacing";
import { SidebarDisplayOptionsMenu } from "./sidebar-display-options-menu";
import { SidebarTopControls } from "./sidebar-top-controls";
import { SplitPaneMiniMap } from "./split-pane-mini-map";
import { StagePreview } from "./stage-preview";
import {
  ThreadActionsContextMenu,
  ThreadActionsDropdown,
  type AssignmentGroupOption,
} from "./thread-actions-menu";
import {
  ThreadDragGroup,
  ThreadDragHeader,
  ThreadDragProvider,
  ThreadDropPreview,
  type ThreadDragDestination,
  type ThreadDragTarget,
} from "./thread-drag";
import { groupIndicator, ThreadIndicator } from "./thread-indicator";
import {
  resolveThreadStatus,
  withPullRequestSignal,
  type ThreadStatus,
} from "./thread-status";
import { ThreadTitle } from "./thread-title";
import { UnorganizedIcon } from "./unorganized-icon";
import { Button } from "./vendor/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./vendor/components/ui/dialog";
import { pullRequestSignal } from "./pull-request-status";
import {
  PullRequestDetailsProvider,
  usePullRequestDetails,
  type PullRequestDetailsRequest,
} from "./pull-request-details-store";
import { Icon } from "./vendor/components/ui/icon";
import { Input } from "./vendor/components/ui/input";
import {
  loadSidebarPreferences,
  saveSidebarPreferences,
  type PullRequestNumberPosition,
  type SidebarPreferences,
  type SidebarSort,
} from "./view-state";
import { STAGE_ICONS, THREAD_STAGES_GROUPING_KEY } from "./workflow/catalog";
import { registerWorkflowCommands } from "./workflow/commands";
import { parseWorkflowStage } from "./workflow/workflow-stage";

// bb clears its legacy key during preference hydration; Ribbon owns this key.
const COLLAPSED_THREADS_STORAGE_KEY =
  "bb.plugin.ribbon-sidebar.collapsedThreads";
const LEGACY_COLLAPSED_THREADS_STORAGE_KEY = "bb.sidebar.collapsedThreads";
/** bb keeps project-less threads in the personal project, under a reserved id. */
const PERSONAL_PROJECT_ID = "proj_personal";

// bb's own pull request colors, plus amber for a PR that will merge on its
// own (GitHub's merge-queue color).
const PR_LIFECYCLE_ICONS = {
  open: { name: "GitPullRequestArrow", className: "text-success" },
  auto: { name: "GitMerge", className: "text-attention" },
  closed: { name: "GitPullRequestClosed", className: "text-destructive" },
  merged: { name: "GitMerge", className: "text-pr-merged" },
  draft: { name: "GitPullRequestDraft", className: "text-muted-foreground" },
} as const;

type SidebarSnapshot = z.output<typeof rpcContract.sidebarSnapshotV1.output>;
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

function title(thread: Pick<PluginSidebarThread, "title" | "titleFallback">) {
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
    displayTitle: title(thread),
    lifecycleOwnerThreadId: null,
    sourceThreadId: null,
    status: "idle",
    runtimeStatus: "idle",
    queuedWork: "none",
    pinnedAt: null,
    pinSortKey: null,
    archivedAt: null,
    href: `/projects/${encodeURIComponent(thread.projectId)}/threads/${encodeURIComponent(thread.id)}`,
    isHidden: false,
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
    ...archivedSearchThread(thread),
    ...thread,
    isHidden: thread.visibility === "hidden",
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
  hasUnsubmittedDraft,
  icon,
  dragging,
  dragTarget,
  projected,
  muted,
  onNewSection,
  onOpen,
  onRename,
  onSetSection,
  onToggleChildren,
  placementDisabled,
  preview,
  pullRequestNumberPosition,
  reorderable,
  rootThreadId,
  sections,
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
  indicatorThread: ThreadStatus;
  hasUnsubmittedDraft: boolean;
  icon: ReactNode;
  dragging: boolean;
  dragTarget?: ThreadDragTarget;
  projected: boolean;
  muted: boolean;
  onNewSection(): void;
  onOpen(split: boolean): void;
  onRename(): void;
  onSetSection(sectionId: string | null): void;
  onToggleChildren(): void;
  placementDisabled: boolean;
  preview: string | null;
  pullRequestNumberPosition: PullRequestNumberPosition;
  reorderable: boolean;
  rootThreadId: string;
  sections: readonly { id: string; label: string }[];
  thread: PluginSidebarThread;
}) {
  const {
    splitProps,
    isAvailable: splitAvailable,
    layout,
  } = experimental_useSidebarThreadSplit(thread.id);
  const { pullRequest } = experimental_useSidebarThreadPullRequest(thread.id);
  const visiblePullRequest =
    pullRequestNumberPosition === "hidden" ? null : pullRequest;
  const pullRequestDetails = usePullRequestDetails(visiblePullRequest);
  const pullRequestStatus = visiblePullRequest
    ? pullRequestSignal(visiblePullRequest, pullRequestDetails)
    : null;
  const status = withPullRequestSignal(indicatorThread, pullRequestStatus);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const rowTitle = title(thread);
  const sortable = useSortable({
    id: thread.id,
    disabled: !reorderable,
    data: { target: dragTarget, label: rowTitle },
  });
  const accessibleTitle = preview ? `${rowTitle} — ${preview}` : rowTitle;
  const showPullRequest =
    visiblePullRequest !== null && pullRequestStatus !== null;
  const pullRequestIcon = pullRequestStatus
    ? PR_LIFECYCLE_ICONS[pullRequestStatus.lifecycle]
    : null;
  const pullRequestNumber =
    showPullRequest && pullRequestIcon ? (
      <span
        className={`inline-flex shrink-0 items-center gap-1 text-subtle-foreground/75 ${
          pullRequestNumberPosition === "right" ? "ml-auto" : ""
        }`}
        title={
          pullRequestStatus.label
            ? `${visiblePullRequest.title} — ${pullRequestStatus.label}`
            : visiblePullRequest.title
        }
      >
        <Icon
          name={pullRequestIcon.name}
          className={`size-4 shrink-0 ${pullRequestIcon.className}`}
          aria-hidden
        />
        #{visiblePullRequest.number}
      </span>
    ) : null;
  const actionsOpen = dropdownOpen || contextOpen;
  const showChildToggleAtRest = hasChildren && childrenCollapsed;
  const hasIcon = icon !== null;
  const iconSpansEntireItem = alignAdornmentsToEntireItem && preview !== null;
  const hasTrailingIndicator =
    layout !== null ||
    status.indicator !== "none" ||
    status.pluginStatus !== null ||
    status.pullRequestMark !== null;
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
      data-ribbon-root-id={rootThreadId}
      style={
        dragging
          ? {
              opacity: 0,
              pointerEvents: "none",
              position: projected ? "absolute" : undefined,
              width: "100%",
            }
          : undefined
      }
    >
      <div
        className={`bb-sidebar-hover-actions-row group/thread-row relative grid w-full items-start rounded-md pr-0 text-sm transition-colors ${
          reservesTrailingLane
            ? "grid-cols-[minmax(0,1fr)_auto] gap-x-1"
            : "grid-cols-1"
        } ${
          active
            ? "bg-sidebar-accent"
            : "cursor-pointer hover:bg-sidebar-accent"
        } ${
          muted
            ? "text-subtle-foreground/75"
            : active
              ? "text-sidebar-foreground"
              : "text-sidebar-foreground/85 hover:text-sidebar-accent-foreground dark:text-sidebar-foreground"
        } ${layout !== null && !active ? "bg-sidebar-accent/50" : ""} ${reorderable ? "select-none" : ""}`}
        ref={sortable.setNodeRef}
        onDragStart={(event) => event.preventDefault()}
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
          {...(reorderable ? sortable.attributes : {})}
          {...(reorderable ? sortable.listeners : {})}
          ref={sortable.setActivatorNodeRef}
          role="link"
          aria-current={active ? "page" : undefined}
          aria-label={`Open ${accessibleTitle}${showPullRequest ? ` (PR #${visiblePullRequest.number})` : ""}${hasUnsubmittedDraft ? " (unsubmitted draft)" : ""}`}
          className="absolute inset-0 rounded-md outline-none ring-sidebar-ring focus-visible:ring-2"
          data-sidebar-thread-id={thread.id}
          data-sidebar-thread-shortcut-target=""
          draggable={false}
          href={`/projects/${encodeURIComponent(thread.projectId)}/threads/${encodeURIComponent(thread.id)}`}
          onClick={openThread}
        />
        <span
          className="grid min-w-0 gap-x-2 py-[calc((var(--bb-sidebar-row-height)-1lh)/2)] max-md:pointer-coarse:py-[calc((var(--bb-sidebar-row-height-coarse)-1lh)/2)]"
          style={{
            gridTemplateColumns: [
              ...(hasIcon ? ["auto"] : []),
              "minmax(0, 1fr)",
              ...(alignsTrailingIndicatorToTitle ? ["auto"] : []),
            ].join(" "),
          }}
          {...{ [ICON_LAYOUT_ATTRIBUTE]: "" }}
        >
          {hasIcon ? (
            <span
              className="col-start-1 row-start-1 flex self-center"
              data-ribbon-sidebar-icon-slot=""
              style={{
                gridRowEnd: iconSpansEntireItem ? "span 2" : "auto",
                gridRowStart: 1,
              }}
            >
              {icon}
            </span>
          ) : null}
          <span
            className={`row-start-1 flex min-w-0 items-center ${
              !hasTrailingIndicator && !thread.isArchived
                ? showChildToggleAtRest
                  ? "pr-8 max-md:pointer-coarse:pr-2!"
                  : "pr-2 group-hover/thread-row:pr-8 group-has-[:focus-visible]/thread-row:pr-8 group-has-[[data-sidebar-hover-actions-open=true]]/thread-row:pr-8 max-md:pointer-coarse:pr-2!"
                : ""
            }`}
            style={{
              gridColumnStart: hasIcon ? 2 : 1,
              paddingRight:
                !hasTrailingIndicator && thread.isArchived ? 8 : undefined,
            }}
          >
            <span
              className="flex min-w-0 flex-1 items-center gap-2"
              title={accessibleTitle}
            >
              {pullRequestNumberPosition === "left" ? pullRequestNumber : null}
              <ThreadTitle title={rowTitle} />
              {pullRequestNumberPosition === "right" ? pullRequestNumber : null}
            </span>
            {hasChildren ? (
              <Button
                aria-expanded={!childrenCollapsed}
                aria-label={
                  childrenCollapsed
                    ? `Expand ${rowTitle} threads`
                    : `Collapse ${rowTitle} threads`
                }
                variant="ghost"
                size="icon"
                className={`relative z-20 size-5 shrink-0 overflow-hidden p-0 text-subtle-foreground ring-sidebar-ring focus-visible:bg-state-hover focus-visible:ring-2 [&_[data-icon-root]]:size-3 ${
                  showChildToggleAtRest
                    ? "ml-2"
                    : "bb-sidebar-hover-actions w-0 group-hover/thread-row:ml-2 group-hover/thread-row:w-5 group-has-[:focus-visible]/thread-row:ml-2 group-has-[:focus-visible]/thread-row:w-5 max-md:pointer-coarse:group-[:not(:has(:focus-visible))]/thread-row:ml-0! max-md:pointer-coarse:group-[:not(:has(:focus-visible))]/thread-row:w-0!"
                } ${
                  !thread.isArchived
                    ? showChildToggleAtRest
                      ? "-mr-1 max-md:pointer-coarse:mr-0!"
                      : "group-hover/thread-row:-mr-1 group-has-[:focus-visible]/thread-row:-mr-1 max-md:pointer-coarse:mr-0!"
                    : ""
                }`}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onToggleChildren();
                }}
                type="button"
              >
                <Icon
                  name="ChevronRight"
                  className={`size-3 transition-transform duration-150 ${childrenCollapsed ? "" : "rotate-90"}`}
                  aria-hidden
                />
              </Button>
            ) : null}
          </span>
          {alignsTrailingIndicatorToTitle ? (
            <span
              aria-hidden="true"
              className="row-start-1 -ml-1 w-7 max-md:pointer-coarse:w-9"
              style={{ gridColumnStart: hasIcon ? 3 : 2 }}
              {...{ [ICON_INDICATOR_SPACE_ATTRIBUTE]: "" }}
            />
          ) : null}
          {preview ? (
            <span
              className="row-start-2 truncate text-[11px] leading-4 text-subtle-foreground/75"
              style={{
                gridColumnEnd: alignsTrailingIndicatorToTitle
                  ? hasIcon
                    ? 4
                    : 3
                  : undefined,
                gridColumnStart: hasIcon ? 2 : 1,
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
                    active={status.isWorking}
                    label={
                      status.indicatorLabel
                        ? `${rowTitle} — open in split; ${status.indicatorLabel}`
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
                    indicator={status.indicator}
                    label={status.indicatorLabel}
                    pluginStatus={status.pluginStatus}
                    pullRequestMark={status.pullRequestMark}
                    hideIdleDraftLabel={!(hasChildren && childrenCollapsed)}
                  />
                </span>
              )}
            </span>
            {!thread.isArchived ? (
              <span
                className="bb-sidebar-hover-actions absolute inset-y-0 right-0 z-10 flex w-7 items-center justify-end max-md:pointer-coarse:hidden"
                data-sidebar-hover-actions-open={
                  actionsOpen ? "true" : undefined
                }
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
    <ThreadActionsContextMenu
      {...commonMenuProps}
      onOpenChange={setContextOpen}
    >
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
          <Button
            onClick={action.onClick}
            size="sm"
            type="button"
            variant="outline"
          >
            {action.label}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function RibbonSidebarList({
  activeThreadId,
  onNavigate,
  searchQuery,
}: PluginThreadListProps) {
  const rpc = useRpc<typeof rpcContract>();
  const rpcRef = useRef(rpc);
  rpcRef.current = rpc;
  const loadPullRequestDetails = useCallback(
    (requests: readonly PullRequestDetailsRequest[]) =>
      rpcRef.current
        .call("pullRequestDetailsV1", { requests: [...requests] })
        .then(({ details }) => details),
    [],
  );
  const navigate = useBbNavigate();
  const sidebar = experimental_useSidebarThreads();
  const actions = experimental_useSidebarThreadActions();
  const draftThreadIds = useSidebarThreadDraftIds();
  const threadRowStatuses = useSidebarThreadRowStatuses();
  const settings = useSettings();
  const connection = useRealtimeConnectionState();
  const [snapshot, setSnapshot] = useState<SidebarSnapshot | null>(null);
  const [preferences, setPreferences] = useState<SidebarPreferences | null>(
    null,
  );
  const [placementLists, setPlacementLists] = useState<
    ReadonlyMap<GroupingKey, readonly PlacementRecordV1[]>
  >(new Map());
  const selectedGroupingKey =
    preferences?.view.groupingKey ?? "builtin:sections";
  const placements = useMemo(
    () => placementLists.get(selectedGroupingKey) ?? [],
    [placementLists, selectedGroupingKey],
  );
  const [assignmentPlacements, setAssignmentPlacements] = useState<
    ReadonlyMap<string, ReadonlyMap<string, PlacementRecordV1>>
  >(new Map());
  const assignmentRequest = useRef(0);
  const latestPlacementRevisions = useRef(new Map<GroupingKey, number>());
  const [previews, setPreviews] = useState<ReadonlyMap<string, string | null>>(
    new Map(),
  );
  const [supplementalThreads, setSupplementalThreads] = useState<
    readonly SupplementalThread[]
  >([]);
  const [collapsedThreadIds, setCollapsedThreadIds] = usePersistentStringSet(
    COLLAPSED_THREADS_STORAGE_KEY,
    LEGACY_COLLAPSED_THREADS_STORAGE_KEY,
  );
  const [threadRename, setThreadRename] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [threadRenamePending, setThreadRenamePending] = useState(false);
  const [placementsLoaded, setPlacementsLoaded] = useState(false);
  const [stagesLoaded, setStagesLoaded] = useState(false);
  const [previewsLoaded, setPreviewsLoaded] = useState(false);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [draggingThreadId, setDraggingThreadId] = useState<string | null>(null);
  const [dragDestination, setDragDestination] =
    useState<ThreadDragDestination | null>(null);
  const [optimisticMoves, setOptimisticMoves] = useState<
    {
      id: number;
      groupingKey: GroupingKey;
      threadId: string;
      destination: ThreadDragDestination;
    }[]
  >([]);
  const moveSequence = useRef(0);
  const moveQueue = useRef(Promise.resolve());
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
  const normalizedSearch = searchQuery.trim().toLocaleLowerCase();

  const synchronize = useCallback(async () => {
    const next = await rpc.call("synchronizeV1", {
      migrateThreadStages: !mounted.current,
    });
    mounted.current = true;
    setSnapshot(next);
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
    await Promise.all(
      (["builtin:sections", "builtin:projects"] as const).map(
        async (groupingKey) => {
          const result = await rpc.call("listPlacementsV1", { groupingKey });
          if (!result.ok) throw new Error(result.error.message);
          // Each grouping keeps its own snapshot; switching views cannot apply a
          // late section response to projects, or undo a newer saved order.
          if (
            result.value.revision <
            (latestPlacementRevisions.current.get(groupingKey) ?? -1)
          )
            return;
          latestPlacementRevisions.current.set(
            groupingKey,
            result.value.revision,
          );
          setPlacementLists((current) =>
            new Map(current).set(
              groupingKey,
              result.value.items as PlacementRecordV1[],
            ),
          );
        },
      ),
    );
    setPlacementsLoaded(true);
  }, [rpc]);

  const loadAssignmentPlacements = useCallback(async () => {
    const request = ++assignmentRequest.current;
    const result = await rpc.call("listPlacementsV1", {
      groupingKey: THREAD_STAGES_GROUPING_KEY,
    });
    if (!result.ok) throw new Error(result.error.message);
    if (request !== assignmentRequest.current) return;
    setAssignmentPlacements(
      new Map([
        [
          THREAD_STAGES_GROUPING_KEY,
          new Map(
            result.value.items.map((item) => [
              item.threadId,
              item as PlacementRecordV1,
            ]),
          ),
        ],
      ]),
    );
    setStagesLoaded(true);
  }, [rpc]);

  useEffect(() => {
    void loadPlacements().catch((error: unknown) => {
      setFatalError(
        error instanceof Error ? error.message : "Could not load placements",
      );
    });
  }, [loadPlacements]);
  useEffect(() => {
    void loadAssignmentPlacements().catch((error) =>
      setFatalError(
        error instanceof Error ? error.message : "Could not load stages",
      ),
    );
  }, [loadAssignmentPlacements]);

  useRealtime("placements-changed", () => {
    void loadPlacements();
    void loadAssignmentPlacements().catch((error) =>
      setFatalError(
        error instanceof Error ? error.message : "Could not load stages",
      ),
    );
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
    () =>
      new Map(placements.map((placement) => [placement.threadId, placement])),
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
      const threadVisibility =
        visibility.get(thread.id) ?? (thread.isHidden ? "hidden" : "visible");
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
      ({ parentThreadId }) =>
        parentThreadId && liveThreadIds.has(parentThreadId),
    )) {
      const list = result.get(child.parentThreadId!) ?? [];
      list.push(child);
      result.set(child.parentThreadId!, list);
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
      return [root, ...descendants(root.id, childrenByParent)].some(({ id }) =>
        searchResult.threadIds.has(id),
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
  // Pinned membership and order remain owned by bb.
  const savedPinnedRoots = useMemo(
    () =>
      displayRootThreads.filter(
        (thread) => thread.isPinned && matchesSearch(thread),
      ),
    [displayRootThreads, matchesSearch],
  );
  function projectedOrder(roots: readonly PluginSidebarThread[]) {
    return optimisticMoves.reduce<readonly PluginSidebarThread[]>(
      (current, move) => {
        if (
          move.destination.kind === "placement" &&
          move.groupingKey !== selectedGroupingKey
        )
          return current;
        const source = current.find(({ id }) => id === move.threadId);
        if (!source) return current;
        const remaining = current.filter(({ id }) => id !== source.id);
        const before = move.destination.beforeThreadId;
        const index =
          before === null
            ? remaining.length
            : remaining.findIndex(({ id }) => id === before);
        if (index < 0) return current;
        return [
          ...remaining.slice(0, index),
          source,
          ...remaining.slice(index),
        ];
      },
      roots,
    );
  }
  const pinnedRoots = projectedOrder(savedPinnedRoots);
  const placementOrder = new Map(
    placements.map(({ threadId }, index) => [threadId, index]),
  );
  const displayGroupId = (thread: PluginSidebarThread) => {
    const move = [...optimisticMoves]
      .reverse()
      .find(
        (move) =>
          move.threadId === thread.id &&
          move.groupingKey === selectedGroupingKey,
      );
    if (move?.destination.kind === "placement") return move.destination.groupId;
    return grouping
      ? (placementByThread.get(thread.id)?.groupId ??
          (grouping.groupingKey === "builtin:projects"
            ? thread.projectId
            : grouping.groupingKey === "builtin:sections"
              ? (thread.sectionId ?? "unsectioned")
              : (normalizedSearch && thread.isArchived) ||
                  supplementalThreadIds.has(thread.id)
                ? grouping.defaultGroupId
                : undefined))
      : "ungrouped";
  };
  const unpinnedRoots = displayRootThreads.filter(
    (thread) =>
      !thread.isPinned &&
      (visiblePlacementIds.has(thread.id) ||
        supplementalThreadIds.has(thread.id) ||
        (Boolean(normalizedSearch) && thread.isArchived)) &&
      matchesSearch(thread),
  );
  unpinnedRoots.sort(
    (left, right) =>
      (placementOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
      (placementOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER),
  );

  const groupDefinitions = useMemo<
    SidebarSnapshot["groupings"][number]["groups"]
  >(() => {
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
      .filter(
        (groupId, index, all) =>
          !known.has(groupId) && all.indexOf(groupId) === index,
      );
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
  const sections =
    snapshot?.groupings
      .find(({ groupingKey }) => groupingKey === "builtin:sections")
      ?.groups.filter(({ id }) => id !== "unsectioned") ?? [];

  const submitEntityName = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (
        entityDialog?.kind !== "create-section" &&
        entityDialog?.kind !== "rename"
      ) {
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
      anchor: { kind: "before"; threadId: string } | { kind: "start" | "end" },
      groupingKey: GroupingKey,
    ) => {
      setMutationError(null);
      const input = {
        groupingKey,
        groupId,
        threadId,
        anchor,
        expectedRevision: latestPlacementRevisions.current.get(groupingKey),
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
    [loadPlacements, rpc],
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
    async (groupingKey: GroupingKey, threadId: string, groupId: string) => {
      setMutationError(null);
      const group = snapshot?.groupings
        .find((grouping) => grouping.groupingKey === groupingKey)
        ?.groups.find((group) => group.id === groupId);
      const result = await rpc.call("updatePlacementV1", {
        groupingKey,
        groupId,
        threadId,
        anchor: { kind: group?.defaultPlacement ?? "preserve" },
        origin: "ui",
      });
      if (!result.ok) {
        setMutationError(result.error.message);
        return;
      }
      await Promise.all([loadPlacements(), loadAssignmentPlacements()]);
    },
    [loadAssignmentPlacements, loadPlacements, rpc, snapshot],
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
      </div>
    );
  }
  if (!snapshot || !preferences) {
    return (
      <div
        aria-label="Loading Ribbon sidebar"
        className="space-y-1.5 px-2 pt-1"
      >
        {["w-2/3", "w-1/2"].map((width) => (
          <div
            className="flex h-7 animate-pulse items-center gap-2 rounded-md"
            key={width}
          >
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
    if (
      !grouping ||
      !movingThread ||
      movingThread.isPinned ||
      !movingPlacement
    ) {
      return false;
    }
    if (displayGroupId(movingThread) === groupId) return true;
    const destination = groupDefinitions.find(({ id }) => id === groupId);
    return (
      grouping.membershipWritable && destination?.acceptsAssignments === true
    );
  };
  const hasDisplayedThreads = pinnedRoots.length + unpinnedRoots.length > 0;
  const pinnedSectionCollapsed =
    !normalizedSearch && preferences.collapsed.has("builtin:pinned");
  const pinnedActivePreview =
    pinnedSectionCollapsed && activeThreadId !== null
      ? pinnedRoots
          .flatMap((root) => [root, ...descendants(root.id, childrenByParent)])
          .find(({ id }) => id === activeThreadId)
      : undefined;
  const emptyMessage = normalizedSearch
    ? "No matching threads"
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
        error instanceof Error
          ? error.message
          : "Could not reorder pinned thread",
      );
    }
  }

  function threadStage(thread: PluginSidebarThread) {
    const root = rootForThread(thread.id, liveThreads) ?? thread;
    return (
      parseWorkflowStage(
        assignmentPlacements.get(THREAD_STAGES_GROUPING_KEY)?.get(root.id)
          ?.groupId ?? "Idle",
      ) ?? "Idle"
    );
  }
  function threadBand(thread: PluginSidebarThread) {
    const stage = threadStage(thread);
    return stage === "Deferred"
      ? "deferred"
      : stage === "Completed"
        ? "completed"
        : "main";
  }
  function threadIcon(thread: PluginSidebarThread): ReactNode {
    const stage = threadStage(thread);
    return <ProviderIcon icon={STAGE_ICONS[stage]} label={`${stage} stage`} />;
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
    const children = childrenByParent.get(root.id) ?? [];
    const childrenCollapsed = collapsedThreadIds.has(root.id);
    const indicatorThread = resolveThreadStatus(
      childrenCollapsed
        ? [root, ...descendants(root.id, childrenByParent)]
        : [root],
      draftThreadIds,
      threadRowStatuses.get(root.id),
    );
    const stageOwner = root.parentThreadId
      ? (rootForThread(root.id, liveThreads) ?? root)
      : root;
    const stage = assignmentPlacements
      .get("plugin:thread-stages:stages")
      ?.get(stageOwner.id)?.groupId;
    const reorderable =
      depth === 0 &&
      !normalizedSearch &&
      !root.isArchived &&
      rowContext !== undefined;
    return (
      <Fragment key={root.id}>
        {dragDestination?.indicatorBefore === root.id ? (
          <li className="list-none">
            <ThreadDropPreview />
          </li>
        ) : null}
        <ThreadRow
          rootThreadId={stageOwner.id}
          pullRequestNumberPosition={preferences.view.pullRequestNumberPosition}
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
          hasUnsubmittedDraft={draftThreadIds.has(root.id)}
          icon={threadIcon(root)}
          dragging={draggingThreadId === root.id}
          muted={
            stage === "Deferred" || stage === "Blocked" || stage === "Completed"
          }
          dragTarget={
            rowContext
              ? ({
                  ...rowContext,
                  threadId: root.id,
                } as ThreadDragTarget)
              : undefined
          }
          projected={dragDestination !== null}
          onNewSection={() =>
            setEntityDialog({ kind: "create-section", name: "" })
          }
          onOpen={(split) => {
            if (root.isArchived) {
              navigate.toThread(root.id);
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
          thread={root}
        />
        {includeDescendants &&
        !childrenCollapsed &&
        draggingThreadId !== root.id
          ? children.map((child) => renderRoot(child, depth + 1))
          : null}
        {dragDestination?.indicatorAfter === root.id ? (
          <li className="list-none">
            <ThreadDropPreview />
          </li>
        ) : null}
      </Fragment>
    );
  };

  return (
    <PullRequestDetailsProvider load={loadPullRequestDetails}>
      <ThreadDragProvider
        canDrop={(sourceId, target) => {
          const source = rootThreads.find(({ id }) => id === sourceId);
          if (!source || normalizedSearch) return false;
          if (target.kind === "pinned") return source.isPinned;
          if ("threadId" in target && target.threadId) {
            const row = rootThreads.find(
              (thread) => thread.id === target.threadId,
            );
            if (
              row &&
              (threadBand(row) !== threadBand(source) ||
                threadBand(source) === "completed")
            )
              return false;
          }
          return canDropPlacementInto(target.groupId);
        }}
        onStart={setDraggingThreadId}
        onDestination={setDragDestination}
        onCancel={clearDrag}
        onDrop={(threadId, destination) => {
          const id = ++moveSequence.current;
          setOptimisticMoves((current) => [
            ...current,
            { id, groupingKey: selectedGroupingKey, threadId, destination },
          ]);
          clearDrag();
          // Keep later gestures interactive, but commit their anchors in order.
          moveQueue.current = moveQueue.current
            .then(() =>
              destination.kind === "pinned"
                ? updatePinnedOrder(threadId, destination.beforeThreadId)
                : updatePlacement(
                    threadId,
                    destination.groupId,
                    destination.beforeThreadId === null
                      ? { kind: "end" }
                      : {
                          kind: "before",
                          threadId: destination.beforeThreadId,
                        },
                    selectedGroupingKey,
                  ),
            )
            .catch((error: unknown) => {
              setMutationError(
                error instanceof Error
                  ? error.message
                  : "Could not move thread",
              );
            })
            .finally(() =>
              setOptimisticMoves((current) =>
                current.filter((move) => move.id !== id),
              ),
            );
        }}
      >
        <div
          className="relative flex w-full min-w-0 flex-col"
          data-sidebar="group"
          data-sidebar-sticky-density="compact-actions"
          data-sidebar-sticky-stack=""
          style={
            {
              "--bb-sidebar-sticky-label-gap":
                "calc((var(--bb-sidebar-sticky-row-height) - var(--bb-sidebar-sticky-label-height)) / 2 + 1px)",
            } as CSSProperties
          }
          data-ribbon-sidebar-ready={
            placementsLoaded && stagesLoaded && previewsLoaded ? "" : undefined
          }
          data-ribbon-sidebar-root=""
        >
          {settings.values?.showProjectsAndSections !== false ? (
            <SidebarTopControls>
              <Button
                className="h-7 flex-1 justify-start px-2 text-xs text-subtle-foreground hover:bg-sidebar-accent"
                variant="ghost"
                size="sm"
                onClick={() =>
                  setEntityDialog({ kind: "create-section", name: "" })
                }
              >
                <Icon aria-hidden name="Plus" className="size-4" /> New section
              </Button>
              <SidebarDisplayOptionsMenu
                groupingKey={
                  selectedGroupingKey === "builtin:projects"
                    ? "builtin:projects"
                    : "builtin:sections"
                }
                onGroupingChange={(groupingKey) => {
                  clearDrag();
                  changePreferences((current) => ({
                    ...current,
                    view: { ...current.view, groupingKey },
                  }));
                }}
                hide={preferences.view.hide}
                onHideChange={(kind, hidden) =>
                  changePreferences((current) => ({
                    ...current,
                    view: {
                      ...current.view,
                      hide: { ...current.view.hide, [kind]: hidden },
                    },
                  }))
                }
                pullRequestNumberPosition={
                  preferences.view.pullRequestNumberPosition
                }
                onPullRequestNumberPositionChange={(
                  pullRequestNumberPosition,
                ) =>
                  changePreferences((current) => ({
                    ...current,
                    view: { ...current.view, pullRequestNumberPosition },
                  }))
                }
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
                <form
                  className="space-y-4"
                  onSubmit={(event) => void submitEntityName(event)}
                >
                  <Input
                    aria-label={
                      entityDialog.kind === "create-section"
                        ? "Section name"
                        : "New name"
                    }
                    autoFocus
                    disabled={entityPending}
                    onChange={(event) =>
                      setEntityDialog((current) =>
                        current?.kind === "create-section" ||
                        current?.kind === "rename"
                          ? { ...current, name: event.target.value }
                          : current,
                      )
                    }
                    value={entityDialog.name}
                  />
                  <DialogFooter>
                    <Button
                      disabled={entityPending || !entityDialog.name.trim()}
                      type="submit"
                    >
                      {entityDialog.kind === "create-section"
                        ? "Create section"
                        : "Rename"}
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
                <DialogDescription>
                  Choose the title shown in bb.
                </DialogDescription>
              </DialogHeader>
              {threadRename ? (
                <form
                  className="space-y-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const nextTitle = threadRename.name.trim();
                    if (!nextTitle) return;
                    setThreadRenamePending(true);
                    void Promise.resolve(
                      actions.rename(threadRename.id, nextTitle),
                    )
                      .then(() => setThreadRename(null))
                      .catch((error: unknown) => {
                        setMutationError(
                          error instanceof Error
                            ? error.message
                            : "Could not rename thread",
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
                        current
                          ? { ...current, name: event.target.value }
                          : current,
                      )
                    }
                    value={threadRename.name}
                  />
                  <DialogFooter>
                    <Button
                      disabled={
                        threadRenamePending || !threadRename.name.trim()
                      }
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
            <SidebarMessage icon="CircleQuestion">
              {emptyMessage}
            </SidebarMessage>
          ) : (
            <div className="space-y-4">
              {pinnedRoots.length > 0 ? (
                <ThreadDragGroup
                  aria-label="Pinned threads"
                  className="group/sidebar-section min-w-0 rounded-md"
                  data-sidebar-sticky-group=""
                  target={{ kind: "pinned", roots: pinnedRoots }}
                  disabled={Boolean(normalizedSearch)}
                >
                  <ThreadDragHeader
                    target={{ kind: "pinned", roots: pinnedRoots }}
                    disabled={Boolean(normalizedSearch)}
                    className={`bb-sidebar-hover-actions-row sticky z-[60] flex h-6 items-center rounded-md bg-sidebar pl-2 pr-0 ${CHROME_SECTION_LABEL_CLASS} max-md:pointer-coarse:h-9`}
                    data-sidebar="group-label"
                    data-sidebar-sticky-tier="label"
                  >
                    <span className="flex min-w-0 flex-1 items-center">
                      <span className="min-w-0 truncate">Pinned</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-expanded={!pinnedSectionCollapsed}
                        aria-label={
                          pinnedSectionCollapsed
                            ? "Expand Pinned section"
                            : "Collapse Pinned section"
                        }
                        className={`${
                          pinnedSectionCollapsed
                            ? ""
                            : "bb-sidebar-hover-actions"
                        } mx-2 size-5 shrink-0 p-0 text-subtle-foreground focus-visible:bg-state-hover focus-visible:ring-2 [&_[data-icon-root]]:size-3`}
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
                      </Button>
                    </span>
                  </ThreadDragHeader>
                  {dragDestination?.kind === "pinned" &&
                  dragDestination.atStart ? (
                    <ThreadDropPreview />
                  ) : null}
                  {!pinnedSectionCollapsed ? (
                    <ul className="space-y-px">
                      {pinnedRoots.map((root) =>
                        renderRoot(root, 0, true, {
                          kind: "pinned",
                          roots: pinnedRoots,
                        }),
                      )}
                    </ul>
                  ) : pinnedActivePreview ? (
                    <ul className="space-y-px">
                      {renderRoot(pinnedActivePreview, 0, false)}
                    </ul>
                  ) : null}
                  {dragDestination?.kind === "pinned" &&
                  !dragDestination.atStart &&
                  !dragDestination.indicatorBefore &&
                  !dragDestination.indicatorAfter ? (
                    <ThreadDropPreview />
                  ) : null}
                </ThreadDragGroup>
              ) : null}

              {groupDefinitions.map((group) => {
                const roots = projectedOrder(
                  unpinnedRoots.filter(
                    (thread) => displayGroupId(thread) === group.id,
                  ),
                );
                const bands = sectionBands(
                  roots,
                  threadStage,
                  (root) =>
                    assignmentPlacements
                      .get(THREAD_STAGES_GROUPING_KEY)
                      ?.get(root.id)?.enteredAtMs ?? 0,
                );
                const movingBand = movingThread
                  ? threadBand(movingThread)
                  : "main";
                const dragRoots = bands[movingBand];
                const otherRoots = dragRoots.filter(
                  (root) => root.id !== draggingThreadId,
                );
                const startPreview =
                  movingBand === "main"
                    ? undefined
                    : {
                        before:
                          otherRoots[0]?.id ??
                          (movingBand === "deferred"
                            ? bands.completed[0]?.id
                            : null) ??
                          null,
                        after:
                          otherRoots.length ||
                          (movingBand === "deferred" && bands.completed.length)
                            ? null
                            : (bands.main.at(-1)?.id ?? null),
                      };
                // Group padding is an end-of-list target for the moving stage.
                // Its marker must stay above the later stages, including hidden rows.
                const endPreview =
                  movingBand === "main"
                    ? {
                        before: otherRoots.length
                          ? null
                          : (bands.deferred[0]?.id ??
                            bands.completed[0]?.id ??
                            null),
                        after: otherRoots.at(-1)?.id ?? null,
                      }
                    : movingBand === "deferred" && bands.completed.length
                      ? {
                          before: bands.completed[0]!.id,
                          after: null,
                        }
                      : undefined;
                const selectedRootId = activeThreadId
                  ? (rootForThread(activeThreadId, liveThreads)?.id ??
                    activeThreadId)
                  : null;
                const renderSectionRow = (root: PluginSidebarThread) =>
                  renderRoot(root, 0, true, {
                    kind: "placement",
                    roots: bands[threadBand(root)],
                    groupId: group.id,
                  });
                if (normalizedSearch && roots.length === 0) return null;
                if (roots.length === 0 && !group.visibleWhenEmpty) return null;
                const ref = `${grouping?.groupingKey ?? "ungrouped"}/${group.id}`;
                const collapsed =
                  grouping !== undefined &&
                  !normalizedSearch &&
                  preferences.collapsed.has(ref);
                const groupTarget = {
                  kind: "placement" as const,
                  groupId: group.id,
                  roots: dragRoots,
                  startPreview:
                    !collapsed && (startPreview?.before || startPreview?.after)
                      ? startPreview
                      : undefined,
                  endPreview:
                    !collapsed && (endPreview?.before || endPreview?.after)
                      ? endPreview
                      : undefined,
                };
                const groupThreads = roots.flatMap((root) => [
                  root,
                  ...descendants(root.id, childrenByParent),
                ]);
                const activityThread =
                  collapsed &&
                  (grouping?.groupingKey === "plugin:thread-stages:stages" ||
                    settings.values?.showCollapsedGroupIndicators === true)
                    ? groupIndicator(
                        groupThreads,
                        draftThreadIds,
                        threadRowStatuses,
                      )
                    : null;
                const activePreview =
                  collapsed && activeThreadId !== null
                    ? groupThreads.find(({ id }) => id === activeThreadId)
                    : undefined;
                // A group heading takes the same icon its rows do: whichever was chosen
                // for that project or section, or this plugin's own glyph until one is.
                const entityGroupIcon:
                  | { kind: "project" | "section"; fallback: IconFallback }
                  | undefined =
                  grouping?.groupingKey === "builtin:projects"
                    ? {
                        kind: "project",
                        fallback: sidebar.projects.find(
                          ({ id }) => id === group.id,
                        )?.isPersonal
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
                  grouping?.groupingKey === "builtin:sections" &&
                  !unorganizedGroup
                    ? sections.find(({ id }) => id === group.id)
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
                  : null;
                return (
                  <ThreadDragGroup
                    aria-label={`${group.label} group`}
                    className="group/sidebar-section min-w-0 rounded-md"
                    data-sidebar-sticky-group=""
                    key={group.id}
                    target={groupTarget}
                    disabled={Boolean(normalizedSearch) || !grouping}
                  >
                    <ThreadDragHeader
                      target={groupTarget}
                      disabled={Boolean(normalizedSearch) || !grouping}
                      className={`bb-sidebar-hover-actions-row sticky z-[60] flex h-6 items-center rounded-md bg-sidebar pl-2 pr-0 ${CHROME_SECTION_LABEL_CLASS} transition-colors max-md:pointer-coarse:h-9`}
                      data-sidebar="group-label"
                      data-sidebar-sticky-tier="label"
                    >
                      <span className="relative z-10 flex min-w-0 flex-1 items-center text-left">
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
                              data-ribbon-sidebar-icon={
                                entityGroupIcon.fallback
                              }
                            />
                          ) : settings.values?.showGroupHeaderIcons !== false &&
                            group.icon ? (
                            <ProviderIcon
                              icon={group.icon}
                              label={`${group.label} group icon`}
                            />
                          ) : null}
                          <span
                            className="min-w-0 truncate"
                            title={group.label}
                          >
                            {group.label}
                          </span>
                        </span>
                        {grouping ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-expanded={!collapsed}
                            aria-label={
                              collapsed
                                ? `Expand ${group.label} ${selectedGroupingKey === "builtin:projects" ? "project" : "section"}`
                                : `Collapse ${group.label} ${selectedGroupingKey === "builtin:projects" ? "project" : "section"}`
                            }
                            className={`${collapsed ? "" : "bb-sidebar-hover-actions"} relative z-20 mx-2 size-5 shrink-0 p-0 text-subtle-foreground ring-sidebar-ring focus-visible:bg-state-hover focus-visible:ring-2 [&_[data-icon-root]]:size-3`}
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
                          </Button>
                        ) : null}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        type="button"
                        className="bb-sidebar-hover-actions m-1 size-5 shrink-0 p-0 text-subtle-foreground ring-sidebar-ring focus-visible:bg-state-hover focus-visible:ring-2"
                        aria-label={`New thread in ${group.label}`}
                        onClick={() =>
                          actions.openNewThread({
                            ...(grouping?.groupingKey === "builtin:projects"
                              ? { projectId: group.id }
                              : {
                                  sectionId:
                                    group.id === "unsectioned"
                                      ? undefined
                                      : group.id,
                                }),
                            focusPrompt: true,
                          })
                        }
                      >
                        <Icon aria-hidden name="Plus" className="size-4" />
                      </Button>
                      <GroupHeaderMenu
                        actions={headerActions}
                        label={group.label}
                        trailing={
                          activityThread ? (
                            <ThreadIndicator
                              indicator={activityThread.indicator}
                              label={activityThread.indicatorLabel}
                              pluginStatus={activityThread.pluginStatus}
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
                    </ThreadDragHeader>
                    {dragDestination?.kind === "placement" &&
                    dragDestination.groupId === group.id &&
                    dragDestination.atStart ? (
                      <ThreadDropPreview />
                    ) : null}
                    <div className="space-y-px">
                      {!collapsed ? (
                        <>
                          {bands.main.length > 0 ? (
                            <ul className="space-y-px">
                              {bands.main.map(renderSectionRow)}
                            </ul>
                          ) : null}
                          <StagePreview
                            key={`${group.id}/deferred`}
                            stage="deferred"
                            rows={bands.deferred}
                            selectedRootId={selectedRootId}
                            renderRow={renderSectionRow}
                            revealAll={Boolean(normalizedSearch)}
                          />
                          <StagePreview
                            key={`${group.id}/completed`}
                            stage="completed"
                            rows={bands.completed}
                            selectedRootId={selectedRootId}
                            renderRow={renderSectionRow}
                            revealAll={Boolean(normalizedSearch)}
                          />
                        </>
                      ) : activePreview ? (
                        <ul className="space-y-px">
                          {renderRoot(activePreview, 0, false, {
                            kind: "placement",
                            roots,
                            groupId: group.id,
                          })}
                        </ul>
                      ) : null}
                    </div>
                    {dragDestination?.kind === "placement" &&
                    dragDestination.groupId === group.id &&
                    !dragDestination.atStart &&
                    !dragDestination.indicatorBefore &&
                    !dragDestination.indicatorAfter ? (
                      <ThreadDropPreview />
                    ) : null}
                  </ThreadDragGroup>
                );
              })}
            </div>
          )}
        </div>
      </ThreadDragProvider>
    </PullRequestDetailsProvider>
  );
}

export default definePluginApp((app) => {
  registerWorkflowCommands(app);
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
