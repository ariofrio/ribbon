import {
  memo,
  useCallback,
  useEffect,
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
import { useIsCompactViewport } from "@/components/ui/hooks/use-compact-viewport";
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
  resolveThreadListIndicator,
  resolveThreadStatus,
  threadListIndicatorStateForThread,
  NO_COLLAPSED_CHILD_ACTIVITY,
  type CollapsedChildActivity,
  type ThreadListIndicatorState,
} from "../model/thread-activity.js";
import {
  experimental_ThreadStatusGlyph as ThreadStatusGlyph,
  experimental_THREAD_ACTION_GROUPS,
  experimental_useSidebarThreadSplit,
  experimental_useProviders,
  experimental_ProviderIcon as ProviderIcon,
  ThreadTitle,
  useSidebarSplitLayout,
  useSidebarThreadDraft,
  useSidebarThreadRowStatus,
  useSidebarThreadShortcut,
  useSdk,
  type PluginSidebarSplitPane,
  type PluginThreadActionsInlineItem,
  type PluginThreadActionsTriggerProps,
  type PluginSidebarThreadRowStatus,
} from "@get-bb/plugin-sdk/app";
import type { SidebarThread } from "../model/sidebar-thread.js";
import {
  NO_THREAD_IDS,
  useThreadsHaveDraft,
} from "../list/sidebarDraftPresence.js";
import { useSidebarProjectName } from "../model/use-sidebar-data.js";
import {
  sidebarShowProviderIconsAtom,
  threadRowActionsAtom,
} from "../preferences/atoms.js";
import { AppCommandShortcutPill } from "../ui/AppCommandShortcutPill.js";
import { SidebarStickyTier } from "../ui/sidebar.js";
import {
  SIDEBAR_HOVER_ACTIONS_CLASS,
  SIDEBAR_HOVER_ACTIONS_FADE_CLASS,
  SIDEBAR_HOVER_ACTIONS_INSET_CLASS,
  SIDEBAR_HOVER_ACTIONS_ROW_CLASS,
} from "@/components/ui/sidebar-hover-actions";
import type { ConsumeDragClickSuppression } from "@/components/ui/use-drag-click-suppression";
import { SidebarChildToggleChevron } from "./SidebarChildToggleChevron.js";
import { useSidebarRename } from "./SidebarInlineRename.js";
import { SidebarRowControls } from "./SidebarRowControls.js";
import {
  SIDEBAR_CONTROL_BUTTON_CLASS,
  SIDEBAR_CONTROL_STATE_CLASS,
  SIDEBAR_ROW_TEXT_CLASS,
  SIDEBAR_ROW_BASE_CLASS,
  SIDEBAR_ROW_GLYPH_SLOT_CLASS,
  SIDEBAR_ROW_ACCENT_STATE_CLASS,
  SIDEBAR_ROW_INTERACTIVE_STATE_CLASS,
  SIDEBAR_ROW_OPEN_IN_SPLIT_STATE_CLASS,
  SIDEBAR_ROW_SELECTED_STATE_CLASS,
  SIDEBAR_STATUS_GLYPH_BOX_CLASS,
  getSidebarThreadGroupLineLeft,
  getSidebarThreadRowPaddingLeft,
} from "@/components/ui/sidebar-row-classes";
import type {
  SidebarNestTargetState,
  SidebarReorderPlacement,
  ThreadRowNestDrop,
} from "./sidebarThreadRowDroppable.js";
import type { SidebarSortableDragBindings } from "@/components/ui/sortable-motion";
import { SidebarThreadDragChip } from "../dnd/sidebarThreadDragChip.js";
import { SplitPaneMiniMap } from "./SplitPaneMiniMap.js";
import { ThreadRowQuickActions } from "./ThreadRowQuickActions.js";
import { useRibbonThreadActions } from "../../ribbon/app/row-actions.js";
import { useOpenThreadInSplit } from "./threadRowNavigation.js";
import { Button } from "@/components/ui/button";
import { COARSE_POINTER_ICON_SIZE_CLASS } from "@/components/ui/coarse-pointer-sizing";
import {
  RIBBON_SELECTED_ROW_SURFACE_CLASS,
  RibbonActionButtons,
  RibbonStageGlyph,
  RibbonTrailingIndicator,
  useRibbonRow,
  useRibbonRowSettings,
} from "../../ribbon/app/row.js";
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
  "pointer-fine:mx-1 pointer-fine:after:absolute pointer-fine:after:left-1/2 pointer-fine:after:top-1/2 pointer-fine:after:h-7 pointer-fine:after:w-7 pointer-fine:after:-translate-x-1/2 pointer-fine:after:-translate-y-1/2 pointer-fine:after:content-['']";
