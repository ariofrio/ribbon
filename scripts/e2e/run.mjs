import { execFileSync } from "node:child_process";
import { createWriteStream, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  verifyNewThreadRouting,
  waitForStageCatalog,
} from "./new-thread-routing.mjs";
import { seed, writeManagedConfig } from "../screenshots/fixture.mjs";
import { BB_CLI_PATH, startStack } from "../screenshots/stack.mjs";

const e2eDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(e2eDirectory, "../..");
const screenshotHarnessDirectory = join(repositoryRoot, "scripts/screenshots");
const scratch = join(repositoryRoot, ".scratch/e2e");
const bb = BB_CLI_PATH;

const suites = [
  {
    id: "new-thread-routing",
    cases: ["project", "stage"],
    plugins: ["bb-plugin-ribbon-sidebar", "bb-plugin-thread-stages"],
    async prepare({ cliEnv, cases }) {
      if (cases.includes("stage")) {
        await waitForStageCatalog({ bb, cliEnv });
      }
    },
    async run({ stack, fixture, cases }) {
      await verifyNewThreadRouting({ stack, fixture, cases });
    },
  },
];

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

function selectSuites(requestedCases) {
  const available = new Set(
    suites.flatMap((suite) =>
      suite.cases.map((testCase) => `${suite.id}:${testCase}`),
    ),
  );
  for (const requestedCase of requestedCases) {
    if (!available.has(requestedCase)) {
      throw new Error(
        `Unknown E2E case ${requestedCase}. Available cases: ${[...available].join(", ")}`,
      );
    }
  }
  return suites
    .map((suite) => ({
      ...suite,
      selectedCases:
        requestedCases.length === 0
          ? suite.cases
          : suite.cases.filter((testCase) =>
              requestedCases.includes(`${suite.id}:${testCase}`),
            ),
    }))
    .filter((suite) => suite.selectedCases.length > 0);
}

const selectedSuites = selectSuites(parseCases(process.argv.slice(2)));
mkdirSync(scratch, { recursive: true });
const logStream = createWriteStream(join(scratch, "bb.log"));
const stack = await startStack({
  dataDir: join(scratch, "data"),
  logStream,
});

try {
  const cliEnv = { ...stack.env, BB_CLI: bb };
  writeManagedConfig({
    dataDir: stack.dataDir,
    harnessDir: screenshotHarnessDirectory,
  });
  const plugins = new Set(selectedSuites.flatMap((suite) => suite.plugins));
  for (const plugin of plugins) {
    execFileSync(
      bb,
      ["plugin", "install", join(repositoryRoot, "plugins", plugin), "--yes"],
      { cwd: repositoryRoot, env: cliEnv, stdio: "inherit" },
    );
  }
  const fixture = seed({
    stack: { ...stack, env: cliEnv },
    workspaceRoot: join(scratch, "workspaces"),
    bb,
  });

  for (const suite of selectedSuites) {
    console.log(`Running ${suite.id} E2E cases: ${suite.selectedCases.join(", ")}`);
    await suite.prepare({ cliEnv, cases: suite.selectedCases });
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
