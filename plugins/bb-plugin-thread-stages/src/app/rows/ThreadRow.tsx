import {
  memo,
  useCallback,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEventHandler,
  type PointerEventHandler,
  type ReactNode,
} from "react";
import { useComposedRefs } from "@radix-ui/react-compose-refs";
import { useAtomValue } from "jotai";
import { Icon } from "@/components/ui/icon";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  COARSE_POINTER_COMPACT_ROW_HEIGHT_CLASS,
  COARSE_POINTER_ROW_ACTION_SIZE_CLASS,
  COARSE_POINTER_ROW_HEIGHT_CLASS,
} from "@/components/ui/coarse-pointer-sizing";
import { cn } from "@/lib/utils";
import { LIST_HOVER_TRANSITION } from "@/components/ui/motion";
import {
  hasThreadListWorkingActivity,
  threadListIndicatorStateForThread,
  NO_COLLAPSED_CHILD_ACTIVITY,
  type CollapsedChildActivity,
  type ThreadListIndicatorState,
} from "../model/thread-activity.js";
import {
  experimental_useSidebarThreadActions,
  experimental_useSidebarThreadSplit,
  experimental_useProviders,
  experimental_ProviderIcon as ProviderIcon,
  ThreadTitle,
  useSidebarSplitLayout,
  useSidebarThreadDraft,
  useSidebarThreadRowStatus,
  useSidebarThreadShortcut,
  type PluginSidebarSplitPane,
  type PluginSidebarThreadRowStatus,
} from "@get-bb/plugin-sdk/app";
import type { SidebarThread } from "../model/sidebar-thread.js";
import { useSidebarProjectName } from "../model/use-sidebar-data.js";
import { sidebarShowProviderIconsAtom } from "../preferences/atoms.js";
import { AppCommandShortcutPill } from "../ui/AppCommandShortcutPill.js";
import { SidebarStickyTier } from "../ui/sidebar.js";
import {
  SIDEBAR_HOVER_ACTIONS_CLASS,
  SIDEBAR_HOVER_ACTIONS_FADE_CLASS,
  SIDEBAR_HOVER_ACTIONS_INSET_CLASS,
  SIDEBAR_HOVER_ACTIONS_ROW_CLASS,
} from "../ui/sidebar-hover-actions.js";
import type { ConsumeDragClickSuppression } from "../ui/use-drag-click-suppression.js";
import { SidebarChildToggleChevron } from "./SidebarChildToggleChevron.js";
import { useSidebarRename } from "./SidebarInlineRename.js";
import { SidebarRowControls } from "./SidebarRowControls.js";
import {
  SIDEBAR_CONTROL_BUTTON_CLASS,
  SIDEBAR_CONTROL_STATE_CLASS,
  SIDEBAR_MORE_ACTION_TRIGGER_CLASS,
  SIDEBAR_ROW_TEXT_CLASS,
  SIDEBAR_ROW_BASE_CLASS,
  SIDEBAR_ROW_GLYPH_SLOT_CLASS,
  SIDEBAR_ROW_INTERACTIVE_STATE_CLASS,
  SIDEBAR_ROW_OPEN_IN_SPLIT_STATE_CLASS,
  SIDEBAR_ROW_SELECTED_STATE_CLASS,
  SIDEBAR_STATUS_GLYPH_BOX_CLASS,
  getSidebarThreadGroupLineLeft,
  getSidebarThreadRowPaddingLeft,
} from "./sidebarRowClasses.js";
import type {
  SidebarNestTargetState,
  SidebarReorderPlacement,
  ThreadRowNestDrop,
} from "./sidebarThreadRowDroppable.js";
import type { SidebarSortableDragBindings } from "./sortableMotion.js";
import { SidebarThreadDragChip } from "../dnd/sidebarThreadDragChip.js";
import { SplitPaneMiniMap } from "./SplitPaneMiniMap.js";
import {
  RibbonActionButtons,
  RibbonStageGlyph,
  RibbonTrailingIndicator,
  useRibbonRow,
  useRibbonRowSettings,
} from "../../ribbon/app/row.js";
import { useRibbonData } from "../../ribbon/app/data.js";
import { useOwnerColor } from "../../ribbon/app/icons.js";
import { RailBars, RailTree, useRowLineage } from "../../ribbon/app/rails.js";
import { MarqueeText } from "../../ribbon/app/thread-title.js";
import { sidebarOrganizationModeAtom } from "../preferences/atoms.js";
import {
  ACTIVE_ROW_ATTRIBUTE,
  SHINE_ATTRIBUTE,
  SHINE_ROW_ATTRIBUTE,
  ShineContent,
  useRowShine,
} from "../../ribbon/app/row-shine.js";

