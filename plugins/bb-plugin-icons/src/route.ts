import type { IconOwner } from "./store";

const PROJECT_ROUTE = /^\/projects\/([^/]+)/u;

/**
 * The project a bb route is about, or null where the route names none.
 *
 * bb puts the project in the path on every screen scoped to one — the
 * project's own composer, its settings, its archive, and every thread inside
 * it — and leaves it out everywhere else, personal threads included. That
 * makes the path the one source of a project id that needs no lookup and that
 * two projects sharing a name cannot confuse.
 */
export function projectFromPath(pathname: string): IconOwner | null {
  const id = PROJECT_ROUTE.exec(pathname)?.[1];
  if (id === undefined || id === "") return null;
  return { kind: "project", id: decodeURIComponent(id) };
}
