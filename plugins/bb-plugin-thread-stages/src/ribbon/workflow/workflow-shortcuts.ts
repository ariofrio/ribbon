export type ReorderScope = "step" | "edge" | "stage";

export interface ReorderIntent {
  scope: ReorderScope;
  direction: -1 | 1;
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
      beforeThreadId:
        (scope === "edge" ? siblingIds[0] : siblingIds[index - 1]) ?? null,
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