/** Ribbon's row buttons: the same 28px box as its headings, all of it hit area. */
// Shaped like the options button on bb's own sidebar items: a 20px button
// whose reach is the 28px box it sits in.
const RIBBON_ROW_BUTTON_CLASS = `${SIDEBAR_MORE_ACTION_TRIGGER_CLASS} shrink-0 cursor-pointer rounded-md p-0 outline-none ring-sidebar-ring focus-visible:ring-2 ${SIDEBAR_CONTROL_STATE_CLASS}`;
// The same 28px reach for the child toggle, which sits against the actions
// so the two reaches meet. Under a coarse pointer bb already widens it.
const RIBBON_CHEVRON_HIT_AREA_CLASS =
  "-mr-1 pointer-fine:after:absolute pointer-fine:after:left-1/2 pointer-fine:after:top-1/2 pointer-fine:after:h-7 pointer-fine:after:w-7 pointer-fine:after:-translate-x-1/2 pointer-fine:after:-translate-y-1/2 pointer-fine:after:content-['']";
// A toggle shown only on hover takes no room at rest, so the title runs on
// past where it will appear; hovering the row opens it up, reach and all.
const RIBBON_CHEVRON_REVEAL_CLASS =
  "overflow-hidden pointer-fine:h-5 pointer-fine:w-0 pointer-fine:-ml-1.5 pointer-fine:mr-0 pointer-fine:after:hidden pointer-fine:group-hover/thread-row:w-5 pointer-fine:group-hover/thread-row:ml-0 pointer-fine:group-hover/thread-row:-mr-1 pointer-fine:group-hover/thread-row:after:block pointer-fine:group-has-[:focus-visible]/thread-row:w-5 pointer-fine:group-has-[:focus-visible]/thread-row:ml-0 pointer-fine:group-has-[:focus-visible]/thread-row:-mr-1 pointer-fine:group-has-[:focus-visible]/thread-row:after:block";
// Ribbon's title runs to the row's edge; the trailing lane is reserved only
// while something stands in it at rest, or while hover fills it with actions.
const RIBBON_LANE_RESERVED_CLASS = "pr-9";
const RIBBON_LANE_ON_HOVER_CLASS =
  "pr-2 group-hover/thread-row:pr-9 group-has-[:focus-visible]/thread-row:pr-9 group-has-[[data-sidebar-hover-actions-open=true]]/thread-row:pr-9";
import {
  ThreadActionsContextMenu,
  ThreadActionsMenu,
  ThreadArchiveQuickAction,
} from "./ThreadActionsMenu.js";
import {
  ThreadStatusGlyph,
  resolveThreadStatus,
  type ThreadStatusGlyphProps,
} from "./ThreadStatusGlyph.js";

const SIDEBAR_TITLE_DOUBLE_CLICK_MS = 400;

let lastSidebarTitleClick: { at: number; threadId: string } | null = null;

function consumeSidebarTitleDoubleClick(threadId: string): boolean {
  const now = Date.now();
  const previous = lastSidebarTitleClick;
  lastSidebarTitleClick = { at: now, threadId };
  return (
    previous !== null &&
    previous.threadId === threadId &&
    now - previous.at < SIDEBAR_TITLE_DOUBLE_CLICK_MS
  );
}

export function resetSidebarTitleDoubleClickForTest(): void {
  lastSidebarTitleClick = null;
}

interface ThreadRowBaseOptions {
  depth: number;
  isCompact: boolean;
  consumeClickSuppression?: ConsumeDragClickSuppression;
  dragBindings?: SidebarSortableDragBindings;
  nestDrop?: ThreadRowNestDrop;
}

export type ThreadRowOptions =
  | (ThreadRowBaseOptions & {
      kind: "default";
    })
  | (ThreadRowBaseOptions & {
      kind: "parent";
      isCollapsed: boolean;
      childCount: number;
      childActivity: CollapsedChildActivity;
      stickyLevel?: number;
      onToggleCollapsed: (threadId: string) => void;
    });

interface ThreadRowProps {
  projectId: string;
  thread: SidebarThread;
  crossProjectId: string | null;
  isActive: boolean;
  onProjectSelect?: () => void;
  options: ThreadRowOptions;
}

type ThreadRowClickCaptureHandler = MouseEventHandler<HTMLDivElement>;

interface ThreadRowContainerArgs {
  attributes?: Record<string, string | undefined>;
  children: ReactNode;
  className: string;
  containerRef: (element: HTMLDivElement | null) => void;
  dragBindings?: SidebarSortableDragBindings;
  nestTargetState: SidebarNestTargetState | null;
  reorderPlacement: SidebarReorderPlacement | null;
  onClick?: MouseEventHandler<HTMLDivElement>;
  onClickCapture?: ThreadRowClickCaptureHandler;
  onSplitDragPointerDown?: PointerEventHandler<HTMLElement>;
  stickyLevel?: number;
  style: CSSProperties;
}

