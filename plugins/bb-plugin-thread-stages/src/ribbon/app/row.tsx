import {
  experimental_useSidebarThreadPullRequest,
  useSettings,
  type PluginSidebarThreadRowStatus,
} from "@get-bb/plugin-sdk/app";
import { useSetAtom } from "jotai";
import { useState, type CSSProperties } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import type { SidebarThread } from "../../app/model/sidebar-thread.js";
import type { ThreadListIndicatorState } from "../../app/model/thread-activity.js";
import { longTitlesSetting } from "../long-titles";
import { pullRequestSignal } from "../pull-request-status";
import type { ThreadAction } from "../thread-actions-store";
import type { WorkflowStage } from "../workflow/workflow-stage";
import { runRibbonThreadActionAtom } from "./atoms";
import { useRibbonThread } from "./data";
import { usePullRequestDetails } from "./pull-request-details-store";
import { ribbonThreadStatus } from "./status";
import { StageIcon } from "./stage-icon";
import type { ThreadStatus } from "./thread-status";
import { MarqueeText } from "./thread-title";
import { SHINE_ATTRIBUTE, ShineContent } from "./row-shine";
import { ThreadIndicator } from "./thread-indicator";

// bb's own pull request colors, plus amber for a PR that will merge on its
// own (GitHub's merge-queue color).
const PR_LIFECYCLE_ICONS = {
  open: { name: "GitPullRequestArrow", className: "text-success" },
  auto: { name: "GitMerge", className: "text-attention" },
  closed: { name: "GitPullRequestClosed", className: "text-destructive" },
  merged: { name: "GitMerge", className: "text-pr-merged" },
  draft: { name: "GitPullRequestDraft", className: "text-muted-foreground" },
} as const;

/** The settings that shape a row, with Ribbon's defaults until they load. */
export function useRibbonRowSettings() {
  const settings = useSettings();
  return {
    childThreadLines:
      settings.values?.childThreadLines === "Tree" ? ("Tree" as const) : ("Bar" as const),
    shimmerWorkingRows: settings.values?.shimmerWorkingRows !== false,
    tabularPullRequestDigits: settings.values?.tabularPullRequestDigits !== false,
    pullRequestMarks: settings.values?.pullRequestMarks !== false,
    longTitles: longTitlesSetting(settings.values?.longTitles),
  };
}

/**
 * What Ribbon adds to one row: its stage, the row status with the pull
 * request folded in, the PR number to draw beside the title, and the prompt
 * actions. Null without the Ribbon data provider, where the row is bb's own.
 */
export function useRibbonRow(
  thread: SidebarThread,
  indicatorState: ThreadListIndicatorState,
  pluginStatus: PluginSidebarThreadRowStatus | null,
): {
  stage: WorkflowStage;
  muted: boolean;
  status: ThreadStatus;
  /** The stage ring turns: an agent is at work and nothing waits on the user. */
  working: boolean;
  /** The row shimmers: as above, or a plugin reports the thread running. */
  shines: boolean;
  pullRequest: {
    node: React.ReactNode;
    position: "right";
    pending: boolean;
  } | null;
  actions: readonly ThreadAction[];
  runThreadAction(threadId: string, actionId: string): Promise<void>;
} | null {
  // The row's own slice of Ribbon's data, so a change elsewhere in the list
  // leaves this row alone.
  const ribbon = useRibbonThread(thread.id);
  const runThreadAction = useSetAtom(runRibbonThreadActionAtom);
  const { tabularPullRequestDigits, pullRequestMarks } = useRibbonRowSettings();
  const { isLoading: pullRequestLoading, pullRequest } =
    experimental_useSidebarThreadPullRequest(thread.id);
  const position = ribbon?.pullRequestNumberPosition ?? "right";
  const visiblePullRequest = position === "hidden" ? null : pullRequest;
  // GitHub's finer state is fetched only where the marks that show it are on.
  const { details, pending } = usePullRequestDetails(
    pullRequestMarks ? visiblePullRequest : null,
  );
  if (ribbon === null) return null;
  const signal = visiblePullRequest
    ? pullRequestSignal(visiblePullRequest, pullRequestMarks ? details : null)
    : null;
  const status = ribbonThreadStatus(
    indicatorState,
    pluginStatus,
    pullRequestMarks ? signal : null,
  );
  const stage = ribbon.stage;
  const lifecycle = signal ? PR_LIFECYCLE_ICONS[signal.lifecycle] : null;
  const record = ribbon.actions;
  const actions = thread.archivedAt === null ? (record?.actions ?? []) : [];
  return {
    stage,
    muted: stage !== "Active",
    status,
    working: status.spinsStageRing,
    shines: status.isWorking && status.indicator !== "waiting-for-input",
    pullRequest:
      visiblePullRequest && signal && lifecycle && position !== "hidden"
        ? {
            position,
            pending: pullRequestLoading || pending,
            node: (
              <span
                data-ribbon-pull-request=""
                // Set off from the title, or from the action buttons that
                // end where it begins.
                className={`inline-flex shrink-0 items-center gap-1 text-subtle-foreground/75 ml-2 ${
                  tabularPullRequestDigits ? "tabular-nums" : ""
                }`}
                title={
                  signal.label
                    ? `${visiblePullRequest.title} — ${signal.label}`
                    : visiblePullRequest.title
                }
              >
                <Icon
                  name={lifecycle.name}
                  className={`size-4 shrink-0 ${lifecycle.className}`}
                  aria-hidden
                />
                #{visiblePullRequest.number}
              </span>
            ),
          }
        : null,
    actions,
    runThreadAction,
  };
}

