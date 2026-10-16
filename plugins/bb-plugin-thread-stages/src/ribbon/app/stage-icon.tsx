import { ProviderIcon } from "./provider-icon";
import { STAGE_ICONS } from "../workflow/catalog";
import { WORKFLOW_STAGE_LABELS, type WorkflowStage } from "../workflow/workflow-stage";

/** A row's stage icon, independent of runtime activity. */
export function StageIcon({ stage }: { stage: WorkflowStage }) {
  return (
    <ProviderIcon
      icon={STAGE_ICONS[stage]}
      label={`${WORKFLOW_STAGE_LABELS[stage]} stage`}
    />
  );
}