// A toggle shown only on hover takes no room at rest, so the title runs on
// past where it will appear; hovering the row opens it up, reach and all.
const RIBBON_CHEVRON_REVEAL_CLASS =
  "overflow-hidden pointer-fine:h-5 pointer-fine:w-0 pointer-fine:mx-0 pointer-fine:after:hidden pointer-fine:group-hover/thread-row:w-5 pointer-fine:group-hover/thread-row:mx-1 pointer-fine:group-hover/thread-row:after:block pointer-fine:group-has-[:focus-visible]/thread-row:w-5 pointer-fine:group-has-[:focus-visible]/thread-row:mx-1 pointer-fine:group-has-[:focus-visible]/thread-row:after:block";
// Hover controls open their own lane before prompts and PR information, so
// only the title yields space while those persistent items stay in place.
const RIBBON_ROW_CONTROLS_LANE_CLASS =
  "relative w-0 shrink-0 self-stretch group-hover/thread-row:w-(--ribbon-row-controls-width) group-has-[:focus-visible]/thread-row:w-(--ribbon-row-controls-width) group-has-[[data-sidebar-hover-actions-open=true]]/thread-row:w-(--ribbon-row-controls-width) max-md:pointer-coarse:hidden";
import { ThreadActionsContextMenu, ThreadActionsMenu } from "./ThreadActionsMenu.js";
import { useCustomizeThreadRowActions, useThreadRowActionsCustomizing } from "../list/customizeRowActionsContext.js";
import { SIDEBAR_MORE_ACTION_TRIGGER_CLASS, SIDEBAR_STICKY_ROW_INTERACTIVE_SURFACE_CLASS } from "./sidebarRowClasses.js";
import {
  ThreadRowActionsEditor,
  focusFirstRowActionSlot,
} from "../list/ThreadRowActionsCustomize.js";

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

function getHoverActionsInsetStyle(
  actionCount: number,
  ribbon: boolean,
): CSSProperties {
  const variable = ribbon
    ? "--ribbon-row-controls-width"
    : "--bb-sidebar-hover-actions-inset";
  return {
    [variable]: `calc(var(--spacing) * ${ribbon ? Math.max(0, 7.5 * actionCount - 0.5) : 7.5 * actionCount})`,
  } as CSSProperties;
}

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
  const hasUnsubmittedDraft = useThreadsHaveDraft(activity.threadIds);
  const statusProps: ThreadListIndicatorState = {
    hasPendingInteraction: activity.pending,
    hasUnsubmittedDraft,
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
  return (
    <ThreadStatusGlyph
      indicator={resolveThreadListIndicator(statusProps)}
      rowStatus={pluginStatus}
    />
  );
}

function ThreadTrailingIndicator({
  state,
  hideIdleDraftLabel,
  rowStatus,
}: {
  state: ThreadListIndicatorState;
  hideIdleDraftLabel: boolean;
  rowStatus: PluginSidebarThreadRowStatus | null;
}) {
  const { indicatorKind, rowStatusIsVisible } = resolveThreadStatus(
    state,
    rowStatus,
  );

  if (indicatorKind === "none" && !rowStatusIsVisible) {
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
      <ThreadStatusGlyph
        indicator={indicatorKind}
        rowStatus={rowStatus}
        hideIdleDraftLabel={hideIdleDraftLabel}
      />
    </span>
  );
}

const ARCHIVED_ROW_ACTION_KEYS = ["bb--core/archive"];
const CUSTOMIZE_ROW_ACTIONS_KEY = "thread-list/customizeRowActions";

