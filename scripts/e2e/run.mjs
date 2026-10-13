import { execFileSync } from "node:child_process";
import { createWriteStream, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { discoverSuites, groupSuites, selectSuites } from "./suites.mjs";
import { seed, writeFixtureProvider } from "../screenshots/fixture.mjs";
import { BB_CLI_PATH, startStack } from "../screenshots/stack.mjs";

const e2eDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(e2eDirectory, "../..");
const screenshotHarnessDirectory = join(repositoryRoot, "scripts/screenshots");
const bb = BB_CLI_PATH;

function parseOptions(argv) {
  const requested = [];
  let group;
  let listOnly = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--list") {
      listOnly = true;
      continue;
    }
    if (argument === "--group") {
      if (group !== undefined) throw new Error("--group may only be supplied once");
      group = argv[++index];
      if (!group || group.startsWith("--")) throw new Error("--group requires a value");
      continue;
    }
    if (argument !== "--case") throw new Error(`Unknown option ${argument}`);
    index += 1;
    if (!argv[index]) throw new Error("--case requires a suite:case value");
    requested.push(argv[index]);
  }
  return { requested, group, listOnly };
}

const { requested, group, listOnly } = parseOptions(process.argv.slice(2));
const selectedSuites = selectSuites(
  await discoverSuites(),
  requested,
);
const executionSuites = groupSuites(selectedSuites, group);
if (listOnly) {
  for (const suite of executionSuites) {
    for (const testCase of suite.selectedCases)
      console.log(`${suite.id}:${testCase}`);
  }
  process.exit(0);
}
const started = performance.now();
async function timed(label, action) {
  const start = performance.now();
  try {
    return await action();
  } finally {
    console.log(`E2E timing: ${label}: ${((performance.now() - start) / 1000).toFixed(2)}s`);
  }
}
const scratch = join(repositoryRoot, ".scratch/e2e", group ?? "all");
mkdirSync(scratch, { recursive: true });
const logStream = createWriteStream(join(scratch, "bb.log"));
const stack = await timed("stack startup", () => startStack({
  dataDir: join(scratch, "data"),
  logStream,
  prepare: ({ dataDir }) =>
    writeFixtureProvider({ dataDir, harnessDir: screenshotHarnessDirectory }),
}));

try {
  const cliEnv = { ...stack.env, BB_CLI: bb };
  // Install and prepare the same plugin combination in every group. Only suite
  // execution is partitioned; coexistence remains part of the coverage.
  const plugins = new Set(selectedSuites.flatMap((suite) => suite.plugins));
  await timed("plugin installation", async () => {
    for (const plugin of plugins) {
      execFileSync(
        bb,
        ["plugin", "install", join(repositoryRoot, "plugins", plugin), "--yes"],
        { cwd: repositoryRoot, env: cliEnv, stdio: "inherit" },
      );
    }
  });
  await timed("suite preparation", async () => {
    for (const suite of selectedSuites) {
      await suite.prepare?.({ bb, cliEnv, cases: suite.selectedCases });
    }
  });
  const fixture = await timed("fixture seed", () => seed({
    stack: { ...stack, env: cliEnv },
    workspaceRoot: join(scratch, "workspaces"),
    bb,
    assignStages: plugins.has("bb-plugin-thread-stages"),
  }));

  for (const suite of executionSuites) {
    console.log(
      `Running ${suite.id} E2E cases: ${suite.selectedCases.join(", ")}`,
    );
    await timed(`suite ${suite.id}`, () => suite.run({
      stack,
      fixture,
      cases: suite.selectedCases,
    }));
  }
  console.log("End-to-end checks passed.");
} finally {
  await timed("stack shutdown", () => stack.stop());
  logStream.end();
  console.log(`E2E timing: total: ${((performance.now() - started) / 1000).toFixed(2)}s`);
}
