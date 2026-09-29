import {
  useCallback,
  type CSSProperties,
  type KeyboardEventHandler,
  type MouseEvent,
  type MouseEventHandler,
  type PointerEventHandler,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";
import { LIST_HOVER_TRANSITION } from "@/components/ui/motion";
import { CHROME_SECTION_LABEL_CLASS } from "@/components/ui/chrome-style-tokens";
import { COARSE_POINTER_ROW_HEIGHT_CLASS } from "@/components/ui/coarse-pointer-sizing";
import { CHROME_GROUP_HEADING_CLASS } from "../../ribbon/app/chrome-style-tokens.js";
import { useRibbonData } from "../../ribbon/app/data.js";
import { HEADING_MUTED_CLASS, HEADING_TEXT_CLASS } from "../../ribbon/app/heading.js";
import { GroupBody } from "../../ribbon/app/group-body.js";
import {
  SidebarStickyGroup,
  SidebarStickyTier,
} from "../ui/sidebar.js";
import {
  SIDEBAR_HOVER_ACTIONS_CLASS,
  SIDEBAR_HOVER_ACTIONS_FADE_CLASS,
  SIDEBAR_HOVER_ACTIONS_GAP_CLASS,
  SIDEBAR_HOVER_ACTIONS_MOBILE_ALWAYS_VALUE,
  SIDEBAR_HOVER_ACTIONS_ROW_CLASS,
} from "../ui/sidebar-hover-actions.js";
import type { ConsumeDragClickSuppression } from "../ui/use-drag-click-suppression.js";
import {
  SIDEBAR_STANDARD_ROW_PADDING_CLASS,
  SIDEBAR_CONTROL_STATE_CLASS,
  SIDEBAR_GROUP_TEXT_CLASS,
  SIDEBAR_MORE_ACTION_TRIGGER_CLASS,
} from "../rows/sidebarRowClasses.js";
import {
  SectionDropTargetOverlay,
  useSectionDropTargetState,
} from "../dnd/useSectionDropTargetState.js";
import type { SidebarSortableDragBindings } from "../rows/sortableMotion.js";
import {
  NO_COLLAPSED_CHILD_ACTIVITY,
  type CollapsedChildActivity,
} from "../model/thread-activity.js";
import { CollapsedThreadStatusGlyph } from "../rows/ThreadRow.js";
import {
  useThreadGroupSplitIndicator,
  type ThreadSplitIndicatorTarget,
} from "./groupRollups.js";
import { SplitPaneMiniMap } from "../rows/SplitPaneMiniMap.js";
import { COARSE_POINTER_ROW_ACTION_SIZE_CLASS } from "@/components/ui/coarse-pointer-sizing";
import { usePluginThreadRowStatusForThreads } from "./groupRollups.js";

const EMPTY_SPLIT_INDICATOR_THREADS: readonly ThreadSplitIndicatorTarget[] = [];

function stopActionsClick(event: MouseEvent<HTMLSpanElement>) {
  event.stopPropagation();
}

interface TopLevelSidebarSectionCollapseControl {
  isCollapsed: boolean;
  onToggleCollapsed: () => void;
}

export interface TopLevelSidebarSectionProps {
  label: string;
  /** Drawn before the label: the group's icon. */
  leading?: ReactNode;
  /** The heading's wash and ink, from the group's color. */
  headingStyle?: CSSProperties;
  /** Rendered beside the heading's controls, such as a picker they open. */
  trailing?: ReactNode;
  labelEditor?: ReactNode;
  onRename?: () => void;
  children: ReactNode;
  dropParentKey?: string;
  sectionId?: string;
  stickyHeader?: boolean;
  status?: ReactNode;
  actions?: ReactNode;
  actionsAlwaysVisible?: boolean;
  actionsMobileAlways?: boolean;
  actionsOpen?: boolean;
  collapseControl?: TopLevelSidebarSectionCollapseControl;
  collapsedActivity?: CollapsedChildActivity;
  collapsedThreads?: readonly ThreadSplitIndicatorTarget[];
  dragBindings?: SidebarSortableDragBindings;
  sectionRef?: (element: HTMLDivElement | null) => void;
  sectionStyle?: CSSProperties;
  consumeClickSuppression?: ConsumeDragClickSuppression;
  isDropTargetActive?: boolean;
}

export function TopLevelSidebarSection({
  label,
  leading,
  headingStyle,
  trailing,
  labelEditor,
  onRename,
  children,
  dropParentKey,
  sectionId,
  stickyHeader = true,
  status,
  actions,
  actionsAlwaysVisible = false,
  actionsMobileAlways = false,
  actionsOpen = false,
  collapseControl,
  collapsedActivity,
  collapsedThreads = EMPTY_SPLIT_INDICATOR_THREADS,
  dragBindings,
  sectionRef,
  sectionStyle,
  consumeClickSuppression,
  isDropTargetActive = false,
}: TopLevelSidebarSectionProps) {
  const threadDropState = useSectionDropTargetState(dropParentKey);
  // Ribbon's heading: laid out like a thread row, and a toggle from end to
  // end, with the chevron a picture of it rather than the only way in.
  const ribbon = useRibbonData() !== null;
  const collapsedSplitIndicator = useThreadGroupSplitIndicator(
    collapsedThreads,
    collapseControl?.isCollapsed === true,
  );
  const pluginStatus = usePluginThreadRowStatusForThreads(collapsedThreads);
  const hasCollapsedActivity =
    collapsedActivity !== undefined &&
    (collapsedActivity.pending ||
      collapsedActivity.working ||
      collapsedActivity.hasUnsubmittedDraft ||
      collapsedActivity.unread ||
      collapsedActivity.unreadError);
  const showCollapsedActivity =
    !status &&
    collapseControl?.isCollapsed === true &&
    (collapsedSplitIndicator.miniMap !== null ||
      hasCollapsedActivity ||
      pluginStatus !== null);
  // Folded and quiet, a group says how many threads it holds.
  const collapsedCount =
    !status &&
    collapseControl?.isCollapsed === true &&
    !showCollapsedActivity &&
    collapsedThreads.length > 0 ? (
      <span
        aria-label={`${collapsedThreads.length} ${collapsedThreads.length === 1 ? "thread" : "threads"}`}
        data-sidebar-collapsed-count=""
        className={cn(
          "pointer-events-none absolute right-0 top-1/2 z-20 inline-flex -translate-y-1/2 items-center justify-center text-xs tabular-nums max-md:static max-md:shrink-0 max-md:translate-y-0",
          COARSE_POINTER_ROW_ACTION_SIZE_CLASS,
          actions && SIDEBAR_HOVER_ACTIONS_FADE_CLASS,
        )}
      >
        {/* The fade sets this span's opacity, so the dimming sits inside it. */}
        <span className="opacity-60">{collapsedThreads.length}</span>
      </span>
    ) : null;
  const collapsedActivityIndicator = showCollapsedActivity ? (
    <span
      data-sidebar-collapsed-activity-edge=""
      data-sidebar-hover-actions-open={actionsOpen ? "true" : undefined}
      className={cn(
        "pointer-events-none absolute right-0 top-1/2 z-20 inline-flex -translate-y-1/2 items-center justify-center text-subtle-foreground max-md:static max-md:shrink-0 max-md:translate-y-0",
        COARSE_POINTER_ROW_ACTION_SIZE_CLASS,
        actions && SIDEBAR_HOVER_ACTIONS_FADE_CLASS,
      )}
    >
      {collapsedSplitIndicator.miniMap ? (
        <SplitPaneMiniMap
          slots={collapsedSplitIndicator.miniMap}
          label={`${label} — contains a thread open in split`}
          isWorking={
            collapsedActivity?.working || pluginStatus?.tone === "running"
          }
        />
      ) : collapsedActivity || pluginStatus ? (
        <CollapsedThreadStatusGlyph
          activity={collapsedActivity ?? NO_COLLAPSED_CHILD_ACTIVITY}
          pluginStatus={pluginStatus}
        />
      ) : null}
    </span>
  ) : null;
  const handleClickCapture = useCallback<MouseEventHandler<HTMLDivElement>>(
    (event) => {
      if (labelEditor || !consumeClickSuppression?.()) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
    },
    [consumeClickSuppression, labelEditor],
  );
  const handleHeadingClick = useCallback<MouseEventHandler<HTMLDivElement>>(
    (event) => {
      // Every click toggles at once, with nothing waiting to tell a double
      // click apart. The name is the rename hotspot and toggles on its own,
      // once a second click has had its chance to arrive.
      if (!ribbon || !collapseControl || labelEditor) return;
      if (
        event.target instanceof Element &&
        event.target.closest(
          "button, a, input, textarea, [data-sidebar-trailing-controls], [data-sidebar-heading-name]",
        )
      ) {
        return;
      }
      collapseControl.onToggleCollapsed();
    },
    [collapseControl, labelEditor, ribbon],
  );
  // A click on the name folds the group at once. The second click of a
  // double click folds nothing more and renames instead, so the group is
  // left where the first click put it rather than folded and unfolded.
  const handleNameClick = useCallback<MouseEventHandler<HTMLSpanElement>>(
    (event) => {
      if (!ribbon || !collapseControl || labelEditor) return;
      event.stopPropagation();
      if (onRename && event.detail > 1) return;
      collapseControl.onToggleCollapsed();
    },
    [collapseControl, labelEditor, onRename, ribbon],
  );
  const handleCollapseControlClick = useCallback<
    MouseEventHandler<HTMLButtonElement>
  >(
    (event) => {
      event.preventDefault();
      event.stopPropagation();
      collapseControl?.onToggleCollapsed();
    },
    [collapseControl],
  );
  const stopCollapseControlPointerDown = useCallback<
    PointerEventHandler<HTMLButtonElement>
  >((event) => {
    event.stopPropagation();
  }, []);
  const stopCollapseControlKeyDown = useCallback<
    KeyboardEventHandler<HTMLButtonElement>
  >((event) => {
    event.stopPropagation();
  }, []);

  return (
    <SidebarStickyGroup
      ref={sectionRef}
      style={sectionStyle}
      data-sidebar-section-id={sectionId}
      data-sidebar-drop-target={threadDropState ?? undefined}
      data-sidebar-rename-row=""
      data-sidebar-sticky-header={stickyHeader ? undefined : "false"}
      className={cn(
        "group/sidebar-section relative min-w-0 rounded-md transition-colors",
        isDropTargetActive && "bg-sidebar-accent/60",
      )}
      onClickCapture={handleClickCapture}
    >
      {threadDropState ? (
        <SectionDropTargetOverlay state={threadDropState} />
      ) : null}
      <SidebarStickyTier
        ref={dragBindings?.setActivatorNodeRef}
        tier="label"
        className={cn(
          SIDEBAR_HOVER_ACTIONS_ROW_CLASS,
          ribbon
            ? cn(COARSE_POINTER_ROW_HEIGHT_CLASS, CHROME_GROUP_HEADING_CLASS, "cursor-pointer")
            : cn(
                CHROME_SECTION_LABEL_CLASS,
                headingStyle
                  ? "text-[color:var(--ribbon-heading-on,currentColor)]"
                  : SIDEBAR_GROUP_TEXT_CLASS,
              ),
          SIDEBAR_STANDARD_ROW_PADDING_CLASS,
          "rounded-md pr-0 transition-colors",
          !stickyHeader && "relative top-auto",
          dragBindings && !dragBindings.disabled && "select-none",
        )}
        style={headingStyle}
        onClick={ribbon ? handleHeadingClick : undefined}
        {...dragBindings?.attributes}
        {...(dragBindings?.listeners ?? {})}
      >
        <span
          className={cn(
            "relative z-10 flex min-w-0 flex-1 items-center gap-1 text-left",
            // The name reads in the heading's ink, as Ribbon's did; the
            // dark-mode title color on the tier would otherwise win.
            ribbon && HEADING_TEXT_CLASS,
          )}
        >
          {leading ? (
            // With the gap, the icon sits 6px before the name, as a row's glyph does before its title.
            <span className={cn("inline-flex shrink-0 items-center", ribbon ? "mr-0.5" : "mr-1")} aria-hidden="true">
              {leading}
            </span>
          ) : null}
          {labelEditor ?? (
            <span
              // In Ribbon's heading the name is a hotspot the full height of
              // the row, so a double click anywhere level with it renames.
              className={cn(
                "min-w-0 truncate",
                ribbon && "flex min-w-0 items-center self-stretch",
              )}
              data-sidebar-heading-name={ribbon ? "" : undefined}
              title={label}
              onClick={ribbon ? handleNameClick : undefined}
              onDoubleClick={
                onRename
                  ? (event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      onRename();
                    }
                  : undefined
              }
            >
              {ribbon ? <span className="min-w-0 truncate">{label}</span> : label}
            </span>
          )}
          {collapseControl ? (
            <button
              type="button"
              disabled={Boolean(labelEditor)}
              data-sidebar-rename-anchor=""
              aria-expanded={!collapseControl.isCollapsed}
              data-sidebar-hover-actions-mobile={
                SIDEBAR_HOVER_ACTIONS_MOBILE_ALWAYS_VALUE
              }
              aria-label={
                collapseControl.isCollapsed
                  ? `Expand ${label} section`
                  : `Collapse ${label} section`
              }
              className={cn(
                ribbon
                  ? cn(
                      "z-20 inline-flex shrink-0 cursor-pointer items-center justify-center rounded-md outline-none ring-sidebar-ring focus-visible:ring-2",
                      SIDEBAR_MORE_ACTION_TRIGGER_CLASS,
                      "mr-2",
                      HEADING_MUTED_CLASS,
                    )
                  : cn(
                      !collapseControl.isCollapsed && SIDEBAR_HOVER_ACTIONS_CLASS,
                      "relative z-20 inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md outline-none ring-sidebar-ring focus-visible:ring-2",
                      SIDEBAR_CONTROL_STATE_CLASS,
                    ),
                LIST_HOVER_TRANSITION,
                labelEditor && "hidden",
              )}
              onClick={handleCollapseControlClick}
              onPointerDown={stopCollapseControlPointerDown}
              onKeyDown={stopCollapseControlKeyDown}
            >
              <Icon
                name="ChevronRight"
                className={cn(
                  "size-3 transition-transform duration-150",
                  !collapseControl.isCollapsed && "rotate-90",
                )}
                aria-hidden="true"
              />
            </button>
          ) : null}
        </span>
        {status || actions || collapsedActivityIndicator || collapsedCount ? (
          <span
            data-sidebar-trailing-controls=""
            className={cn(
              "relative z-20 inline-flex h-7 shrink-0 items-center max-md:pointer-coarse:h-9",
              labelEditor && "hidden",
              SIDEBAR_HOVER_ACTIONS_GAP_CLASS,
            )}
            onClick={status || actions ? stopActionsClick : undefined}
          >
            {status}
            {collapsedActivityIndicator}
            {collapsedCount}
            {trailing}
            {actions ? (
              <span
                data-sidebar-hover-actions-open={
                  actionsOpen ? "true" : undefined
                }
                data-sidebar-hover-actions-mobile={
                  actionsMobileAlways
                    ? SIDEBAR_HOVER_ACTIONS_MOBILE_ALWAYS_VALUE
                    : undefined
                }
                className={cn(
                  "inline-flex shrink-0 items-center",
                  SIDEBAR_HOVER_ACTIONS_GAP_CLASS,
                  !actionsAlwaysVisible && SIDEBAR_HOVER_ACTIONS_CLASS,
                  collapseControl?.isCollapsed &&
                    "max-md:pointer-coarse:hidden",
                )}
              >
                {actions}
              </span>
            ) : null}
          </span>
        ) : null}
      </SidebarStickyTier>
      {children == null ? null : ribbon ? (
        // Folds open and shut with bb's own easing, as Ribbon's groups did.
        // The heading's own bottom margin is the whole gap to the first row.
        <GroupBody open={collapseControl?.isCollapsed !== true}>
          {children}
        </GroupBody>
      ) : collapseControl?.isCollapsed ? null : (
        <div className="mt-1">{children}</div>
      )}
    </SidebarStickyGroup>
  );
}
