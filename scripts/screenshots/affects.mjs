// What a change has to touch before it can have moved a screenshot.
//
// This decides whether a pull request pays for a capture. It cannot live in
// the workflow's `paths:` filter, because a workflow skipped by path filtering
// never reports its check, and a check that never reports blocks a pull
// request that requires it — so the job always runs and asks this instead.
//
//   git diff --name-only origin/main...HEAD | node scripts/screenshots/affects.mjs
//
// prints `capture=true` or `capture=false` for $GITHUB_OUTPUT.

/** Neither shipped nor bundled, so editing one cannot move a pixel. */
const TEST_FILE = /\.test\.[cm]?[jt]sx?$/u;

/**
 * Files outside a plugin that still decide what a capture draws: the root
 * lockfile pins playwright, which picks the container tag, which picks the
 * Chromium that rasterises every glyph; `.nvmrc` picks the Node the harness
 * runs on; and the workflow is the container itself.
 */
const ROOT_FILES = new Set([
  "package-lock.json",
  ".nvmrc",
  ".github/workflows/screenshots.yml",
]);

function affects(path) {
  if (TEST_FILE.test(path)) return false;
  // The harness frames every shot, and pins bb in its own manifest.
  if (path.startsWith("scripts/screenshots/")) return true;
  // A plugin's own source, and its manifest — a dependency bump can change
  // what the plugin draws.
  if (/^plugins\/[^/]+\/src\//u.test(path)) return true;
  if (/^plugins\/[^/]+\/package\.json$/u.test(path)) return true;
  return ROOT_FILES.has(path);
}

export function affectsScreenshots(paths) {
  return paths.some((path) => affects(path));
}

if (process.argv[1]?.endsWith("affects.mjs")) {
  const input = await new Promise((resolve) => {
    let text = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (text += chunk));
    process.stdin.on("end", () => resolve(text));
  });
  const paths = input.split("\n").filter((line) => line.trim() !== "");
  process.stdout.write(`capture=${affectsScreenshots(paths)}\n`);
}
