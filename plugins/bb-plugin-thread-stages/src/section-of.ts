export interface SectionedThread {
  id: string;
  parentThreadId: string | null;
  sectionId: string | null;
}

/**
 * The nearest section walking up from a thread, its own included.
 *
 * bb usually keeps a section on the root thread and leaves a child's null, but
 * it accepts one on any thread, so a thread filed somewhere of its own answers
 * for itself and for anything under it. Icons and Breadcrumbs resolve it the
 * same way, so a row, a crumb, and the header's icon name one section.
 *
 * The walk ends on a parent the sidebar has not loaded, or on a cycle.
 */
export function nearestSectionId(
  threadId: string,
  threads: readonly SectionedThread[],
): string | null {
  const byId = new Map(threads.map((thread) => [thread.id, thread] as const));
  const seen = new Set<string>();
  let current = byId.get(threadId);
  while (current !== undefined) {
    if (current.sectionId !== null) return current.sectionId;
    const parent = current.parentThreadId;
    if (parent === null || seen.has(parent)) return null;
    seen.add(parent);
    current = byId.get(parent);
  }
  return null;
}
