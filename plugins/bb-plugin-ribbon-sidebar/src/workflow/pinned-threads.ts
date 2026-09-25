export interface PinnedThreadLike {
  id: string;
  isPinned: boolean;
  parentThreadId: string | null;
}

export interface PinnedThreadState<Thread extends PinnedThreadLike> {
  effectivePinnedThreadIds: ReadonlySet<string>;
  pinnedThreads: readonly Thread[];
}

export interface PinnedOrderThreadLike {
  id: string;
  pinnedAt: number | null;
  pinSortKey: string | null;
  createdAt: number;
}

function compareCodepoint(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

export function sortExplicitPinnedThreadIds(
  threads: readonly PinnedOrderThreadLike[],
): string[] {
  return threads
    .filter((item) => item.pinnedAt !== null)
    .sort((left, right) => {
      if (left.pinSortKey !== null && right.pinSortKey !== null) {
        const pinSortKeyDelta = compareCodepoint(
          left.pinSortKey,
          right.pinSortKey,
        );
        if (pinSortKeyDelta !== 0) return pinSortKeyDelta;
      }
      const pinnedAtDelta = (right.pinnedAt ?? 0) - (left.pinnedAt ?? 0);
      if (pinnedAtDelta !== 0) return pinnedAtDelta;
      const createdAtDelta = right.createdAt - left.createdAt;
      if (createdAtDelta !== 0) return createdAtDelta;
      return compareCodepoint(left.id, right.id);
    })
    .map((item) => item.id);
}

export function buildPinnedThreadState<Thread extends PinnedThreadLike>(
  threads: readonly Thread[],
  pinnedThreadIds: readonly string[],
): PinnedThreadState<Thread> {
  const byId = new Map(threads.map((item) => [item.id, item] as const));
  const childrenByParentId = new Map<string, Thread[]>();
  const explicitlyPinnedIds = new Set(
    threads
      .filter((item) => item.isPinned && item.parentThreadId === null)
      .map((item) => item.id),
  );

  for (const item of threads) {
    if (item.parentThreadId === null || item.parentThreadId === item.id)
      continue;
    const children = childrenByParentId.get(item.parentThreadId) ?? [];
    children.push(item);
    childrenByParentId.set(item.parentThreadId, children);
  }

  const effectivePinnedThreadIds = new Set(explicitlyPinnedIds);
  function includeDescendants(
    threadId: string,
    path: ReadonlySet<string>,
  ): void {
    if (path.has(threadId)) return;
    const nextPath = new Set(path);
    nextPath.add(threadId);
    for (const child of childrenByParentId.get(threadId) ?? []) {
      effectivePinnedThreadIds.add(child.id);
      includeDescendants(child.id, nextPath);
    }
  }
  for (const threadId of explicitlyPinnedIds) {
    includeDescendants(threadId, new Set());
  }

  const orderedExplicitIds: string[] = [];
  const orderedExplicitIdSet = new Set<string>();
  for (const threadId of pinnedThreadIds) {
    if (
      !explicitlyPinnedIds.has(threadId) ||
      orderedExplicitIdSet.has(threadId)
    ) {
      continue;
    }
    orderedExplicitIds.push(threadId);
    orderedExplicitIdSet.add(threadId);
  }
  for (const item of threads) {
    if (
      !explicitlyPinnedIds.has(item.id) ||
      orderedExplicitIdSet.has(item.id)
    ) {
      continue;
    }
    orderedExplicitIds.push(item.id);
    orderedExplicitIdSet.add(item.id);
  }

  const rootIds = orderedExplicitIds.filter((threadId) => {
    const parentThreadId = byId.get(threadId)?.parentThreadId ?? null;
    return (
      parentThreadId === null || !effectivePinnedThreadIds.has(parentThreadId)
    );
  });
  const pinnedThreads: Thread[] = [];
  const visited = new Set<string>();
  function visit(threadId: string): void {
    if (visited.has(threadId) || !effectivePinnedThreadIds.has(threadId))
      return;
    const item = byId.get(threadId);
    if (!item) return;
    visited.add(threadId);
    pinnedThreads.push(item);
    for (const child of childrenByParentId.get(threadId) ?? []) visit(child.id);
  }
  for (const threadId of rootIds) visit(threadId);
  for (const item of threads) visit(item.id);

  return { effectivePinnedThreadIds, pinnedThreads };
}
