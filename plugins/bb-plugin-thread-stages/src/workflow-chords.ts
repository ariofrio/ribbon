import {
  listedThreads,
  pinnedThreadIds,
  type ReorderThreadLike,
} from "./workflow-reorder";
import { partitionWorkflowThreads } from "./root-thread-ownership";
import type { ThreadAssignment, WorkflowStage } from "./workflow-stage";

/** Where the client should go once the chord has been applied. */
export type ChordDestination =
  | { kind: "stay" }
  | { kind: "thread"; threadId: string }
  | { kind: "compose" };

export interface UndoCandidate {
  threadId: string;
  previousStage: WorkflowStage | null;
  previousSortKey: string | null;
  updatedAt: number;
}

export type StageChord =
  | { kind: "none" }
  | { kind: "file"; workflowStage: WorkflowStage; next: ChordDestination }
  | {
      kind: "restore";
      threadId: string;
      sortKey: string | null;
      next: ChordDestination;
    };

export interface ResolveStageChordInput {
  threadId: string;
  workflowStage: WorkflowStage;
  threads: readonly ReorderThreadLike[];
  assignments: readonly ThreadAssignment[];
  /** Newest first, already filtered to moves the user made in the app. */
  undoCandidates: readonly UndoCandidate[];
}

/**
 * Decides what a `.` chord does: file the open thread and move on to the next
 * one, bring the open thread back to Idle, or — when it is already Idle —
 * undo the user's most recent filing.
 */
export function resolveStageChord({
  threadId,
  workflowStage,
  threads,
  assignments,
  undoCandidates,
}: ResolveStageChordInput): StageChord {
  const listed = listedThreads(threads);
  const rootThreads = partitionWorkflowThreads(listed).rootThreads;
  if (!rootThreads.some((thread) => thread.id === threadId)) {
    return { kind: "none" };
  }
  const openStage = assignments.find(
    (assignment) => assignment.threadId === threadId,
  )?.workflowStage;

  if (workflowStage === "Idle") {
    if (openStage !== "Idle") {
      return { kind: "file", workflowStage, next: { kind: "stay" } };
    }
    const candidate = undoCandidates.find((item) =>
      rootThreads.some((thread) => thread.id === item.threadId),
    );
    if (candidate === undefined) return { kind: "none" };
    return {
      kind: "restore",
      threadId: candidate.threadId,
      sortKey:
        candidate.previousStage === "Idle" ? candidate.previousSortKey : null,
      next: { kind: "thread", threadId: candidate.threadId },
    };
  }

  // Walk the Idle section the way the sidebar renders it, so "the row below"
  // means the row below on screen.
  const threadById = new Map(rootThreads.map((thread) => [thread.id, thread]));
  const pinned = pinnedThreadIds(listed);
  const toDo = assignments
    .filter(
      (assignment) =>
        assignment.workflowStage === "Idle" &&
        threadById.has(assignment.threadId) &&
        !pinned.has(assignment.threadId),
    )
    .flatMap((assignment) => threadById.get(assignment.threadId) ?? []);
  const rows = toDo.map((thread) => thread.id);

  const index = rows.indexOf(threadId);
  const nextThreadId =
    index === -1
      ? rows[0]
      : // Filing the last row leaves the one above it as the new last.
        (rows[index + 1] ?? rows[index - 1]);

  return {
    kind: "file",
    workflowStage,
    next:
      nextThreadId === undefined
        ? { kind: "compose" }
        : { kind: "thread", threadId: nextThreadId },
  };
}
