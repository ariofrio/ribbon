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
  for (const project of projects) {
    const name = project.name.trim();
    if (name === "") continue;
    owners.set(
      name,
      owners.has(name) ? null : { kind: "project", id: project.id },
    );
  }
  return {
    byName: (name) => owners.get(name.trim()) ?? null,
  };
}
