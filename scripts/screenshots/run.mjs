// Regenerates every plugin screenshot from one seeded bb.
//
//   npm run screenshots            capture every shot
//   npm run screenshots -- --only icons
//   npm run screenshots -- --keep  leave the seeded bb running for inspection
//
// Needs the Node in .nvmrc, Playwright's Chromium (npx playwright install
// chromium), and the bb pinned beside this file. Nothing records what a shot
// was captured from; two runs write the same bytes, so git answers that.
import { execFileSync } from "node:child_process";
import { createWriteStream, mkdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { capture } from "./capture.mjs";
import { applyPluginState, seed, writeManagedConfig } from "./fixture.mjs";
import { SHOTS } from "./shots.mjs";
import { BB_CLI_PATH, startStack } from "./stack.mjs";

const harnessDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(harnessDirectory, "../..");
const scratch = join(repositoryRoot, ".scratch/screenshots");
const bb = process.env.BB_CLI ?? BB_CLI_PATH;

const options = parseArguments(process.argv.slice(2));
const shots = SHOTS.filter(
  (shot) => options.only === undefined || shot.id === options.only,
);
if (options.only !== undefined && shots.length === 0) {
  throw new Error(`No shot matches --only ${options.only}`);
}

function parseArguments(argv) {
  const parsed = { keep: false, only: undefined };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--keep") parsed.keep = true;
    else if (argument === "--only") {
      index += 1;
      parsed.only = argv[index];
    } else throw new Error(`Unknown option ${argument}`);
  }
  return parsed;
}

function shotFiles(shot) {
  return Object.fromEntries(
    shot.outputs.map((output) => [output, join(assetsDirectory(shot), output)]),
  );
}

/** A shot of the whole collection belongs to the repository, not to a plugin. */
function assetsDirectory(shot) {
  return shot.plugin === null
    ? join(repositoryRoot, "assets")
    : join(repositoryRoot, "plugins", shot.plugin, "assets");
}

mkdirSync(scratch, { recursive: true });
const logStream = createWriteStream(join(scratch, "bb.log"));
const dataDir = join(scratch, "data");
const workspaceRoot = join(scratch, "workspaces");

console.log("Starting an isolated bb…");
const stack = await startStack({ dataDir, logStream });
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    void stack.stop().then(() => process.exit(1));
  });
}
try {
  writeManagedConfig({ dataDir, harnessDir: harnessDirectory });

  console.log("Installing this repository's plugins…");
  execFileSync(
    process.execPath,
    [
      join(repositoryRoot, "scripts/install-plugins.mjs"),
      "--skip-dependencies",
    ],
    {
      cwd: repositoryRoot,
      env: { ...stack.env, BB_CLI: bb },
      stdio: "inherit",
    },
  );

  console.log("Seeding the fixture…");
  const fixture = seed({ stack, workspaceRoot, bb });
  await applyPluginState({ stack, projects: fixture.projects });

  console.log("Capturing…");
  const captured = await capture({ stack, fixture, shots, shotFiles, repositoryRoot });

  console.log(
    `\nWrote ${captured.flatMap((shot) => shot.outputs).length} files:\n${captured
      .flatMap((shot) =>
        Object.values(shotFiles(shot)).map((path) => `  ${relative(repositoryRoot, path)}`),
      )
      .join("\n")}`,
  );
  if (options.keep) {
    console.log(
      `\nThe seeded bb is still running at ${stack.serverUrl}; the next run replaces it.`,
    );
  }
} finally {
  // A run that throws must not leave its bb behind. An abandoned stack keeps a
  // server, a host daemon and their workers alive, and stack.mjs only reaps one
  // when THIS worktree runs again — so a worktree that fails once and stops
  // trying leaks a whole bb until someone notices. Several worktrees doing that
  // is what starves the next capture's seed, which fails, which leaks another.
  if (!options.keep) await stack.stop();
}
