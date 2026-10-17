import CheckIcon from "@hugeicons/core-free-icons/CheckIcon";
import PauseIcon from "@hugeicons/core-free-icons/PauseIcon";
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
const stageIcon = (children: IconDataV1[]): IconDataV1 => ({
  tag: "svg",
  attrs: { viewBox: "0 0 24 24", fill: "none" },
  children,
});
/** Preserve Hugeicons' paths and strokes when serializing the shared catalog. */
const hugeicon = (paths: typeof HourglassIcon): IconDataV1 => stageIcon(
  paths.map(([tag, { key: _key, ...attrs }]) => ({
    tag: tag as IconDataV1["tag"],
    attrs,
  })),
);

// Unread markers keep bb's 7px dot diameter. The hollow version uses the
// same 1.5-unit stroke as the full-size stage glyphs.
const unreadMarker = (filled: boolean): IconDataV1 => stageIcon([{
  tag: "circle",
  attrs: filled
    ? { cx: 12, cy: 12, r: 5.25, fill: "currentColor" }
    : { cx: 12, cy: 12, r: 4.5, stroke: "currentColor", strokeWidth: 1.5 },
}]);

export const STAGE_ICONS: Record<WorkflowStage, IconDataV1> = {
  Deferred: hugeicon(PauseIcon),
  Active: unreadMarker(false),
  BlockedOnUser: unreadMarker(true),
  BlockedOnOtherAgent: hugeicon(HourglassIcon),
  BlockedOnThirdParty: hugeicon(UserMultiple02Icon),
  Completed: hugeicon(CheckIcon),
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
