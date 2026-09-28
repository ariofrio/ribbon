// Whether a changeset can change what the end-to-end suites see, which decides
// whether a pull request runs them. Unlike the screenshot gate, this lists what
// cannot matter: the suites exercise too much for a list of what can.
//
//   git diff --name-only origin/main...HEAD | node scripts/e2e/affects.mjs
//
// In a workflow it reads the event itself and ignores version bumps.

import { changedPaths } from "../changes.mjs";

/** Prose outside any bundled source: nothing installs or runs it. */
function inert(path) {
  if (/^\.changeset\/[^/]+\.md$/u.test(path)) return true;
  return path.endsWith(".md") && !path.includes("/src/");
}

export function affectsEndToEnd(paths) {
  return paths.some((path) => !inert(path));
}

if (process.argv[1]?.endsWith("affects.mjs")) {
  const paths = await changedPaths();
  process.stdout.write(`run=${paths === null || affectsEndToEnd(paths)}\n`);
}
