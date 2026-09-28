export const WORKFLOW_STAGES = [
  "Deferred",
  "Active",
  "BlockedOnOtherAgent",
  "BlockedOnThirdParty",
  "Completed",
] as const;

export type WorkflowStage = (typeof WORKFLOW_STAGES)[number];

export const WORKFLOW_STAGE_LABELS: Record<WorkflowStage, string> = {
  Deferred: "Deferred",
  Active: "Active",
  BlockedOnOtherAgent: "Blocked on other agent",
  BlockedOnThirdParty: "Blocked on third party",
  Completed: "Completed",
};

export function isBlockedStage(stage: string | undefined): boolean {
  return stage === "BlockedOnOtherAgent" || stage === "BlockedOnThirdParty";
}

export interface WorkflowStageVisibilitySettings {
  showDeferredStage?: boolean | string;
  showBlockedStage?: boolean | string;
}

export function enabledWorkflowStages(
  settings: WorkflowStageVisibilitySettings | undefined,
): readonly WorkflowStage[] {
  return WORKFLOW_STAGES.filter((stage) => {
    if (stage === "Deferred") return settings?.showDeferredStage !== false;
    if (isBlockedStage(stage)) return settings?.showBlockedStage !== false;
    return true;
  });
}

export interface ThreadAssignment {
  threadId: string;
  workflowStage: WorkflowStage;
  sortKey: string;
  updatedAt: number;
}

export interface SidebarThreadLike {
  id: string;
  parentThreadId?: string | null;
  updatedAt: number;
}

export const DEFAULT_WORKFLOW_STAGE: WorkflowStage = "Active";

function stageKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const STAGE_BY_KEY = new Map<string, WorkflowStage>(
  WORKFLOW_STAGES.flatMap((stage) => {
    const entries: Array<[string, WorkflowStage]> = [[stageKey(stage), stage]];
    if (stage === "Deferred") entries.push(["backlog", stage]);
    // Idle and Blocked are earlier names that saved data and old messages use.
    if (stage === "Active") entries.push(["idle", stage], ["todo", stage]);
    if (stage === "BlockedOnThirdParty") {
      entries.push(["blocked", stage], ["waiting", stage]);
    }
    if (stage === "Completed") {
      entries.push(["done", stage], ["canceled", stage], ["cancelled", stage]);
    }
    return entries;
  }),
);

export function parseWorkflowStage(value: string): WorkflowStage | null {
  return STAGE_BY_KEY.get(stageKey(value)) ?? null;
}
