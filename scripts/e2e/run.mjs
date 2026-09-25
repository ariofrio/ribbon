import { execFileSync } from "node:child_process";
import { createWriteStream, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { discoverSuites, selectSuites } from "./suites.mjs";
import { seed, writeFixtureProvider } from "../screenshots/fixture.mjs";
import { BB_CLI_PATH, startStack } from "../screenshots/stack.mjs";

const e2eDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(e2eDirectory, "../..");
const screenshotHarnessDirectory = join(repositoryRoot, "scripts/screenshots");
const scratch = join(repositoryRoot, ".scratch/e2e");
const bb = BB_CLI_PATH;

function parseCases(argv) {
  const requested = [];
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument !== "--case") throw new Error(`Unknown option ${argument}`);
    index += 1;
    if (!argv[index]) throw new Error("--case requires a suite:case value");
    requested.push(argv[index]);
  }
  return requested;
}

const argv = process.argv.slice(2);
const listOnly = argv.includes("--list");
const selectedSuites = selectSuites(
  await discoverSuites(),
  parseCases(argv.filter((arg) => arg !== "--list")),
);
if (listOnly) {
  for (const suite of selectedSuites) {
    for (const testCase of suite.selectedCases)
      console.log(`${suite.id}:${testCase}`);
  }
  process.exit(0);
}
mkdirSync(scratch, { recursive: true });
const logStream = createWriteStream(join(scratch, "bb.log"));
const stack = await startStack({
  dataDir: join(scratch, "data"),
  logStream,
  prepare: ({ dataDir }) =>
    writeFixtureProvider({ dataDir, harnessDir: screenshotHarnessDirectory }),
});

try {
  const cliEnv = { ...stack.env, BB_CLI: bb };
  const plugins = new Set(selectedSuites.flatMap((suite) => suite.plugins));
  for (const plugin of plugins) {
    execFileSync(
      bb,
      ["plugin", "install", join(repositoryRoot, "plugins", plugin), "--yes"],
      { cwd: repositoryRoot, env: cliEnv, stdio: "inherit" },
    );
  }
  for (const suite of selectedSuites) {
    await suite.prepare?.({ bb, cliEnv, cases: suite.selectedCases });
  }
  const fixture = seed({
    stack: { ...stack, env: cliEnv },
    workspaceRoot: join(scratch, "workspaces"),
    bb,
    assignStages: plugins.has("bb-plugin-ribbon-sidebar"),
  });

  for (const suite of selectedSuites) {
    console.log(
      `Running ${suite.id} E2E cases: ${suite.selectedCases.join(", ")}`,
    );
    await suite.run({
      stack,
      fixture,
      cases: suite.selectedCases,
    });
  }
  console.log("End-to-end checks passed.");
} finally {
  await stack.stop();
  logStream.end();
}