const NEST_TARGET_STATE_CLASS: Record<SidebarNestTargetState, string> = {
  valid:
    "bg-sidebar-accent text-sidebar-accent-foreground ring-1 ring-inset ring-sidebar-ring",
  blocked: "ring-1 ring-inset ring-destructive/60",
  unchanged: "ring-1 ring-inset ring-sidebar-border",
};

export const REORDER_PLACEMENT_CLASS: Record<SidebarReorderPlacement, string> =
  {
    before:
      "before:pointer-events-none before:absolute before:inset-x-1 before:-top-px before:h-0.5 before:rounded-full before:bg-sidebar-ring before:content-['']",
    after:
      "after:pointer-events-none after:absolute after:inset-x-1 after:-bottom-px after:h-0.5 after:rounded-full after:bg-sidebar-ring after:content-['']",
  };

function getThreadRowStyle(depth: number): CSSProperties {
  return {
    paddingLeft: getSidebarThreadRowPaddingLeft(depth),
  };
}

function renderThreadRowContainer({
  attributes,
  children,
  className,
  containerRef,
  dragBindings,
  nestTargetState,
  onClick,
  onClickCapture,
  onSplitDragPointerDown,
  reorderPlacement,
  stickyLevel,
  style,
}: ThreadRowContainerArgs) {
  const containerProps = {
    ...attributes,
    "data-sidebar-rename-row": "",
    className,
    style,
    "data-sidebar-nest-target": nestTargetState ?? undefined,
    "data-sidebar-reorder-placement": reorderPlacement ?? undefined,
    ...dragBindings?.attributes,
    ...(dragBindings?.listeners ?? {}),
    onClick,
    onClickCapture,
    onPointerDown: onSplitDragPointerDown,
  };
  if (stickyLevel !== undefined) {
    return (
      <SidebarStickyTier
        ref={containerRef}
        tier="parent"
        level={stickyLevel}
        {...containerProps}
      >
        {children}
      </SidebarStickyTier>
    );
  }

  return (
    <div ref={containerRef} {...containerProps}>
      {children}
    </div>
  );
}

interface CollapsedThreadStatusGlyphProps {
  activity: CollapsedChildActivity;
  pluginStatus?: PluginSidebarThreadRowStatus | null;
}

export function CollapsedThreadStatusGlyph({
  activity,
  pluginStatus = null,
}: CollapsedThreadStatusGlyphProps) {
  const statusProps: ThreadListIndicatorState = {
    hasPendingInteraction: activity.pending,
    hasUnsubmittedDraft: activity.hasUnsubmittedDraft,
    hasUnreadError: activity.unreadError,
    hasUnreadSuccess: activity.unread,
    isBackgroundAgentActive: activity.backgroundAgent,
    isBackgroundCommandActive: activity.backgroundCommand,
    isGoalActive: activity.goal,
    queuedWork: "none",
    isPlanModeActive: activity.planMode,
    isRuntimeActive: activity.runtimeWorking,
    isWorkflowActive: activity.workflow,
  };
  return <ThreadStatusGlyph {...statusProps} pluginStatus={pluginStatus} />;
}

type ThreadTrailingIndicatorProps = ThreadStatusGlyphProps & {
  pluginStatus: PluginSidebarThreadRowStatus | null;
};

function ThreadTrailingIndicator({
  pluginStatus,
  ...statusProps
}: ThreadTrailingIndicatorProps) {
  const { indicatorKind, pluginStatusIsVisible } = resolveThreadStatus(
    statusProps,
    pluginStatus,
  );

  if (indicatorKind === "none" && !pluginStatusIsVisible) {
    return null;
  }

  return (
    <span
      data-sidebar-thread-trailing-indicator=""
      className={cn(
        SIDEBAR_ROW_GLYPH_SLOT_CLASS,
        SIDEBAR_STATUS_GLYPH_BOX_CLASS,
      )}
    >
      <ThreadStatusGlyph {...statusProps} pluginStatus={pluginStatus} />
    </span>
  );
}

function ThreadRestoreStatusAction({ thread }: { thread: SidebarThread }) {
  return (
    <span
      className="relative z-10 pointer-events-auto"
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <ThreadArchiveQuickAction
        thread={thread}
        className={SIDEBAR_CONTROL_BUTTON_CLASS}
      />
    </span>
  );
}

function useThreadSplitMiniMap(
  threadId: string,
): readonly PluginSidebarSplitPane[] | null {
  const layout = useSidebarSplitLayout();
  return useMemo(() => {
    if (layout === null) return null;
    const slots = layout.panes.map<PluginSidebarSplitPane>((pane) => ({
      paneId: pane.paneId,
      rect: pane.rect,
      isMe: pane.threadId === threadId,
      isFocused: pane.isFocused,
    }));
    return slots.some((slot) => slot.isMe) ? slots : null;
  }, [layout, threadId]);
}

