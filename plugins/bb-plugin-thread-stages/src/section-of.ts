export interface SectionedThread {
  id: string;
  parentThreadId: string | null;
  sectionId: string | null;
}

/**
 * The nearest section walking up from a thread, its own included.
 *
 * bb keeps a section on a root thread and leaves a child's null, so this is
 * usually the root's. It does not require that: a thread filed somewhere of
 * its own answers for itself, and for anything under it. The Icons and
 * Breadcrumbs plugins resolve it the same way, so a row, a crumb, and the
 * header's icon name one section.
 *
 * A parent the sidebar has not loaded, or a cycle, ends the walk.
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