function renderThreadActionsTrigger(props: PluginThreadActionsTriggerProps) {
  return (
    <Button
      {...props}
      type="button"
      variant="ghost"
      size="icon"
      className={cn(
        props.className,
        "rounded-md p-0",
        "data-[state=open]:bg-state-active data-[state=open]:text-foreground",
        SIDEBAR_CONTROL_BUTTON_CLASS,
      )}
      aria-label="Thread actions"
      data-thread-actions-trigger=""
      onClick={(event) => {
        props.onClick?.(event);
        event.stopPropagation();
      }}
    >
      <Icon name="MoreHorizontal" className={COARSE_POINTER_ICON_SIZE_CLASS} />
    </Button>
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
  thread,
  crossProjectId,
  isActive,
  onProjectSelect,
  options,
}: ThreadRowProps) {
  const [isDropdownActionsOpen, setIsDropdownActionsOpen] = useState(false);
  const [isContextActionsOpen, setIsContextActionsOpen] = useState(false);
  const sdk = useSdk();
  const openThreadInSplit = useOpenThreadInSplit();
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
    async (nextTitle: string) => {
      await sdk.threads.update({ threadId: thread.id, title: nextTitle });
    },
    [sdk, thread.id],
  );
  const rename = useSidebarRename({
    kind: "thread",
    id: thread.id,
    name: labelTitle,
    label: "Thread name",
    onSave: handleRename,
  });
  const { editor, isEditing, startEditing, startEditingFromDoubleClick } =
    rename;
  const finishCustomizingActions = useThreadRowActionsCustomizing(thread.id);
  const isCustomizingActions = finishCustomizingActions !== null;
  const startTitleEditing = useCallback(
    (event: { preventDefault: () => void; stopPropagation: () => void }) => {
      event.preventDefault();
      event.stopPropagation();
      startEditingFromDoubleClick();
    },
    [startEditingFromDoubleClick],
  );
  const miniMap = useThreadSplitMiniMap(thread.id);
  const isOpenInSplit = miniMap !== null;
  const split = experimental_useSidebarThreadSplit(thread.id);
  const onSplitDragPointerDown = split.splitProps.onPointerDown;
  const splitAvailable = split.isAvailable;
  const openInSplit = useCallback(() => {
    openThreadInSplit(thread.id);
  }, [openThreadInSplit, thread.id]);
  const rowActionKeys = useAtomValue(threadRowActionsAtom);
  const quickActions = useRibbonThreadActions(thread, {
    keys: thread.archivedAt !== null ? ARCHIVED_ROW_ACTION_KEYS : rowActionKeys,
    requestRename: () => {
      startEditing();
    },
  });
  const customizeRowActions = useCustomizeThreadRowActions();
  const isCompactViewport = useIsCompactViewport();
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
  const hiddenChildrenHaveDraft = useThreadsHaveDraft(
    hasHiddenChildren ? childActivity.threadIds : NO_THREAD_IDS,
  );
  const trailingIndicatorState: ThreadListIndicatorState = {
    hasPendingInteraction:
      threadStatus.hasPendingInteraction ||
      (hasHiddenChildren && childActivity.pending),
    hasUnsubmittedDraft:
      threadStatus.hasUnsubmittedDraft || hiddenChildrenHaveDraft,
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
  const ribbon = useRibbonRow(thread, trailingIndicatorState, pluginThreadRowStatus);
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
  // Persistent items keep the indicator slot clear, so PR numbers and prompts
  // share a trailing edge across rows. A quiet title can use that slot too.
  const ribbonLaneAtRest =
    ribbon !== null &&
    (miniMap !== null ||
      ribbon.status.indicator !== "none" ||
      ribbon.status.pluginStatus !== null ||
      ribbon.status.pullRequestMark !== null ||
      ribbon.pullRequest?.position === "right" ||
      ribbon.actions.length > 0 ||
      thread.archivedAt !== null ||
      Boolean(shortcut));
  const ribbonControlsMeetIndicator =
    ribbon !== null &&
    ribbon.actions.length === 0 &&
    ribbon.pullRequest?.position !== "right" &&
    quickActions.length > 0 &&
    thread.archivedAt === null &&
    !shortcut;
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
  const rowDragBindings =
    isEditing || isCustomizingActions ? undefined : options.dragBindings;
  const nestTargetState = options.nestDrop?.state ?? null;
  const reorderPlacement = options.nestDrop?.reorderPlacement ?? null;
  const containerRef = useComposedRefs<HTMLDivElement>(
    rowDragBindings?.setActivatorNodeRef,
    options.nestDrop?.setNodeRef,
    shineRowRef,
  );
  const isActionsOpen = isDropdownActionsOpen || isContextActionsOpen;
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
        // Ribbon's open row wears the hover tint over the opaque sidebar.
        ? `${RIBBON_SELECTED_ROW_SURFACE_CLASS} bb-sidebar-selected-row ${SIDEBAR_ROW_TEXT_CLASS}`
        : SIDEBAR_ROW_SELECTED_STATE_CLASS
      : SIDEBAR_ROW_INTERACTIVE_STATE_CLASS,
    // A row outside Active stays dim while hovered and while open.
    ribbon?.muted &&
      "text-subtle-foreground/75 hover:text-subtle-foreground/75",
    !showActive && isOpenInSplit && SIDEBAR_ROW_OPEN_IN_SPLIT_STATE_CLASS,
    !showActive &&
      "has-[[data-state=open]]:bg-sidebar-accent has-[[data-sidebar-rename-anchor]:focus-visible]:bg-sidebar-accent",
    !showActive && parentOptions?.stickyLevel !== undefined &&
      SIDEBAR_STICKY_ROW_INTERACTIVE_SURFACE_CLASS,
    rowDragBindings && !rowDragBindings.disabled && "select-none",
    !isActionsOpen && "data-[sidebar-touch-armed=true]:!bg-transparent",
    nestTargetState && NEST_TARGET_STATE_CLASS[nestTargetState],
    reorderPlacement && REORDER_PLACEMENT_CLASS[reorderPlacement],
    isCustomizingActions && "bg-sidebar-accent",
  );
  const rowStyle = {
    ...getThreadRowStyle(options.depth),
    // Where the stage ring's centre sits, for the rails to meet it.
    ...(ribbon ? { ["--ribbon-ring-y" as string]: "50%" } : {}),
  };
  const parentGuideLeft =
    options.depth > 0 ? getSidebarThreadGroupLineLeft(options.depth - 1) : null;
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
  useEffect(() => {
    if (isCustomizingActions) {
      focusFirstRowActionSlot(
        rowLinkRef.current?.closest("[data-sidebar-rename-row]"),
      );
    }
  }, [isCustomizingActions]);
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
  const actionsMenu = (
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
  );
  const rowControls = (
    <SidebarRowControls
      // Completed is the default way a thread leaves Ribbon's list;
      // additional hover actions are chosen by the user.
      primaryAction={
        <ThreadRowQuickActions
          entries={thread.archivedAt === null ? quickActions : []}
          className={
            ribbon ? RIBBON_ROW_BUTTON_CLASS : SIDEBAR_CONTROL_BUTTON_CLASS
          }
          onMenuOpenChange={setIsDropdownActionsOpen}
        />
      }
    >
      {ribbon ? null : actionsMenu}
    </SidebarRowControls>
  );
  const childToggle = parentOptions && hasChildren ? (
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
          !isActionsOpen &&
            "group-data-[sidebar-touch-armed=true]/thread-row:hidden",
          !shortcut &&
            !isEditing &&
            ribbon === null &&
            (reserveActionSpace
              ? "pr-(--bb-sidebar-hover-actions-inset) [@media(hover:none)]:pr-0"
              : SIDEBAR_HOVER_ACTIONS_INSET_CLASS),
          ribbon !== null &&
            !isEditing &&
            (ribbonLaneAtRest ? "pr-9" : "pr-2"),
          ribbon !== null &&
            !isEditing &&
            (ribbonControlsMeetIndicator
              ? "group-hover/thread-row:pr-7.5 group-has-[:focus-visible]/thread-row:pr-7.5 group-has-[[data-sidebar-hover-actions-open=true]]/thread-row:pr-7.5"
              : "group-hover/thread-row:pr-9 group-has-[:focus-visible]/thread-row:pr-9 group-has-[[data-sidebar-hover-actions-open=true]]/thread-row:pr-9"),
          ribbon !== null &&
            !isEditing &&
            (ribbonLaneAtRest
              ? "max-md:pointer-coarse:pr-9"
              : "max-md:pointer-coarse:pr-2"),
        )}
        style={getHoverActionsInsetStyle(
          thread.archivedAt !== null ? (ribbon ? 0 : 1) : quickActions.length,
          ribbon !== null,
        )}
      >
        <a
          ref={rowLinkRef}
          href={thread.href}
          draggable={false}
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
            if (
              consumeSidebarTitleDoubleClick(thread.id) &&
              startEditingFromDoubleClick()
            ) {
              event.preventDefault();
              event.stopPropagation();
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
          {isEditing && provider ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  data-sidebar-thread-provider={provider.id}
                  role="img"
                  aria-label={provider.displayName}
                  className="pointer-events-auto relative z-[31] flex size-4 shrink-0 items-center justify-center mr-1.5 text-muted-foreground"
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
              <TooltipContent side="top">{provider.displayName}</TooltipContent>
            </Tooltip>
          ) : null}
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
              {ribbon ? childToggle : null}
              {ribbon && !shortcut && thread.archivedAt === null && quickActions.length > 0 ? (
                <span className={RIBBON_ROW_CONTROLS_LANE_CLASS}>
                  <div
                    data-sidebar-hover-actions-open={isActionsOpen ? "true" : undefined}
                    className={cn(
                      SIDEBAR_HOVER_ACTIONS_CLASS,
                      "absolute inset-y-0 right-0 z-10 flex items-center",
                    )}
                  >
                    {rowControls}
                  </div>
                </span>
              ) : null}
              {ribbon && ribbon.actions.length > 0 ? (
                <RibbonActionButtons
                  actions={ribbon.actions}
                  color={ribbonActionColor}
                  rowTitle={labelTitle}
                  onRun={(actionId) => ribbon.runThreadAction(thread.id, actionId)}
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
        {ribbon === null ? childToggle : null}
      </span>
      {rowDragBindings && !rowDragBindings.disabled && !isActionsOpen ? (
        <SidebarThreadDragChip
          title={labelTitle}
          visualOnly
          className="hidden group-data-[sidebar-touch-armed=true]/thread-row:flex"
        />
      ) : null}
      <span
        data-sidebar-thread-trailing=""
        className={cn(
          "flex shrink-0 items-center gap-0.5",
          !isActionsOpen &&
            "group-data-[sidebar-touch-armed=true]/thread-row:hidden",
          // Out of the row's flow, so the title decides how much of it to leave.
          ribbon !== null && "absolute inset-y-0 right-0",
          (isEditing || isCustomizingActions) && "hidden",
        )}
      >
        {thread.archivedAt !== null ? (
          <span className="relative flex items-center [@media(hover:none)]:hidden">
            <div
              data-sidebar-hover-actions-open={
                isActionsOpen ? "true" : undefined
              }
              className={cn(
                SIDEBAR_HOVER_ACTIONS_CLASS,
                "absolute z-10 flex items-center max-md:pointer-coarse:hidden",
                ribbon ? "inset-y-0 right-0" : "right-full",
              )}
            >
              {actionsMenu}
            </div>
            <span className={ribbon ? SIDEBAR_HOVER_ACTIONS_FADE_CLASS : undefined}
              onPointerDown={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
              <ThreadRowQuickActions entries={quickActions} className={SIDEBAR_CONTROL_BUTTON_CLASS} />
            </span>
          </span>
        ) : shortcut ? (
          <AppCommandShortcutPill shortcut={shortcut} />
        ) : (
          <span
            className={cn(
              "flex shrink-0 items-center justify-end [@media(hover:none)]:pointer-events-none",
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
                    shine={!ribbonShines}
                  />
                ) : (
                  <ThreadTrailingIndicator
                    state={trailingIndicatorState}
                    hideIdleDraftLabel={
                      !hasHiddenChildren && trailingIndicatorKind === "draft"
                    }
                    rowStatus={pluginThreadRowStatus}
                  />
                )}
              </span>
              <div
                data-sidebar-hover-actions-open={
                  isActionsOpen ? "true" : undefined
                }
                className={cn(
                  SIDEBAR_HOVER_ACTIONS_CLASS,
                  "absolute inset-y-0 right-0 z-10 flex items-center justify-end [@media(hover:none)]:hidden",
                  isEditing && "invisible pointer-events-none",
                )}
              >
                {ribbon ? actionsMenu : rowControls}
              </div>
            </span>
          </span>
        )}
      </span>
      {finishCustomizingActions ? (
        <ThreadRowActionsEditor onDone={finishCustomizingActions} />
      ) : null}
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
      onRename={rename.startEditingFromMenu}
      onOpenChange={setIsContextActionsOpen}
      onCloseAutoFocus={rename.onCloseAutoFocus}
      disabled={isEditing}
      dragging={rowDragBindings?.isDragging ?? false}
    >
      {row}
    </ThreadActionsContextMenu>
  );
}

export const ThreadRow = memo(ThreadRowComponent);
