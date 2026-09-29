import type { IconOwner } from "./store";

export interface ProjectSummary {
  id: string;
  name: string;
}

export interface ProjectLookup {
  /**
   * The project a drawn name belongs to, or null when the name settles
   * nothing.
   */
  byName(name: string): IconOwner | null;
  /** What bb calls a project, for a control that has to say which it edits. */
  nameOf(id: string): string | null;
}

/**
 * Turns bb's project list into the one question the placements ask of it.
 *
 * Several of the places bb names a project — a row of the composer's project
 * menu, a row of the mention list — print the name and nothing else, so the
 * name is all there is to go on. Two projects may share one, and no row says
 * which is which; rather than draw one project's icon over another's, an
 * ambiguous name resolves to nothing and bb keeps its own folder there.
 */
export function projectLookup(
  projects: readonly ProjectSummary[],
): ProjectLookup {
  const owners = new Map<string, IconOwner | null>();
  const names = new Map<string, string>();
  for (const project of projects) {
    const name = project.name.trim();
    names.set(project.id, name);
    if (name === "") continue;
    owners.set(
      name,
      owners.has(name) ? null : { kind: "project", id: project.id },
    );
  }
  return {
    byName: (name) => owners.get(name.trim()) ?? null,
    nameOf: (id) => names.get(id) ?? null,
  };
}