/** The ring beside a title: hidden at rest while Active and still, as Ribbon draws it. */
export function RibbonStageGlyph({
  stage,
  working,
  hiddenAtRest,
}: {
  stage: WorkflowStage;
  working: boolean;
  hiddenAtRest: boolean;
}) {
  return (
    <span
      // 8px to the title, as bb's top sidebar items keep between icon and label.
      className={`mr-2 flex shrink-0 self-center ${
        hiddenAtRest
          ? "opacity-0 group-hover/thread-row:opacity-100 group-has-[:focus-visible]/thread-row:opacity-100 pointer-coarse:opacity-100"
          : ""
      }`}
      data-ribbon-sidebar-icon-slot=""
      {...{ [SHINE_ATTRIBUTE]: "" }}
    >
      <ShineContent className="flex">
        <StageIcon stage={stage} working={working} />
      </ShineContent>
    </span>
  );
}

function actionButtonStyle(color: string | null): CSSProperties {
  const base = color ?? "oklch(0.5 0 0)";
  return {
    ["--ribbon-action-fill" as string]:
      `light-dark(oklch(from ${base} 0.95 0.025 h), oklch(from ${base} 0.28 0.035 h))`,
    ["--ribbon-action-ink" as string]:
      `light-dark(oklch(from ${base} 0.47 0.13 h), oklch(from ${base} 0.82 0.11 h))`,
    ["--ribbon-action-hover-ink" as string]:
      `light-dark(oklch(from ${base} 0.34 0.15 h), oklch(from ${base} 0.94 0.13 h))`,
    ["--ribbon-action-hover-fill" as string]:
      "color-mix(in srgb, var(--ribbon-action-hover-ink) 26%, var(--ribbon-action-fill))",
  };
}

/**
 * A row's prompt buttons, each sending its saved prompt to the thread. They
 * take the group's color where its icon has one, and gray otherwise.
 */
export function RibbonActionButtons({
  actions,
  color,
  rowTitle,
  onRun,
}: {
  actions: readonly ThreadAction[];
  color: string | null;
  rowTitle: string;
  onRun(actionId: string): Promise<void>;
}) {
  const [runningActionId, setRunningActionId] = useState<string | null>(null);
  const [measuredWidths, setMeasuredWidths] = useState<Record<string, number>>({});
  const gapPx = actions.length > 8 ? 0 : 4;
  const gap = gapPx === 0 ? "gap-0" : "gap-1";
  // The group asks for every label at full width plus its padding and the
  // gaps between, so the title beside it gives way before any label clips.
  const widths = actions.map(({ id, label }) => measuredWidths[`${id}\0${label}`]);
  const naturalWidth = widths.every((width) => width !== undefined)
    ? widths.reduce((total, width) => total + width, 0) +
      actions.length * 16 +
      Math.max(0, actions.length - 1) * gapPx
    : null;
  return (
    <span
      data-ribbon-thread-actions=""
      className={`pointer-events-none flex min-w-0 flex-[0_1_max-content] items-center ${gap}`}
      style={{ flexBasis: naturalWidth === null ? "max-content" : naturalWidth }}
    >
      {actions.map((action) => {
        const widthKey = `${action.id}\0${action.label}`;
        return (
          <Button
            key={action.id}
            type="button"
            size="sm"
            variant="ghost"
            aria-label={`${action.label} in ${rowTitle}`}
            disabled={runningActionId !== null}
            className="pointer-events-auto relative z-20 h-5 min-w-0 flex-[0_1_max-content] overflow-hidden rounded-md bg-[color:var(--ribbon-action-fill)] text-[11px] font-medium leading-none text-[color:var(--ribbon-action-ink)] ring-sidebar-ring hover:bg-[color:var(--ribbon-action-hover-fill)] hover:text-[color:var(--ribbon-action-hover-ink)] focus-visible:bg-[color:var(--ribbon-action-hover-fill)] focus-visible:text-[color:var(--ribbon-action-hover-ink)] focus-visible:ring-2 active:bg-[color:var(--ribbon-action-hover-fill)]"
            style={{
              ...actionButtonStyle(color),
              flexBasis:
                measuredWidths[widthKey] === undefined
                  ? "max-content"
                  : measuredWidths[widthKey] + 16,
              paddingInline: `min(8px, ${20 / actions.length}%)`,
            }}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setRunningActionId(action.id);
              void onRun(action.id).finally(() => setRunningActionId(null));
            }}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <MarqueeText
              text={action.label}
              onMeasure={(width) => {
                setMeasuredWidths((current) =>
                  current[widthKey] === width ? current : { ...current, [widthKey]: width },
                );
              }}
            />
          </Button>
        );
      })}
    </span>
  );
}

/** The trailing indicator Ribbon draws: bb's, with pull request marks folded in. */
export function RibbonTrailingIndicator({
  status,
  hideIdleDraftLabel,
  shine,
}: {
  status: ThreadStatus;
  hideIdleDraftLabel: boolean;
  shine: boolean;
}) {
  if (
    status.indicator === "none" &&
    status.pluginStatus === null &&
    status.pullRequestMark === null
  ) {
    return null;
  }
  return (
    <span
      data-sidebar-thread-trailing-indicator=""
      className="inline-flex size-4 items-center justify-center text-subtle-foreground"
      {...{ [SHINE_ATTRIBUTE]: "" }}
    >
      <ShineContent className="inline-flex items-center justify-center">
        <ThreadIndicator
          indicator={status.indicator}
          label={status.indicatorLabel}
          pluginStatus={status.pluginStatus}
          pullRequestMark={status.pullRequestMark}
          hideIdleDraftLabel={hideIdleDraftLabel}
          shine={shine}
        />
      </ShineContent>
    </span>
  );
}
