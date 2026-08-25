import type { IconOwner } from "./store";

interface StoredOwner {
  kind: string;
  id: string;
}

export interface ThreadPlacement {
  /** bb files a section on the root thread, so a child reports its root's. */
  sectionId: string | null;
  projectId: string;
}

/**
 * Whose icon a thread shows: its project's, else its section's.
 *
 * The store holds a row from the first pick until Remove deletes it, so a
 * project nobody has picked for defers to the section. With neither picked the
 * project answers anyway and draws its default glyph.
 *
 * The sidebar row applies the same precedence. It resolves the thread's
 * section separately, so the two can still name different sections.
 */
export function threadIconOwner(
  { sectionId, projectId }: ThreadPlacement,
  stored: readonly StoredOwner[],
): IconOwner {
  const has = (kind: string, id: string) =>
    stored.some((icon) => icon.kind === kind && icon.id === id);
  if (has("project", projectId)) return { kind: "project", id: projectId };
  if (sectionId !== null && has("section", sectionId)) {
    return { kind: "section", id: sectionId };
  }
  return { kind: "project", id: projectId };
}
