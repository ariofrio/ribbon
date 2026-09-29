export interface WorkflowHierarchyThread {
  id: string;
  parentThreadId: string | null;
}

export function rootThreadIdByThreadId<Thread extends WorkflowHierarchyThread>(
  threads: readonly Thread[],
): ReadonlyMap<string, string | null> {
  const byId = new Map(threads.map((thread) => [thread.id, thread] as const));
  const roots = new Map<string, string | null>();

  function resolve(threadId: string): string | null {
    const cached = roots.get(threadId);
    if (cached !== undefined || roots.has(threadId)) return cached ?? null;

    const path: string[] = [];
    const visited = new Set<string>();
    let current = byId.get(threadId);
    let rootId: string | null = null;

    while (current) {
      const known = roots.get(current.id);
      if (known !== undefined || roots.has(current.id)) {
        rootId = known ?? null;
        break;
      }
      if (visited.has(current.id)) {
        rootId = null;
        break;
      }
      visited.add(current.id);
      path.push(current.id);
      if (current.parentThreadId === null) {
        rootId = current.id;
        break;
      }
      current = byId.get(current.parentThreadId);
    }

    for (const id of path) roots.set(id, rootId);
    return rootId;
  }

  for (const thread of threads) resolve(thread.id);
  return roots;
}

export function partitionWorkflowThreads<
  Thread extends WorkflowHierarchyThread,
>(
  threads: readonly Thread[],
): { rootThreads: Thread[]; childThreads: Thread[] } {
  const roots = rootThreadIdByThreadId(threads);
  const rootThreads: Thread[] = [];
  const childThreads: Thread[] = [];

  for (const thread of threads) {
    if (roots.get(thread.id) === thread.id) rootThreads.push(thread);
    else childThreads.push(thread);
  }
  return { rootThreads, childThreads };
}

export function withThreadAncestors<Thread extends WorkflowHierarchyThread>(
  matches: readonly Thread[],
  allThreads: readonly Thread[],
): Thread[] {
  const byId = new Map(
    allThreads.map((thread) => [thread.id, thread] as const),
  );
  const included = new Set(matches.map((thread) => thread.id));

  for (const match of matches) {
    const path = new Set([match.id]);
    let parentId = match.parentThreadId;
    while (parentId !== null && !path.has(parentId)) {
      path.add(parentId);
      const parent = byId.get(parentId);
      if (!parent) break;
      included.add(parent.id);
      parentId = parent.parentThreadId;
    }
  }

  return allThreads.filter((thread) => included.has(thread.id));
}
