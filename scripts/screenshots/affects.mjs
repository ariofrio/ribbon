// Whether a changeset can have moved a screenshot, which decides whether a
// pull request runs a capture. This cannot be the workflow's `paths:` filter,
// because a workflow skipped by path filtering never reports its check, and a
// pull request requiring that check would never merge.
//
//   git diff --name-only origin/main...HEAD | node scripts/screenshots/affects.mjs

/** Tests are neither shipped nor bundled, so they cannot change a screenshot. */
const TEST_FILE = /\.test\.[cm]?[jt]sx?$/u;

/** Files outside any plugin that still change what a capture draws. */
const ROOT_FILES = new Set([
  // Pins playwright, which picks the container's Chromium.
  "package-lock.json",
  ".nvmrc",
  ".github/workflows/screenshots.yml",
]);

function affects(path) {
  if (TEST_FILE.test(path)) return false;
  if (path.startsWith("scripts/screenshots/")) return true;
  if (/^plugins\/[^/]+\/src\//u.test(path)) return true;
  // A dependency bump can change what a plugin draws.
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
