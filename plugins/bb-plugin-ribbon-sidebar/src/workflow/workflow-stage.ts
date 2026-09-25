import { rootThreadIdByThreadId } from "./root-thread-ownership";

export const WORKFLOW_STAGES = [
  "Deferred",
  "Idle",
  "Active",
  "Blocked",
  "Completed",
] as const;

export type WorkflowStage = (typeof WORKFLOW_STAGES)[number];

export interface WorkflowStageVisibilitySettings {
  showDeferredStage?: boolean | string;
  showBlockedStage?: boolean | string;
}

export function enabledWorkflowStages(
  settings: WorkflowStageVisibilitySettings | undefined,
): readonly WorkflowStage[] {
  return WORKFLOW_STAGES.filter((stage) => {
    if (stage === "Deferred") return settings?.showDeferredStage !== false;
    if (stage === "Blocked") return settings?.showBlockedStage !== false;
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

export const DEFAULT_WORKFLOW_STAGE: WorkflowStage = "Idle";

function stageKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const STAGE_BY_KEY = new Map<string, WorkflowStage>(
  WORKFLOW_STAGES.flatMap((stage) => {
    const entries: Array<[string, WorkflowStage]> = [[stageKey(stage), stage]];
    if (stage === "Deferred") entries.push(["backlog", stage]);
    if (stage === "Idle") entries.push(["todo", stage]);
    if (stage === "Active") entries.push(["working", stage]);
    if (stage === "Blocked") entries.push(["waiting", stage]);
    if (stage === "Completed") {
      entries.push(["done", stage], ["canceled", stage], ["cancelled", stage]);
    }
    return entries;
  }),
);

export function parseWorkflowStage(value: string): WorkflowStage | null {
  return STAGE_BY_KEY.get(stageKey(value)) ?? null;
}

export function groupThreadsByStage<Thread extends SidebarThreadLike>(
  threads: readonly Thread[],
  assignments: readonly ThreadAssignment[],
): Record<WorkflowStage, Thread[]> {
  const assignmentByThread = new Map(
    assignments.map((assignment) => [assignment.threadId, assignment]),
  );
  const sourceIndex = new Map(
    threads.map((thread, index) => [thread.id, index]),
  );
  const roots = rootThreadIdByThreadId(
    threads.map((thread) => ({
      id: thread.id,
      parentThreadId: thread.parentThreadId ?? null,
    })),
  );
  const groups: Record<WorkflowStage, Thread[]> = {
    Deferred: [],
    Idle: [],
    Active: [],
    Blocked: [],
    Completed: [],
  };

  for (const thread of threads) {
    const rootId = roots.get(thread.id);
    const workflowStage =
      parseWorkflowStage(
        rootId === null || rootId === undefined
          ? ""
          : (assignmentByThread.get(rootId)?.workflowStage ?? ""),
      ) ?? DEFAULT_WORKFLOW_STAGE;
    groups[workflowStage].push(thread);
  }

  for (const stage of WORKFLOW_STAGES) {
    groups[stage].sort((left, right) => {
      const leftRootId = roots.get(left.id);
      const rightRootId = roots.get(right.id);
      if (leftRootId === rightRootId) {
        return (
          (sourceIndex.get(left.id) ?? 0) - (sourceIndex.get(right.id) ?? 0)
        );
      }
      const leftAssignment =
        leftRootId === null || leftRootId === undefined
          ? undefined
          : assignmentByThread.get(leftRootId);
      const rightAssignment =
        rightRootId === null || rightRootId === undefined
          ? undefined
          : assignmentByThread.get(rightRootId);
      if (leftAssignment && rightAssignment) {
        if (leftAssignment.sortKey < rightAssignment.sortKey) return -1;
        if (leftAssignment.sortKey > rightAssignment.sortKey) return 1;
        return (leftRootId ?? left.id).localeCompare(rightRootId ?? right.id);
      }
      if (leftAssignment) return -1;
      if (rightAssignment) return 1;
      return (sourceIndex.get(left.id) ?? 0) - (sourceIndex.get(right.id) ?? 0);
    });
  }

  return groups;
}

export function destinationOrder(
  currentThreadIds: readonly string[],
  movingThreadId: string,
  beforeThreadId: string | null,
): string[] {
  if (beforeThreadId === movingThreadId) return [...currentThreadIds];
  const withoutMoving = currentThreadIds.filter((id) => id !== movingThreadId);
  const insertionIndex =
    beforeThreadId === null ? -1 : withoutMoving.indexOf(beforeThreadId);
  const next = [...withoutMoving];
  next.splice(
    insertionIndex < 0 ? next.length : insertionIndex,
    0,
    movingThreadId,
  );
  return next;
}
