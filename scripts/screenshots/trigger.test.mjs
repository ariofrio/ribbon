// affects.mjs alone decides whether a pull request runs a capture. A path it
// misses merges a stale screenshot, and a path it lists that cannot matter
// costs five minutes to redraw identical files.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { affectsScreenshots } from "./affects.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const plugins = readdirSync(join(repositoryRoot, "plugins"));

const captures = (path) => affectsScreenshots([path]);

test("a plugin's own source recaptures", () => {
  assert.ok(plugins.length > 0, "no plugins to check");
  for (const plugin of plugins) {
    assert.ok(captures(`plugins/${plugin}/src/app.tsx`), `plugins/${plugin}/src`);
  }
});

// A dependency bump can move what a plugin draws.
test("a plugin's manifest recaptures", () => {
  for (const plugin of plugins) {
    assert.ok(captures(`plugins/${plugin}/package.json`));
  }
});

test("the harness that frames every shot recaptures", () => {
  assert.ok(captures("scripts/screenshots/shots.mjs"));
  assert.ok(captures("scripts/screenshots/capture.mjs"));
  // bb itself is pinned here and locked at the root; a new bb redraws every
  // window.
  assert.ok(captures("scripts/screenshots/package.json"));
  assert.ok(captures("package-lock.json"));
});

// The container tag tracks the playwright version, which picks the Chromium
// that rasterises every glyph.
test("the pinned Chromium recaptures", () => {
  assert.ok(captures("package-lock.json"));
  assert.ok(captures(".nvmrc"));
  assert.ok(captures(".github/workflows/screenshots.yml"));
});

test("a test does not recapture", () => {
  for (const name of ["app.test.ts", "app.test.tsx", "route.test.ts"]) {
    assert.equal(captures(`plugins/${plugins[0]}/src/${name}`), false, name);
  }
  assert.equal(captures("scripts/screenshots/capture.test.mjs"), false);
  assert.equal(captures("scripts/screenshots/trigger.test.mjs"), false);
});

test("prose does not recapture", () => {
  assert.equal(captures("README.md"), false);
  assert.equal(captures(`plugins/${plugins[0]}/README.md`), false);
  assert.equal(captures(".changeset/wide-personal-bubble.md"), false);
  assert.equal(captures("AGENTS.md"), false);
  assert.equal(captures(".github/workflows/plugins.yml"), false);
});

// The workflow hands it a whole changeset, and one file in it is enough.
test("one file that matters carries a changeset full of files that do not", () => {
  assert.equal(
    affectsScreenshots(["README.md", "AGENTS.md", ".changeset/a.md"]),
    false,
  );
  assert.equal(
    affectsScreenshots([
      "README.md",
      `plugins/${plugins[0]}/src/app.tsx`,
      ".changeset/a.md",
    ]),
    true,
  );
  assert.equal(affectsScreenshots([]), false);
});

// A workflow skipped by a `paths:` filter never reports its check, which
// blocks the pull request requiring it.
test("the trigger filters no paths, so the check always reports", () => {
  const workflow = readFileSync(
    join(repositoryRoot, ".github/workflows/screenshots.yml"),
    "utf8",
  );
  const trigger = workflow.slice(
    workflow.indexOf("\non:"),
    workflow.indexOf("\npermissions:"),
  );
  assert.doesNotMatch(trigger, /paths(-ignore)?:/u);
  assert.match(trigger, /pull_request:/u);
});

test("the relevance gate runs outside the renderer container", () => {
  const workflow = readFileSync(
    join(repositoryRoot, ".github/workflows/screenshots.yml"),
    "utf8",
  );
  const relevanceJob = workflow.slice(
    workflow.indexOf("\n  relevant:"),
    workflow.indexOf("\n  capture:"),
  );
  const captureJob = workflow.slice(
    workflow.indexOf("\n  capture:"),
    workflow.indexOf("\n  recapture:"),
  );

  assert.match(relevanceJob, /name: Decide whether anything can have moved/u);
  assert.doesNotMatch(relevanceJob, /container:/u);
  assert.match(relevanceJob, /outputs:\n      capture:/u);
  assert.match(captureJob, /needs: relevant/u);
  assert.match(
    captureJob,
    /if: needs\.relevant\.outputs\.capture == 'true'/u,
  );
  assert.match(captureJob, /container:/u);
  assert.match(captureJob, /uses: actions\/setup-node@v7/u);
  assert.match(captureJob, /name: Prepare the container/u);
  assert.match(captureJob, /run: npm ci/u);
  assert.match(
    captureJob,
    /git config --global --add safe\.directory "\$GITHUB_WORKSPACE"/u,
  );
  assert.doesNotMatch(workflow, /npm ci --prefix scripts\/screenshots/u);
});

test("the required recapture job reports skipped captures as success", () => {
  const workflow = readFileSync(
    join(repositoryRoot, ".github/workflows/screenshots.yml"),
    "utf8",
  );
  const requiredJob = workflow.slice(workflow.indexOf("\n  recapture:"));

  assert.match(requiredJob, /needs: \[relevant, capture\]/u);
  assert.match(requiredJob, /if: always\(\)/u);
  assert.match(requiredJob, /\*failure\*\|\*cancelled\*/u);
});
