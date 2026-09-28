import { ProviderIcon, WorkingStageIcon } from "./provider-icon";
import { STAGE_ICONS, WORKING_STAGE_ICONS } from "../workflow/catalog";
import type { WorkflowStage } from "../workflow/workflow-stage";

/** A row's stage ring: turning while the thread works, still otherwise. */
export function StageIcon({
  stage,
  working,
}: {
  stage: WorkflowStage;
  working: boolean;
}) {
  return working ? (
    <WorkingStageIcon
      {...WORKING_STAGE_ICONS[stage]}
      label={`${stage} stage, working`}
      className="text-subtle-foreground/75"
    />
  ) : (
    <ProviderIcon
      icon={STAGE_ICONS[stage]}
      label={`${stage} stage`}
      className="text-subtle-foreground/75"
    />
  );
}
