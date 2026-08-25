interface FilterReference {
  id: string;
}

interface FilterableThread {
  id: string;
  parentThreadId: string | null;
  projectId: string;
  sectionId: string | null;
}

export type ThreadFilter =
  | { kind: "project"; id: string }
  | { kind: "section"; id: string }
  | { kind: "uncategorized" }
  | null;

export function serializeThreadFilter(filter: ThreadFilter): string | null {
  if (filter === null) return null;
  if (filter.kind === "uncategorized") return filter.kind;
  return `${filter.kind}:${filter.id}`;
}

export function normalizeThreadFilter(
  storedValue: string | null,
  projects: readonly FilterReference[],
  sections: readonly FilterReference[] | null,
): ThreadFilter {
  if (storedValue === null) return null;
  if (storedValue === "uncategorized") {
    return sections === null || sections.length > 0
      ? { kind: "uncategorized" }
      : null;
  }

  const separator = storedValue.indexOf(":");
  const kind = separator === -1 ? "project" : storedValue.slice(0, separator);
  const id = separator === -1 ? storedValue : storedValue.slice(separator + 1);

  if (kind === "project") {
    return projects.some((project) => project.id === id)
      ? { kind: "project", id }
      : null;
  }
  if (kind === "section") {
    if (sections === null) return { kind: "section", id };
    return sections.some((section) => section.id === id)
      ? { kind: "section", id }
      : null;
  }
  return null;
}

export function filterThreads<T extends FilterableThread>(
  threads: readonly T[],
  filter: ThreadFilter,
): readonly T[] {
  if (filter === null) return threads;
  if (filter.kind === "project") {
    return threads.filter((thread) => thread.projectId === filter.id);
  }

  const threadById = new Map(threads.map((thread) => [thread.id, thread]));
  const rootByThreadId = new Map<string, T>();

  function rootThread(thread: T): T {
    const cached = rootByThreadId.get(thread.id);
    if (cached) return cached;
    const seen = new Set<string>();
    let current = thread;
    while (current.parentThreadId && !seen.has(current.id)) {
      seen.add(current.id);
      const parent = threadById.get(current.parentThreadId);
      if (!parent) break;
      current = parent;
    }
    rootByThreadId.set(thread.id, current);
    return current;
  }

  const sectionId = filter.kind === "uncategorized" ? null : filter.id;
  return threads.filter((thread) => rootThread(thread).sectionId === sectionId);
}

export function threadFilterForOpenedThread<T extends FilterableThread>(
  filter: ThreadFilter,
  threadId: string,
  threads: readonly T[],
): ThreadFilter {
  if (filter === null) return null;
  const threadById = new Map(threads.map((thread) => [thread.id, thread]));
  const thread = threadById.get(threadId);
  if (!thread) return filter;
  if (filter.kind === "project") {
    return { kind: "project", id: thread.projectId };
  }

  const seen = new Set<string>();
  let root = thread;
  while (root.parentThreadId && !seen.has(root.id)) {
    seen.add(root.id);
    const parent = threadById.get(root.parentThreadId);
    if (!parent) break;
    root = parent;
  }
  return root.sectionId === null
    ? { kind: "uncategorized" }
    : { kind: "section", id: root.sectionId };
}