function ThreadRowComponent({
  projectId,
  thread,
  crossProjectId,
  isActive,
  onProjectSelect,
  options,
}: ThreadRowProps) {
  const [isDropdownActionsOpen, setIsDropdownActionsOpen] = useState(false);
  const [isContextActionsOpen, setIsContextActionsOpen] = useState(false);
  const actions = experimental_useSidebarThreadActions();
  const showProviderIcons = useAtomValue(sidebarShowProviderIconsAtom);
  const { providers } = experimental_useProviders();
  const provider = showProviderIcons
    ? providers.find((candidate) => candidate.id === thread.providerId)
    : undefined;
  const shortcut = useSidebarThreadShortcut(thread.id);
  const pluginThreadRowStatus = useSidebarThreadRowStatus(thread.id);
  const { hasUnsubmittedDraft: hasComposerDraft } = useSidebarThreadDraft(
    thread.id,
  );
  const showActive = isActive;
  const threadStatus = threadListIndicatorStateForThread(
    thread,
    hasComposerDraft,
  );
  const labelTitle = thread.displayTitle;
  const crossProjectName = useSidebarProjectName(crossProjectId);
  const crossProjectLabel =
    crossProjectId === null
      ? null
      : crossProjectName
        ? `In project ${crossProjectName}`
        : "In another project";
  const handleRename = useCallback(
    (nextTitle: string) => actions.rename(thread.id, nextTitle),
    [actions, thread.id],
  );
  const rename = useSidebarRename({
    kind: "thread",
    id: thread.id,
    name: labelTitle,
    label: "Thread name",
    onSave: handleRename,
  });
  const { editor, isEditing, startEditing } = rename;
  const startTitleEditing = useCallback(
    (event: { preventDefault: () => void; stopPropagation: () => void }) => {
      event.preventDefault();
      event.stopPropagation();
      startEditing();
    },
    [startEditing],
  );
  const miniMap = useThreadSplitMiniMap(thread.id);
  const isOpenInSplit = miniMap !== null;
  const split = experimental_useSidebarThreadSplit(thread.id);
  const onSplitDragPointerDown = split.splitProps.onPointerDown;
  const splitAvailable = split.isAvailable;
  const openInSplit = useCallback(() => {
    actions.open(thread.id, { split: true });
  }, [actions, thread.id]);
  const parentOptions = options.kind === "parent" ? options : null;
  const isParentRow = parentOptions !== null;
  const isParentCollapsed = parentOptions?.isCollapsed ?? false;
  const childCount = parentOptions?.childCount ?? 0;
  const childActivity =
    parentOptions?.childActivity ?? NO_COLLAPSED_CHILD_ACTIVITY;
  const hasChildren = childCount > 0;
  const reserveActionSpace =
    crossProjectLabel !== null || (isParentRow && hasChildren);
  const hasHiddenChildren = isParentRow && isParentCollapsed && hasChildren;
  const trailingIndicatorState: ThreadListIndicatorState = {
    hasPendingInteraction:
      threadStatus.hasPendingInteraction ||
      (hasHiddenChildren && childActivity.pending),
    hasUnsubmittedDraft:
      threadStatus.hasUnsubmittedDraft ||
      (hasHiddenChildren && childActivity.hasUnsubmittedDraft),
    hasUnreadError:
      threadStatus.hasUnreadError ||
      (hasHiddenChildren && childActivity.unreadError),
    hasUnreadSuccess:
      threadStatus.hasUnreadSuccess ||
      (hasHiddenChildren && childActivity.unread),
    isBackgroundAgentActive:
      threadStatus.isBackgroundAgentActive ||
      (hasHiddenChildren && childActivity.backgroundAgent),
    isBackgroundCommandActive:
      threadStatus.isBackgroundCommandActive ||
      (hasHiddenChildren && childActivity.backgroundCommand),
    isGoalActive:
      threadStatus.isGoalActive || (hasHiddenChildren && childActivity.goal),
    queuedWork: threadStatus.queuedWork,
    isPlanModeActive:
      threadStatus.isPlanModeActive ||
      (hasHiddenChildren && childActivity.planMode),
    isRuntimeActive:
      threadStatus.isRuntimeActive ||
      (hasHiddenChildren && childActivity.runtimeWorking),
    isWorkflowActive:
      threadStatus.isWorkflowActive ||
      (hasHiddenChildren && childActivity.workflow),
  };
  const trailingIndicatorResolution = resolveThreadStatus(
    trailingIndicatorState,
    pluginThreadRowStatus,
  );
  const ribbonData = useRibbonData();
  const ribbon = useRibbonRow(thread, trailingIndicatorState, pluginThreadRowStatus);
  // A pull request number on the right keeps its place under the pointer,
  // so the lane the hover actions take is held open for it at rest.
  const reserveRowActionSpace =
    reserveActionSpace || ribbon?.pullRequest?.position === "right";
  const ribbonSettings = useRibbonRowSettings();
  const organizationMode = useAtomValue(sidebarOrganizationModeAtom);
  const ribbonActionColor = useOwnerColor(
    ribbon === null
      ? null
      : organizationMode === "project"
        ? { kind: "project", id: thread.projectId }
        : organizationMode === "chronological" && thread.sectionId !== null
          ? { kind: "section", id: thread.sectionId }
          : null,
  );
  const ribbonWorking = ribbon?.shines ?? false;
  const ribbonShines = ribbonWorking && ribbonSettings.shimmerWorkingRows;
  // Ribbon's long titles fade at the edge, and pan on hover, in place of
  // bb's ellipsis.
  const ribbonMarquee = ribbon !== null && ribbonSettings.longTitles !== "Ellipsis";
  // What stands in the lane at rest: an indicator, a right-hand PR number
  // that would otherwise jump left on hover, a toggle for hidden children,
  // or the row's own controls.
  const ribbonLaneAtRest =
    ribbon !== null &&
    (miniMap !== null ||
      ribbon.status.indicator !== "none" ||
      ribbon.status.pluginStatus !== null ||
      ribbon.status.pullRequestMark !== null ||
      ribbon.pullRequest?.position === "right" ||
      hasHiddenChildren ||
      ribbon.actions.length > 0 ||
      thread.archivedAt !== null ||
      Boolean(shortcut));
  const shineRowRef = useRef<HTMLDivElement | null>(null);
  useRowShine(shineRowRef, ribbonShines, ribbonWorking);
  const lineage = useRowLineage();
  const trailingIndicatorKind = trailingIndicatorResolution.indicatorKind;
  const splitIndicatorIsWorking = hasThreadListWorkingActivity(
    trailingIndicatorState,
    pluginThreadRowStatus?.tone === "running",
  );
  const splitIndicatorLabel = trailingIndicatorResolution.accessibleLabel
    ? `${labelTitle} — open in split; ${trailingIndicatorResolution.accessibleLabel}`
    : `${labelTitle} — open in split`;
  const linkLabel = hasComposerDraft
    ? `Open ${labelTitle} (unsubmitted draft)`
    : `Open ${labelTitle}`;
  const rowDragBindings = isEditing ? undefined : options.dragBindings;
  const nestTargetState = options.nestDrop?.state ?? null;
  const reorderPlacement = options.nestDrop?.reorderPlacement ?? null;
  const containerRef = useComposedRefs<HTMLDivElement>(
    rowDragBindings?.setActivatorNodeRef,
    options.nestDrop?.setNodeRef,
    shineRowRef,
  );
  const rowClassName = cn(
    SIDEBAR_HOVER_ACTIONS_ROW_CLASS,
    "group/thread-row cursor-pointer",
    SIDEBAR_ROW_BASE_CLASS,
    LIST_HOVER_TRANSITION,
    parentOptions?.stickyLevel === undefined && "relative",
    options.isCompact
      ? COARSE_POINTER_COMPACT_ROW_HEIGHT_CLASS
      : COARSE_POINTER_ROW_HEIGHT_CLASS,
    showActive
      ? ribbon
        // Ribbon's open row wears the hover surface, not bb's active one,
        // and not the active-over-sidebar gradient bb paints on a sticky
        // parent row.
        ? `bg-sidebar-accent bg-none bb-sidebar-selected-row ${SIDEBAR_ROW_TEXT_CLASS}`
        : SIDEBAR_ROW_SELECTED_STATE_CLASS
      : SIDEBAR_ROW_INTERACTIVE_STATE_CLASS,
    // A row outside Active stays dim while hovered and while open.
    ribbon?.muted &&
      "text-subtle-foreground/75 hover:text-subtle-foreground/75",
    !showActive && isOpenInSplit && SIDEBAR_ROW_OPEN_IN_SPLIT_STATE_CLASS,
    !showActive &&
      "has-[[data-state=open]]:bg-sidebar-accent has-[[data-sidebar-rename-anchor]:focus-visible]:bg-sidebar-accent",
    rowDragBindings && !rowDragBindings.disabled && "select-none",
    "data-[sidebar-touch-armed=true]:!bg-transparent",
    nestTargetState && NEST_TARGET_STATE_CLASS[nestTargetState],
    reorderPlacement && REORDER_PLACEMENT_CLASS[reorderPlacement],
  );
  const rowStyle = {
    ...getThreadRowStyle(options.depth),
    // Where the stage ring's centre sits, for the rails to meet it.
    ...(ribbon ? { ["--ribbon-ring-y" as string]: "50%" } : {}),
  };
  const parentGuideLeft =
    options.depth > 0 ? getSidebarThreadGroupLineLeft(options.depth - 1) : null;
  const isActionsOpen = isDropdownActionsOpen || isContextActionsOpen;
  const handleRowClickCapture = useCallback<ThreadRowClickCaptureHandler>(
    (event) => {
      if (!options.consumeClickSuppression?.()) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
    },
    [options],
  );

  const rowLinkRef = useRef<HTMLAnchorElement>(null);
  const handleRowClick = useCallback<MouseEventHandler<HTMLDivElement>>(
    (event) => {
      if (event.target !== event.currentTarget) {
        if (!(event.target instanceof Element)) return;
        if (!event.target.closest("[data-sidebar-thread-trailing]")) return;
        if (event.target.closest("a, button")) return;
      }
      rowLinkRef.current?.click();
    },
    [],
  );
  const ribbonRing: "shown" | "hidden-at-rest" | "absent" =
    ribbon === null
      ? "absent"
      : ribbon.stage === "Active" && !ribbon.working && !showActive
        ? "hidden-at-rest"
        : "shown";
  // A parent's own line drops from its ring, so roots with children draw too.
  const ribbonRails =
    ribbon !== null && (options.depth > 0 || (isParentRow && hasChildren)) ? (
      ribbonSettings.childThreadLines === "Tree" ? (
        <RailTree
          depth={options.depth}
          lineage={lineage}
          ring={ribbonRing}
          showsChildren={isParentRow && hasChildren && !isParentCollapsed}
        />
      ) : (
        <RailBars
          depth={options.depth}
          lineage={lineage}
          ring={ribbonRing}
          showsChildren={isParentRow && hasChildren && !isParentCollapsed}
        />
      )
    ) : null;
  const rowContent = (
    <>
      {ribbonRails}
      {parentOptions?.stickyLevel !== undefined && parentGuideLeft !== null && ribbon === null ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-0.5 top-0 z-[1] w-px bg-border-hairline opacity-70"
          style={{ left: parentGuideLeft }}
        />
      ) : null}
      <span
        className={cn(
          "relative flex min-w-0 flex-1 items-center gap-1.5 self-stretch",
          "group-data-[sidebar-touch-armed=true]/thread-row:hidden",
          !shortcut &&
            !isEditing &&
            ribbon === null &&
            (reserveRowActionSpace
              ? "pr-7.5 max-md:pointer-coarse:pr-0"
              : SIDEBAR_HOVER_ACTIONS_INSET_CLASS),
          ribbon !== null &&
            !isEditing &&
            (ribbonLaneAtRest ? RIBBON_LANE_RESERVED_CLASS : RIBBON_LANE_ON_HOVER_CLASS),
        )}
      >
        <a
          ref={rowLinkRef}
          href={thread.href}
          data-sidebar-thread-shortcut-target=""
          data-sidebar-thread-id={thread.id}
          data-sidebar-rename-anchor=""
          onClick={(event) => {
            if (isEditing) {
              event.preventDefault();
              event.stopPropagation();
              return;
            }
            if (splitAvailable && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              openInSplit();
              return;
            }
            if (consumeSidebarTitleDoubleClick(thread.id)) {
              event.preventDefault();
              event.stopPropagation();
              startEditing();
              return;
            }
            onProjectSelect?.();
          }}
          onDoubleClick={isEditing ? undefined : startTitleEditing}
          aria-label={linkLabel}
          aria-keyshortcuts={shortcut?.ariaKeyshortcuts}
          className="absolute inset-0 rounded-md outline-none"
        />
        <span
          className={cn(
            "pointer-events-none relative flex min-w-0 items-center self-stretch",
            ((crossProjectLabel === null && (!parentOptions || !hasChildren)) ||
              isEditing ||
              // Ribbon's lane spans the row: its child toggle sits against
              // the actions, as do action buttons and a right-hand PR number.
              ribbon !== null) &&
              "flex-1",
          )}
        >
          {isEditing ? (
            <span className="pointer-events-auto relative z-10 min-w-0 flex-1 overflow-visible">
              {editor}
            </span>
          ) : (
            <>
              {ribbon ? (
                <RibbonStageGlyph
                  stage={ribbon.stage}
                  working={ribbon.working}
                  hiddenAtRest={
                    ribbon.stage === "Active" && !ribbon.working && !showActive
                  }
                />
              ) : null}
              {provider ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      data-sidebar-thread-provider={provider.id}
                      role="img"
                      aria-label={provider.displayName}
                      className={cn(
                        "pointer-events-auto relative z-[31] flex size-4 shrink-0 items-center justify-center text-muted-foreground",
                        ribbon ? "mr-2" : "mr-1.5",
                      )}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        rowLinkRef.current?.click();
                      }}
                    >
                      <ProviderIcon
                        providerKind="agent"
                        provider={provider}
                        className="size-4"
                      />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    {provider.displayName}
                  </TooltipContent>
                </Tooltip>
              ) : null}
              {ribbon?.hideTitle ? (
                <span className="min-w-0 flex-1" />
              ) : (
                <span
                  className={cn(
                    "bb-thread-title",
                    (crossProjectLabel !== null || ribbon !== null) &&
                      (ribbonMarquee ? "min-w-0" : "min-w-0 truncate"),
                    ribbon !== null && "flex min-w-0 flex-1 items-center gap-2",
                  )}
                  title={labelTitle}
                  onDoubleClick={startTitleEditing}
                  // Inline, past bb's own rule for the class: the title takes
                  // only what the buttons and number beside it leave, so it
                  // is the first to give way as the row narrows.
                  style={ribbon ? { flex: "1 1 0%" } : undefined}
                  {...(ribbon ? { [SHINE_ATTRIBUTE]: "" } : {})}
                >
                  {ribbon ? (
                    <ShineContent className="flex items-center gap-2">
                      {ribbonMarquee ? (
                        <MarqueeText
                          text={labelTitle}
                          pan={ribbonSettings.longTitles === "Fade and pan on hover"}
                        />
                      ) : (
                        <ThreadTitle threadId={thread.id} />
                      )}
                    </ShineContent>
                  ) : (
                    <ThreadTitle threadId={thread.id} />
                  )}
                </span>
              )}
              {ribbon && ribbon.actions.length > 0 && ribbonData ? (
                <RibbonActionButtons
                  actions={ribbon.actions}
                  color={ribbonActionColor}
                  rowTitle={labelTitle}
                  onRun={(actionId) => ribbonData.runThreadAction(thread.id, actionId)}
                />
              ) : null}
              {ribbon?.pullRequest?.position === "right" ? ribbon.pullRequest.node : null}
            </>
          )}
        </span>
        {crossProjectLabel !== null ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                data-sidebar-thread-cross-project=""
                role="img"
                aria-label={crossProjectLabel}
                className="relative z-[31] flex size-5 shrink-0 items-center justify-center text-muted-foreground"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  rowLinkRef.current?.click();
                }}
              >
                <Icon name="FolderExport" className="size-3.5" aria-hidden />
              </span>
            </TooltipTrigger>
            <TooltipContent side="top">{crossProjectLabel}</TooltipContent>
          </Tooltip>
        ) : null}
        {parentOptions && hasChildren ? (
          <SidebarChildToggleChevron
            disabled={isEditing}
            className={cn(
              isEditing && "hidden",
              ribbon !== null && RIBBON_CHEVRON_HIT_AREA_CLASS,
              ribbon !== null && !isParentCollapsed && RIBBON_CHEVRON_REVEAL_CLASS,
            )}
            isCollapsed={isParentCollapsed}
            expandLabel={`Expand ${labelTitle} threads`}
            collapseLabel={`Collapse ${labelTitle} threads`}
            onToggle={() => parentOptions.onToggleCollapsed(thread.id)}
            revealOnHover={!isParentCollapsed}
          />
        ) : null}
      </span>
      {rowDragBindings && !rowDragBindings.disabled ? (
        <SidebarThreadDragChip
          title={labelTitle}
          visualOnly
          className="hidden group-data-[sidebar-touch-armed=true]/thread-row:flex"
        />
      ) : null}
      <span
        data-sidebar-thread-trailing=""
        className={cn(
          "flex shrink-0 items-center gap-0.5 group-data-[sidebar-touch-armed=true]/thread-row:hidden",
          // Out of the row's flow, so the title decides how much of it to leave.
          ribbon !== null && "absolute inset-y-0 right-0",
          isEditing && "hidden",
        )}
      >
        {thread.archivedAt !== null ? (
          <span className="relative flex items-center max-md:pointer-coarse:hidden">
            <div
              data-sidebar-hover-actions-open={
                isActionsOpen ? "true" : undefined
              }
              className={cn(
                SIDEBAR_HOVER_ACTIONS_CLASS,
                "absolute right-full z-10 max-md:pointer-coarse:hidden",
              )}
            >
              <ThreadActionsMenu
                thread={thread}
                triggerClassName={SIDEBAR_CONTROL_BUTTON_CLASS}
                onOpenInSplit={splitAvailable ? openInSplit : undefined}
                onOpenChange={setIsDropdownActionsOpen}
                onRename={rename.startEditingFromMenu}
                onCloseAutoFocus={rename.onCloseAutoFocus}
              />
            </div>
            <ThreadRestoreStatusAction thread={thread} />
          </span>
        ) : shortcut ? (
          <AppCommandShortcutPill shortcut={shortcut} />
        ) : (
          <span
            className={cn(
              "flex shrink-0 items-center justify-end max-md:pointer-coarse:pointer-events-none",
              COARSE_POINTER_COMPACT_ROW_HEIGHT_CLASS,
            )}
          >
            <span
              className={cn(
                "relative shrink-0",
                COARSE_POINTER_ROW_ACTION_SIZE_CLASS,
              )}
            >
              <span
                data-sidebar-hover-actions-open={
                  isActionsOpen ? "true" : undefined
                }
                className={cn(
                  SIDEBAR_HOVER_ACTIONS_FADE_CLASS,
                  "absolute inset-0 flex items-center justify-center",
                )}
              >
                {miniMap ? (
                  <span
                    data-sidebar-thread-trailing-indicator=""
                    className={cn(
                      SIDEBAR_ROW_GLYPH_SLOT_CLASS,
                      SIDEBAR_STATUS_GLYPH_BOX_CLASS,
                    )}
                  >
                    <SplitPaneMiniMap
                      slots={miniMap}
                      label={splitIndicatorLabel}
                      isWorking={splitIndicatorIsWorking}
                    />
                  </span>
                ) : ribbon ? (
                  <RibbonTrailingIndicator
                    status={ribbon.status}
                    hideIdleDraftLabel={
                      !hasHiddenChildren && trailingIndicatorKind === "draft"
                    }
                    shine={!ribbonSettings.shimmerWorkingRows}
                  />
                ) : (
                  <ThreadTrailingIndicator
                    {...trailingIndicatorState}
                    hideIdleDraftLabel={
                      !hasHiddenChildren && trailingIndicatorKind === "draft"
                    }
                    pluginStatus={pluginThreadRowStatus}
                  />
                )}
              </span>
              <div
                data-sidebar-hover-actions-open={
                  isActionsOpen ? "true" : undefined
                }
                className={cn(
                  SIDEBAR_HOVER_ACTIONS_CLASS,
                  "absolute inset-y-0 right-0 z-10 flex items-center justify-end max-md:pointer-coarse:hidden",
                  isEditing && "invisible pointer-events-none",
                )}
              >
                <SidebarRowControls
                  // Completed is the way a thread leaves the list; archiving
                  // by hand has no place on a Ribbon row.
                  primaryAction={
                    ribbon ? null : (
                      <ThreadArchiveQuickAction
                        thread={thread}
                        className={SIDEBAR_CONTROL_BUTTON_CLASS}
                      />
                    )
                  }
                >
                  <ThreadActionsMenu
                    thread={thread}
                    triggerClassName={
                      ribbon ? RIBBON_ROW_BUTTON_CLASS : SIDEBAR_CONTROL_BUTTON_CLASS
                    }
                    onOpenInSplit={splitAvailable ? openInSplit : undefined}
                    onOpenChange={setIsDropdownActionsOpen}
                    onRename={rename.startEditingFromMenu}
                    onCloseAutoFocus={rename.onCloseAutoFocus}
                  />
                </SidebarRowControls>
              </div>
            </span>
          </span>
        )}
      </span>
    </>
  );

  const row = renderThreadRowContainer({
    attributes: ribbon
      ? {
          "data-thread-id": thread.id,
          "data-ribbon-stage": ribbon.stage,
          "data-ribbon-depth": String(options.depth),
          ...(ribbonShines ? { [SHINE_ROW_ATTRIBUTE]: "" } : {}),
          ...(ribbonWorking ? { [ACTIVE_ROW_ATTRIBUTE]: "" } : {}),
          // Until the row can say what its pull request is waiting on, it is
          // still being drawn; screenshots and tests wait for this to clear.
          ...(ribbon.pullRequest?.pending
            ? { "data-ribbon-pull-request-pending": "" }
            : {}),
        }
      : undefined,
    children: rowContent,
    className: rowClassName,
    containerRef,
    dragBindings: rowDragBindings,
    nestTargetState,
    reorderPlacement,
    onClick: isEditing ? undefined : handleRowClick,
    onClickCapture:
      !isEditing && options.consumeClickSuppression
        ? handleRowClickCapture
        : undefined,
    onSplitDragPointerDown: isEditing ? undefined : onSplitDragPointerDown,
    stickyLevel: parentOptions?.stickyLevel,
    style: rowStyle,
  });

  return (
    <ThreadActionsContextMenu
      thread={thread}
      onOpenInSplit={splitAvailable ? openInSplit : undefined}
      onOpenChange={setIsContextActionsOpen}
      onRename={rename.startEditingFromMenu}
      onCloseAutoFocus={rename.onCloseAutoFocus}
      disabled={isEditing}
      dragging={rowDragBindings?.isDragging ?? false}
    >
      {row}
    </ThreadActionsContextMenu>
  );
}

export const ThreadRow = memo(ThreadRowComponent);
