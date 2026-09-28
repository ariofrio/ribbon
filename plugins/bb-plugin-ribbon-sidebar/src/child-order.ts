export interface ChildRank {
  parentThreadId: string;
  threadId: string;
}

/**
 * Children the user has never ordered enter at the top, newest first, like new
 * roots do; the rest keep the order they were given. A rank saved under a
 * former parent does not apply.
 */
export function orderChildren<
  T extends { id: string; parentThreadId: string | null; createdAt: number },
>(children: readonly T[], ranks: readonly ChildRank[]): T[] {
  const position = new Map<string, number>();
  for (const [index, rank] of ranks.entries()) {
    position.set(`${rank.parentThreadId}\n${rank.threadId}`, index);
  }
  const rankOf = (child: T) =>
    position.get(`${child.parentThreadId}\n${child.id}`);
  return [...children].sort((left, right) => {
    const leftRank = rankOf(left);
    const rightRank = rankOf(right);
    if (leftRank === undefined && rightRank === undefined) {
      return right.createdAt - left.createdAt || left.id.localeCompare(right.id);
    }
    if (leftRank === undefined) return -1;
    if (rightRank === undefined) return 1;
    return leftRank - rightRank;
  });
}

/** The sibling order after moving one child before another, or to the end. */
export function moveChild(
  siblingIds: readonly string[],
  threadId: string,
  beforeThreadId: string | null,
): string[] | null {
  if (!siblingIds.includes(threadId) || beforeThreadId === threadId) {
    return null;
  }
  const remaining = siblingIds.filter((id) => id !== threadId);
  const index =
    beforeThreadId === null ? remaining.length : remaining.indexOf(beforeThreadId);
  if (index < 0) return null;
  return [...remaining.slice(0, index), threadId, ...remaining.slice(index)];
}
