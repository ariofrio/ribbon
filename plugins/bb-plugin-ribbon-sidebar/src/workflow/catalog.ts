import { groupingCatalogSchema, type IconDataV1 } from "../contracts";
import { WORKFLOW_STAGES, type WorkflowStage } from "./workflow-stage";
export const THREAD_STAGES_GROUPING_KEY =
  "plugin:thread-stages:stages" as const;
const progressRing: IconDataV1 = {
  tag: "circle",
  attrs: {
    cx: 12,
    cy: 12,
    r: 10,
    stroke: "currentColor",
    strokeWidth: 1.5,
  },
};
const stageIcon = (children: IconDataV1[]): IconDataV1 => ({
  tag: "svg",
  attrs: { viewBox: "0 0 24 24", fill: "none" },
  children,
});
const dashedPath = (d: string): IconDataV1 => ({
  tag: "path",
  attrs: {
    d,
    stroke: "currentColor",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    strokeWidth: 1.5,
  },
});

export const STAGE_ICONS: Record<WorkflowStage, IconDataV1> = {
  Deferred: stageIcon([
    dashedPath(
      "M9.50293 21.6846C10.302 21.8902 11.1397 21.9996 12.0029 21.9996C12.8662 21.9996 13.7039 21.8902 14.5029 21.6846",
    ),
    dashedPath(
      "M14.5029 2.31504C13.7039 2.10938 12.8662 2 12.0029 2C11.1397 2 10.302 2.10938 9.50293 2.31504",
    ),
    dashedPath(
      "M2.37109 14.6777C2.59251 15.4726 2.91663 16.2527 3.34826 17.0003C3.77988 17.7479 4.29346 18.4187 4.87109 19.0079",
    ),
    dashedPath(
      "M21.6451 9.32261C21.4237 8.52778 21.0996 7.74762 20.668 7.00002C20.2363 6.25243 19.7228 5.58165 19.1451 4.99248",
    ),
    dashedPath(
      "M21.6436 14.6777C21.4221 15.4726 21.098 16.2527 20.6664 17.0003C20.2348 17.7479 19.7212 18.4187 19.1436 19.0079",
    ),
    dashedPath(
      "M2.36952 9.32261C2.59093 8.52778 2.91506 7.74762 3.34668 7.00002C3.7783 6.25243 4.29188 5.58165 4.86952 4.99248",
    ),
  ]),
  Idle: stageIcon([progressRing]),
  Active: stageIcon([
    progressRing,
    {
      tag: "path",
      attrs: {
        d: "M19.5 12C19.5 11.0151 19.306 10.0398 18.9291 9.12987C18.5522 8.21993 17.9997 7.39314 17.3033 6.6967C16.6069 6.00026 15.7801 5.44781 14.8701 5.0709C13.9602 4.69399 12.9849 4.5 12 4.5L12 12H19.5Z",
        fill: "currentColor",
      },
    },
  ]),
  Blocked: stageIcon([
    progressRing,
    {
      tag: "path",
      attrs: {
        d: "M12 4.5A7.5 7.5 0 0 1 12 19.5Z",
        fill: "currentColor",
        transform: "rotate(-45 12 12)",
      },
    },
  ]),
  Completed: stageIcon([
    progressRing,
    {
      tag: "circle",
      attrs: { cx: 12, cy: 12, r: 7.5, fill: "currentColor" },
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
