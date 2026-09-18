import { WORKFLOW_STAGES, type WorkflowStage } from "./workflow-stage";

export interface ShortcutKeyEvent {
  altKey: boolean;
  code: string;
  ctrlKey: boolean;
  key: string;
  metaKey: boolean;
  repeat: boolean;
  shiftKey: boolean;
}

interface StageChord {
  altKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  stage: WorkflowStage;
}

// Active is omitted because automatic stage handling assigns it.
const STAGE_CHORDS: readonly StageChord[] = [
  { altKey: false, ctrlKey: false, shiftKey: false, stage: "Completed" },
  { altKey: false, ctrlKey: false, shiftKey: true, stage: "Idle" },
  { altKey: false, ctrlKey: true, shiftKey: true, stage: "Blocked" },
  { altKey: false, ctrlKey: true, shiftKey: false, stage: "Deferred" },
  { altKey: true, ctrlKey: false, shiftKey: false, stage: "Completed" },
];

export function workflowStageShortcut(
  event: ShortcutKeyEvent,
  enabledStages: readonly WorkflowStage[] = WORKFLOW_STAGES,
): WorkflowStage | null {
  if (!event.metaKey || event.repeat || event.code !== "Period") return null;
  const stage =
    STAGE_CHORDS.find(
      (chord) =>
        chord.altKey === event.altKey &&
        chord.ctrlKey === event.ctrlKey &&
        chord.shiftKey === event.shiftKey,
    )?.stage ?? null;
  return stage !== null && enabledStages.includes(stage) ? stage : null;
}

export type ReorderScope = "step" | "edge" | "stage";

export interface ReorderIntent {
  scope: ReorderScope;
  direction: -1 | 1;
}

export function workflowReorderShortcut(
  event: ShortcutKeyEvent,
): ReorderIntent | null {
  if (!event.metaKey || event.repeat) return null;
  const direction =
    event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : null;
  if (direction === null) return null;
  if (event.altKey && !event.ctrlKey) {
    return { scope: event.shiftKey ? "edge" : "step", direction };
  }
  if (event.ctrlKey && !event.altKey && !event.shiftKey) {
    return { scope: "stage", direction };
  }
  return null;
}

/**
 * Resolves the thread a move should insert it before, in the same terms
 * the drag handlers use: `null` places the thread last, and a `null` result
 * leaves it where it is. `orderedIds` is the whole stage in stored order;
 * `siblingIds` is the subset rendered at the thread's own depth.
 */
export function reorderTargetId(
  orderedIds: readonly string[],
  siblingIds: readonly string[],
  threadId: string,
  scope: "step" | "edge",
  direction: -1 | 1,
): { beforeThreadId: string | null } | null {
  const index = siblingIds.indexOf(threadId);
  if (index === -1) return null;

  if (direction === -1) {
    if (index === 0) return null;
    return {
      beforeThreadId: (scope === "edge" ? siblingIds[0] : siblingIds[index - 1]) ?? null,
    };
  }

  if (index === siblingIds.length - 1) return null;
  const anchorIndex = scope === "edge" ? siblingIds.length - 1 : index + 1;
  const nextSibling = siblingIds[anchorIndex + 1];
  if (nextSibling !== undefined) return { beforeThreadId: nextSibling };
  const anchorId = siblingIds[anchorIndex];
  const anchorPosition =
    anchorId === undefined ? -1 : orderedIds.indexOf(anchorId);
  return {
    beforeThreadId:
      anchorPosition === -1 ? null : (orderedIds[anchorPosition + 1] ?? null),
  };
}
