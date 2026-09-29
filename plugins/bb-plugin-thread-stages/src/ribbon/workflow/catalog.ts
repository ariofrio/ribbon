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
const strokedPath = (d: string): IconDataV1 => ({
  tag: "path",
  attrs: {
    d,
    stroke: "currentColor",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    strokeWidth: 1.5,
  },
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
const byStage = <T>(value: (stage: WorkflowStage) => T) =>
  Object.fromEntries(
    WORKFLOW_STAGES.map((stage) => [stage, value(stage)]),
  ) as Record<WorkflowStage, T>;

const STAGE_RINGS = byStage((stage) =>
  stage === "Deferred" ? dashedRing(`${DASH} ${GAP}`) : progressRing,
);
const STAGE_MARKS: Record<WorkflowStage, IconDataV1[]> = {
  Deferred: [],
  Active: [],
  // A slash along the same diagonal, and as long, as the third party's arrow.
  BlockedOnOtherAgent: [strokedPath("M9 15 15.5 8.5")],
  // Something coming back in from outside.
  BlockedOnThirdParty: [strokedPath("M15.5 8.5 9 15M9 10.25V15h4.75")],
  Completed: [
    {
      tag: "circle",
      attrs: { cx: 12, cy: 12, r: 5, fill: "currentColor" },
    },
  ],
};
/**
 * The ring a working thread's stage draws instead, open at the top right like
 * Lucide's LoaderCircle so that it reads as turning. Deferred keeps its dashes
 * and drops the one that falls in the opening.
 */
const workingArc: IconDataV1 = {
  tag: "path",
  attrs: {
    d: "M20.75 12a8.75 8.75 0 1 1-6.046-8.322",
    stroke: "currentColor",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    strokeWidth: RING_STROKE_WIDTH,
  },
};
const WORKING_RINGS = byStage((stage) =>
  stage === "Deferred"
    ? dashedRing(`${`${DASH} ${GAP} `.repeat(4)}${DASH} ${GAP + RING_SIXTH}`)
    : workingArc,
);

export const STAGE_ICONS = byStage((stage) =>
  stageIcon([STAGE_RINGS[stage], ...STAGE_MARKS[stage]]),
);
/** A working stage in two layers, so that only its ring turns. */
export const WORKING_STAGE_ICONS = byStage((stage) => ({
  ring: stageIcon([WORKING_RINGS[stage]]),
  marks: stageIcon(STAGE_MARKS[stage]),
}));

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
          ...(stage === "Completed" ? { defaultPlacement: "start" } : {}),
        })),
      },
    ],
  });
}
