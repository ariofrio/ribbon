export interface HierarchyThread {
  id: string;
  parentThreadId: string | null;
}

export interface ThreadHierarchyRow<Thread extends HierarchyThread> {
  thread: Thread;
  depth: number;
  hasChildren: boolean;
  descendants: readonly Thread[];
}

export function effectiveHierarchyParentId(
  thread: HierarchyThread,
  threadIdsInGroup: ReadonlySet<string>,
): string | null {
  return thread.parentThreadId !== null &&
    threadIdsInGroup.has(thread.parentThreadId)
    ? thread.parentThreadId
    : null;
}

export function canDropThreadBeside(
  draggedThread: HierarchyThread,
  targetThread: HierarchyThread,
  destinationThreadIds: ReadonlySet<string>,
): boolean {
  return (
    effectiveHierarchyParentId(draggedThread, destinationThreadIds) ===
    effectiveHierarchyParentId(targetThread, destinationThreadIds)
  );
}

export function flattenThreadHierarchy<Thread extends HierarchyThread>(
  threads: readonly Thread[],
  collapsedThreadIds: ReadonlySet<string>,
): ThreadHierarchyRow<Thread>[] {
  const byId = new Map(threads.map((thread) => [thread.id, thread] as const));
  const childrenByParent = new Map<string, Thread[]>();
  const roots: Thread[] = [];

  for (const thread of threads) {
    const parentId = thread.parentThreadId;
    if (parentId === null || parentId === thread.id || !byId.has(parentId)) {
      roots.push(thread);
      continue;
    }
    const children = childrenByParent.get(parentId) ?? [];
    children.push(thread);
    childrenByParent.set(parentId, children);
  }

  const rows: ThreadHierarchyRow<Thread>[] = [];
  const visited = new Set<string>();

  function descendantsOf(thread: Thread, path: ReadonlySet<string>): Thread[] {
    const descendants: Thread[] = [];
    for (const child of childrenByParent.get(thread.id) ?? []) {
      if (path.has(child.id)) continue;
      descendants.push(child);
      const nextPath = new Set(path);
      nextPath.add(child.id);
      descendants.push(...descendantsOf(child, nextPath));
    }
    return descendants;
  }

  function visit(thread: Thread, depth: number): void {
    if (visited.has(thread.id)) return;
    visited.add(thread.id);
    const children = childrenByParent.get(thread.id) ?? [];
    const isCollapsed = collapsedThreadIds.has(thread.id);
    const descendants = isCollapsed
      ? descendantsOf(thread, new Set([thread.id]))
      : [];
    rows.push({
      thread,
      depth,
      hasChildren: children.length > 0,
      descendants,
    });
    if (isCollapsed) {
      for (const descendant of descendants) visited.add(descendant.id);
      return;
    }
    for (const child of children) visit(child, depth + 1);
  }

  for (const root of roots) visit(root, 0);
  // Corrupt parent cycles have no root. Keep every thread visible by promoting
  // the first unvisited member of each cycle to a root.
  for (const thread of threads) visit(thread, 0);
  return rows;
}
