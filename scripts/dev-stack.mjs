// Boots a throwaway bb with this repository's plugins installed, and leaves it
// running so a change can be tried by hand.
//
// It reuses the screenshot harness's isolated stack — its own data directory,
// server, and host daemon — because installing a plugin is server state, and
// the bb the developer is using must never be the one under test. Seeding the
// same fixture the screenshots use means the sidebar has projects, sections,
// and threads to exercise rather than an empty window.
//
// Usage: npm run dev:stack            seed the fixture, print the URL, stay up
//        npm run dev:stack -- --bare  skip the fixture and start empty
//
// Capturing and seeding both run on the Node in .nvmrc; require-node.mjs turns
// the undici EPIPE a wrong major produces back into a sentence.
//
// Ctrl+C stops the server and daemon. The next run replaces whatever the last
// one left behind, so a stale stack never accumulates.
import { execFileSync } from "node:child_process";
import { createWriteStream, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { applyPluginState, seed, writeManagedConfig } from "./screenshots/fixture.mjs";
import { startStack } from "./screenshots/stack.mjs";
import { resolveBbCli } from "./bb-cli.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const harnessDirectory = join(repositoryRoot, "scripts/screenshots");
const scratch = join(repositoryRoot, ".scratch/dev-stack");
const bare = process.argv.includes("--bare");
// Absolute, always: see scripts/bb-cli.mjs for what a bare name does here.
const bb = resolveBbCli();

mkdirSync(scratch, { recursive: true });
const logPath = join(scratch, "bb.log");
const logStream = createWriteStream(logPath);
const dataDir = join(scratch, "data");
const workspaceRoot = join(scratch, "workspaces");

console.log("Starting an isolated bb…");
const stack = await startStack({ dataDir, logStream });

let stopping = false;
async function stop(code) {
  if (stopping) return;
  stopping = true;
  console.log("\nStopping the isolated bb…");
  await stack.stop();
  process.exit(code);
}
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => void stop(0));
}

try {
  writeManagedConfig({ dataDir, harnessDir: harnessDirectory });

  console.log("Installing this repository's plugins…");
  execFileSync(
    process.execPath,
    [join(repositoryRoot, "scripts/install-plugins.mjs")],
    { cwd: repositoryRoot, env: { ...stack.env, BB_CLI: bb }, stdio: "inherit" },
  );
} catch (error) {
  // Without the plugins there is nothing here to try, so this one is fatal.
  console.error(error);
  await stop(1);
}

if (!bare) {
  // The fixture only furnishes the window. A stack with an empty sidebar is
  // still worth having, so a seeding failure is reported and stepped over
  // rather than taking the server down with it.
  try {
    console.log("Seeding the fixture…");
    const fixture = seed({ stack, workspaceRoot, bb });
    await applyPluginState({ stack, projects: fixture.projects });
  } catch (error) {
    console.warn(
      `\n  Seeding failed, continuing with whatever it managed to create:\n  ${error?.message ?? error}\n`,
    );
  }
}

console.log(
  [
    "",
    `  Open  ${stack.serverUrl}`,
    "",
    `  data  ${dataDir}`,
    `  log   ${logPath}`,
    "",
    // BB_SERVER_URL is what points the CLI at this stack; BB_DATA_DIR alone
    // leaves it talking to the developer's own bb, which is the one thing this
    // script exists to avoid. The thread/project/environment ids are cleared
    // because an agent shell inherits its own, and they are not this stack's.
    "  cli   env \\",
    `          BB_SERVER_URL=${stack.serverUrl} \\`,
    `          BB_DATA_DIR=${dataDir} \\`,
    "          -u BB_PROJECT_ID -u BB_THREAD_ID -u BB_ENVIRONMENT_ID \\",
    `          ${bb} plugin list`,
    "",
    "  Ctrl+C to stop. Your own bb is untouched.",
    "",
  ].join("\n"),
);

// Nothing else to do; hold the process open so the children stay alive.
setInterval(() => {}, 1 << 30);
