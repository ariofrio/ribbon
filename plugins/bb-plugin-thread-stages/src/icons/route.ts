import type { IconOwner } from "./store";

const PROJECT_PATH = /^\/projects\/([^/]+)(\/.*)?$/u;

/**
 * The project a bb path is about, or null where it names none.
 *
 * bb puts the project in the path on every screen scoped to one — the
 * project's own composer, its settings, its archive, and every thread inside
 * it — and leaves it out everywhere else, personal threads included. That
 * makes a path the one place a project id can be read without a lookup, and
 * without two projects sharing a name being able to confuse it.
 *
 * `exact` narrows to the project's own screen, which is what a link points at
 * when it stands for the project rather than for something inside it.
 */
export function projectFromPath(
  pathname: string,
  { exact = false }: { exact?: boolean } = {},
): IconOwner | null {
  const match = PROJECT_PATH.exec(pathname);
  const id = match?.[1];
  if (match === null || id === undefined || id === "") return null;
  // A trailing slash still points at the project's own screen.
  if (exact && (match[2] ?? "/") !== "/") return null;
  return { kind: "project", id: decodeURIComponent(id) };
}
