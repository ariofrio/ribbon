import CheckIcon from "@hugeicons/core-free-icons/CheckIcon";
import HourglassIcon from "@hugeicons/core-free-icons/HourglassIcon";
import UserMultiple02Icon from "@hugeicons/core-free-icons/UserMultiple02Icon";
import { groupingCatalogSchema, type IconDataV1 } from "../contracts";
import {
  WORKFLOW_STAGES,
  WORKFLOW_STAGE_LABELS,
  isBlockedStage,
  type WorkflowStage,
} from "./workflow-stage";
export const THREAD_STAGES_GROUPING_KEY =
  "plugin:thread-stages:stages" as const;
const RING_RADIUS = 8.75;
const RING_STROKE_WIDTH = 2;
const progressRing: IconDataV1 = {
  tag: "circle",
  attrs: {
    cx: 12,
    cy: 12,
    r: RING_RADIUS,
    stroke: "currentColor",
    strokeWidth: RING_STROKE_WIDTH,
  },
};
const stageIcon = (children: IconDataV1[]): IconDataV1 => ({
  tag: "svg",
  attrs: { viewBox: "0 0 24 24", fill: "none" },
  children,
});
// Six dashes around the ring, one centred every 60 degrees from 30.
const RING_SIXTH = (2 * Math.PI * RING_RADIUS) / 6;
const DASH = 4;
const GAP = RING_SIXTH - DASH;
const dashedRing = (dashArray: string): IconDataV1 => ({
  tag: "circle",
  attrs: {
    ...progressRing.attrs,
    strokeLinecap: "round",
    strokeDasharray: dashArray,
    strokeDashoffset: DASH / 2 - RING_SIXTH / 2,
  },
});
/** Fit the glyph's stroked bounds to main's 13px rings, retaining their stroke. */
const fittedIcon = (paths: typeof HourglassIcon, extent: number): IconDataV1 => {
  const scale = (RING_RADIUS * 2) / extent;
  return stageIcon([{
    tag: "g",
    attrs: { transform: `translate(12 12) scale(${scale}) translate(-12 -12)` },
    children: paths.map(([tag, { key: _key, ...attrs }]) => ({
      tag: tag as IconDataV1["tag"],
      attrs: { ...attrs, strokeWidth: RING_STROKE_WIDTH / scale },
    })),
  }]);
};

// Unread markers keep bb's 7px dot diameter. The hollow version uses the
// same 2-unit stroke as the full-size stage glyphs.
const unreadMarker = (filled: boolean): IconDataV1 => stageIcon([{
  tag: "circle",
  attrs: filled
    ? { cx: 12, cy: 12, r: 5.25, fill: "currentColor" }
    : { cx: 12, cy: 12, r: 4.25, stroke: "currentColor", strokeWidth: RING_STROKE_WIDTH },
}]);

export const STAGE_ICONS: Record<WorkflowStage, IconDataV1> = {
  Deferred: stageIcon([dashedRing(`${DASH} ${GAP}`)]),
  Active: unreadMarker(false),
  BlockedOnUser: unreadMarker(true),
  BlockedOnOtherAgent: fittedIcon(HourglassIcon, 18),
  BlockedOnThirdParty: fittedIcon(UserMultiple02Icon, 20),
  Completed: fittedIcon(CheckIcon, 14),
};

export function createGroupingCatalog(settings: {
  showDeferredStage?: boolean | string;
  showBlockedStage?: boolean | string;
}) {
  const optionalStageEnabled = (stage: WorkflowStage) =>
    stage === "Deferred"
      ? settings.showDeferredStage !== false
      : isBlockedStage(stage)
        ? settings.showBlockedStage !== false
        : true;
  return groupingCatalogSchema.parse({
    protocolVersion: 1,
    groupings: [
      {
        id: "stages",
        singularLabel: "Stage",
        pluralLabel: "Stages",
        icon: STAGE_ICONS.Completed,
        defaultGroupId: "Active",
        groups: WORKFLOW_STAGES.map((stage) => ({
          id: stage,
          label: WORKFLOW_STAGE_LABELS[stage],
          icon: STAGE_ICONS[stage],
          visibleWhenEmpty: optionalStageEnabled(stage),
          acceptsAssignments: optionalStageEnabled(stage),
          defaultCollapsed: stage === "Deferred" || stage === "Completed",
          defaultPlacement: "start",
        })),
      },
    ],
  });
}
