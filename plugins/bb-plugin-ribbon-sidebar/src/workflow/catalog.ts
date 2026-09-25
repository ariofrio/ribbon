import { groupingCatalogSchema, type IconDataV1 } from "../contracts";
import { WORKFLOW_STAGES, type WorkflowStage } from "./workflow-stage";
export const THREAD_STAGES_GROUPING_KEY =
  "plugin:thread-stages:stages" as const;
const progressRing: IconDataV1 = {
  tag: "circle",
  attrs: {
    cx: 12,
    cy: 12,
    r: 7.5,
    stroke: "currentColor",
    strokeWidth: 1.5,
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
const RING_SIXTH = (2 * Math.PI * 7.5) / 6;

export const STAGE_ICONS: Record<WorkflowStage, IconDataV1> = {
  Deferred: stageIcon([
    {
      tag: "circle",
      attrs: {
        ...progressRing.attrs,
        strokeLinecap: "round",
        strokeDasharray: `3.75 ${RING_SIXTH - 3.75}`,
        strokeDashoffset: 1.875 - RING_SIXTH / 2,
      },
    },
  ]),
  Idle: stageIcon([progressRing]),
  // Lucide's LoaderCircle, drawn on the same ring; rows spin it.
  Active: stageIcon([strokedPath("M19.5 12a7.5 7.5 0 1 1-5.183-7.133")]),
  // Lucide's Ban, drawn on the same ring.
  Blocked: stageIcon([
    progressRing,
    strokedPath("M6.697 6.697 17.303 17.303"),
  ]),
  Completed: stageIcon([
    progressRing,
    {
      tag: "circle",
      attrs: { cx: 12, cy: 12, r: 4.5, fill: "currentColor" },
    },
  ]),
};

export function createGroupingCatalog(settings: {
  showDeferredStage?: boolean | string;
  showBlockedStage?: boolean | string;
}) {
  const optionalStageEnabled = (stage: WorkflowStage) =>
    stage === "Deferred"
      ? settings.showDeferredStage !== false
      : stage === "Blocked"
        ? settings.showBlockedStage !== false
        : true;
  return groupingCatalogSchema.parse({
    protocolVersion: 1,
    groupings: [
      {
        id: "stages",
        singularLabel: "Stage",
        pluralLabel: "Stages",
        icon: STAGE_ICONS.Active,
        defaultGroupId: "Idle",
        groups: WORKFLOW_STAGES.map((stage) => ({
          id: stage,
          label: stage,
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
