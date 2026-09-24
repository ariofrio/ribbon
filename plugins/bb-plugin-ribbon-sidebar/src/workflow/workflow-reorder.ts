import {
  buildPinnedThreadState,
  sortExplicitPinnedThreadIds,
} from "./pinned-threads";
import { rootThreadIdByThreadId } from "./root-thread-ownership";
import {
  effectiveHierarchyParentId,
  flattenThreadHierarchy,
} from "./thread-hierarchy";
import { reorderTargetId, type ReorderIntent } from "./workflow-shortcuts";
import {
  WORKFLOW_STAGES,
  destinationOrder,
  type ThreadAssignment,
  type WorkflowStage,
} from "./workflow-stage";

/** The thread fields the sidebar's grouping and pinning rules depend on. */
export interface ReorderThreadLike {
  id: string;
  parentThreadId: string | null;
  visibility: "visible" | "hidden";
  archivedAt: number | null;
  pinnedAt: number | null;
  pinSortKey: string | null;
  createdAt: number;
}

export type WorkflowReorder =
  | { kind: "none" }
  | { kind: "stage"; workflowStage: WorkflowStage }
  | {
      kind: "order";
      workflowStage: WorkflowStage;
      previousThreadId: string | null;
      nextThreadId: string | null;
    }
  | {
      kind: "pinned";
      previousThreadId: string | null;
      nextThreadId: string | null;
    };

export interface ResolveWorkflowReorderInput {
  threads: readonly ReorderThreadLike[];
  assignments: readonly ThreadAssignment[];
  threadId: string;
  workflowStage: WorkflowStage;
  enabledStages?: readonly WorkflowStage[];
  intent: ReorderIntent;
}

/** The threads the sidebar lists at all. */
export function listedThreads(
  threads: readonly ReorderThreadLike[],
): readonly ReorderThreadLike[] {
  return threads.filter(
    (thread) => thread.visibility === "visible" && thread.archivedAt === null,
  );
}

/** Threads the sidebar renders in its pinned section instead of a stage. */
export function pinnedThreadIds(
  listed: readonly ReorderThreadLike[],
): ReadonlySet<string> {
  return buildPinnedThreadState(
    listed.map((thread) => ({
      id: thread.id,
      isPinned: thread.pinnedAt !== null,
      parentThreadId: thread.parentThreadId,
    })),
    sortExplicitPinnedThreadIds(listed),
  ).effectivePinnedThreadIds;
}

function neighbors(
  orderedIds: readonly string[],
  threadId: string,
  beforeThreadId: string | null,
): { previousThreadId: string | null; nextThreadId: string | null } {
  const order = destinationOrder(orderedIds, threadId, beforeThreadId);
  const index = order.indexOf(threadId);
  return {
    previousThreadId: order[index - 1] ?? null,
    nextThreadId: order[index + 1] ?? null,
  };
}

/**
 * Works out how a reorder chord should move a root thread, in the same terms
 * the sidebar uses: the stored order of a stage, minus hidden threads, with
 * siblings taken at the root thread's own hierarchy depth.
 */
export function resolveWorkflowReorder({
  threads,
  assignments,
  threadId,
  workflowStage,
  enabledStages = WORKFLOW_STAGES,
  intent,
}: ResolveWorkflowReorderInput): WorkflowReorder {
  const listed = listedThreads(threads);
  const roots = rootThreadIdByThreadId(listed);
  if (roots.get(threadId) !== threadId) return { kind: "none" };

  if (intent.scope === "stage") {
    const currentIndex = enabledStages.indexOf(workflowStage);
    const nextStage =
      currentIndex === -1
        ? enabledStages
            .filter((stage) =>
              intent.direction === -1
                ? WORKFLOW_STAGES.indexOf(stage) <
                  WORKFLOW_STAGES.indexOf(workflowStage)
                : WORKFLOW_STAGES.indexOf(stage) >
                  WORKFLOW_STAGES.indexOf(workflowStage),
            )
            .at(intent.direction === -1 ? -1 : 0)
        : enabledStages[currentIndex + intent.direction];
    return nextStage === undefined
      ? { kind: "none" }
      : { kind: "stage", workflowStage: nextStage };
  }

  const pinnedState = buildPinnedThreadState(
    listed.map((thread) => ({
      id: thread.id,
      isPinned: thread.pinnedAt !== null,
      parentThreadId: thread.parentThreadId,
    })),
    sortExplicitPinnedThreadIds(listed),
  );

  if (pinnedState.effectivePinnedThreadIds.has(threadId)) {
    const pinnedRootIds = flattenThreadHierarchy(
      pinnedState.pinnedThreads,
      new Set<string>(),
    )
      .filter(({ depth }) => depth === 0)
      .map(({ thread }) => thread.id);
    const target = reorderTargetId(
      pinnedRootIds,
      pinnedRootIds,
      threadId,
      intent.scope,
      intent.direction,
    );
    if (target === null) return { kind: "none" };
    return {
      kind: "pinned",
      ...neighbors(pinnedRootIds, threadId, target.beforeThreadId),
    };
  }

  const threadById = new Map(listed.map((thread) => [thread.id, thread]));
  const orderedIds = assignments
    .filter((item) => band(item.workflowStage) === band(workflowStage))
    .map((item) => item.threadId)
    .filter(
      (id) =>
        roots.get(id) === id && !pinnedState.effectivePinnedThreadIds.has(id),
    );
  const idsInStage = new Set(orderedIds);
  const parentIdOf = (id: string): string | null => {
    const thread = threadById.get(id);
    return thread === undefined
      ? null
      : effectiveHierarchyParentId(thread, idsInStage);
  };
  const parentId = parentIdOf(threadId);
  const target = reorderTargetId(
    orderedIds,
    orderedIds.filter((id) => parentIdOf(id) === parentId),
    threadId,
    intent.scope,
    intent.direction,
  );
  if (target === null) return { kind: "none" };
  return {
    kind: "order",
    workflowStage,
    ...neighbors(orderedIds, threadId, target.beforeThreadId),
  };
}

function band(stage: WorkflowStage) {
  return stage === "Deferred" || stage === "Completed" ? stage : "main";
}
