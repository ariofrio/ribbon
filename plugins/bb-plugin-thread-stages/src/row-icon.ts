import type { ProjectIconView } from "./icons";

export interface RowIconOwners {
  /** Every project, carrying its default where nobody has picked one. */
  projects: ReadonlyMap<string, ProjectIconView>;
  /** Only projects someone has picked an icon for. */
  chosenProjects: ReadonlyMap<string, ProjectIconView>;
  /** Only sections someone has picked an icon for. */
  sections: ReadonlyMap<string, ProjectIconView>;
}

export interface RowIconThread {
  /**
   * The section the row belongs to. bb attaches a section to a root thread,
   * so a child passes its root's rather than its own, which is null.
   */
  sectionId: string | null;
  projectId: string;
}

/**
 * The icon a sidebar row draws: its project's, its section's, or the project's
 * default glyph.
 *
 * An owner reaches `chosenProjects` or `sections` only once someone picks an
 * icon for it, so a project nobody has touched defers to the section the
 * thread is filed under.
 */
export function rowIcon(
  { sectionId, projectId }: RowIconThread,
  { projects, chosenProjects, sections }: RowIconOwners,
): ProjectIconView | null {
  const chosen = chosenProjects.get(projectId);
  if (chosen !== undefined) return chosen;
  const section = sectionId === null ? undefined : sections.get(sectionId);
  return section ?? projects.get(projectId) ?? null;
}
