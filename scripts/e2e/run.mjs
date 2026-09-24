import {
  verifyThreadReordering,
  verifyHeadingBoundary,
} from "./ribbon-sidebar/thread-reordering.mjs";
import { execFileSync } from "node:child_process";
import { createWriteStream, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { verifyStageShortcuts } from "./stage-shortcuts.mjs";
import { verifyPluginUpgrade } from "./plugin-upgrade.mjs";
import { verifyComposerReadiness } from "./composer-readiness.mjs";
import { verifyScreenshotAnimations } from "./screenshot-animations.mjs";
import { verifyBreadcrumbChildBadge } from "./breadcrumbs/child-badge.mjs";
import {
  verifyNewThreadRouting,
  waitForStageCatalog,
} from "./ribbon-sidebar/new-thread-routing.mjs";
import {
  verifyOptionalIconLayout,
} from "./ribbon-sidebar/optional-icon-layout.mjs";
import { verifyThreadIcons } from "./ribbon-sidebar/thread-icons.mjs";
import { verifyPrNumber } from "./ribbon-sidebar/pr-number.mjs";
import { verifyThreadIndicators } from "./ribbon-sidebar/thread-indicators.mjs";
import { verifySelectedTitleColor } from "./ribbon-sidebar/selected-title-color.mjs";
import { verifyNoPaging } from "./ribbon-sidebar/no-paging.mjs";
import { verifyThreadTitleClicks } from "./ribbon-sidebar/thread-title-clicks.mjs";
import { verifyCompletedPlacement } from "./ribbon-sidebar/completed-placement.mjs";
import { seed, writeFixtureProvider } from "../screenshots/fixture.mjs";
import { BB_CLI_PATH, startStack } from "../screenshots/stack.mjs";

const e2eDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(e2eDirectory, "../..");
const screenshotHarnessDirectory = join(repositoryRoot, "scripts/screenshots");
const scratch = join(repositoryRoot, ".scratch/e2e");
const bb = BB_CLI_PATH;

const suites = [
  {
    id: "composer-readiness",
    cases: ["delayed-visibility"],
    plugins: ["bb-plugin-missing-keyboard-shortcuts"],
    run: verifyComposerReadiness,
  },
  {
    id: "thread-indicators",
    cases: ["parity"],
    plugins: ["bb-plugin-ribbon-sidebar"],
    run: verifyThreadIndicators,
  },
  {
    id: "completed-placement",
    cases: ["default-order"],
    plugins: ["bb-plugin-ribbon-sidebar", "bb-plugin-thread-stages"],
    async prepare({ cliEnv }) {
      await waitForStageCatalog({ bb, cliEnv });
    },
    run: verifyCompletedPlacement,
  },
  {
    id: "thread-reordering",
    cases: ["interaction", "heading-boundary"],
    plugins: ["bb-plugin-ribbon-sidebar"],
    async run(args) {
      if (args.cases.includes("interaction")) await verifyThreadReordering(args);
      if (args.cases.includes("heading-boundary")) await verifyHeadingBoundary(args);
    },
  },
  {
    id: "thread-title-clicks",
    cases: ["navigation"],
    plugins: ["bb-plugin-ribbon-sidebar"],
    run: verifyThreadTitleClicks,
  },
  {
    id: "no-paging",
    cases: ["display-options"],
    plugins: ["bb-plugin-ribbon-sidebar"],
    run: verifyNoPaging,
  },
  {
    id: "pr-number",
    cases: ["placement"],
    plugins: ["bb-plugin-ribbon-sidebar"],
    run: verifyPrNumber,
  },
  {
    id: "thread-icons",
    cases: ["groupings"],
    plugins: ["bb-plugin-icons", "bb-plugin-ribbon-sidebar", "bb-plugin-thread-stages"],
    async prepare({ cliEnv }) {
      await waitForStageCatalog({ bb, cliEnv });
    },
    run: verifyThreadIcons,
  },
  {
    id: "screenshots",
    cases: ["animations"],
    plugins: [],
    run: verifyScreenshotAnimations,
  },
  {
    id: "plugin-upgrade",
    cases: ["public-api"],
    plugins: [
      "bb-plugin-icons",
      "bb-plugin-missing-keyboard-shortcuts",
      "bb-plugin-chatgpt-theme",
      "bb-plugin-ribbon-sidebar",
      "bb-plugin-thread-stages",
      "bb-plugin-breadcrumbs",
    ],
    async prepare({ cliEnv }) {
      await waitForStageCatalog({ bb, cliEnv });
    },
    run: verifyPluginUpgrade,
  },
  {
    id: "breadcrumbs",
    cases: ["child-badge"],
    plugins: ["bb-plugin-breadcrumbs"],
    async run({ stack, fixture }) {
      await verifyBreadcrumbChildBadge({ stack, fixture });
    },
  },
  {
    id: "new-thread-routing",
    cases: ["project", "stage"],
    plugins: ["bb-plugin-ribbon-sidebar", "bb-plugin-thread-stages"],
    async prepare({ cliEnv }) {
      await waitForStageCatalog({ bb, cliEnv });
    },
    async run({ stack, fixture, cases }) {
      await verifyNewThreadRouting({ stack, fixture, cases });
    },
  },
  {
    id: "optional-icon-layout",
    cases: ["title-indicator-lane"],
    plugins: ["bb-plugin-ribbon-sidebar"],
    async run({ stack, fixture }) {
      await verifyOptionalIconLayout({ stack, fixture });
    },
  },
  {
    id: "selected-title-color",
    cases: ["chatgpt-theme"],
    plugins: ["bb-plugin-ribbon-sidebar", "bb-plugin-chatgpt-theme"],
    run: verifySelectedTitleColor,
  },
  {
    id: "stage-shortcuts",
    cases: ["platforms"],
    plugins: ["bb-plugin-thread-stages", "bb-plugin-ribbon-sidebar"],
    async prepare({ cliEnv }) {
      await waitForStageCatalog({ bb, cliEnv });
    },
    run: verifyStageShortcuts,
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
    await suite.prepare?.({ cliEnv, cases: suite.selectedCases });
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
