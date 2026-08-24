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

test("the relevance gate runs before capture-only setup", () => {
  const workflow = readFileSync(
    join(repositoryRoot, ".github/workflows/screenshots.yml"),
    "utf8",
  );
  const gate = workflow.indexOf(
    "name: Decide whether anything can have moved a picture",
  );
  const setupNode = workflow.indexOf("uses: actions/setup-node@v7");
  const prepare = workflow.indexOf("name: Prepare the container");
  const install = workflow.indexOf("run: npm ci");

  assert.ok(gate >= 0);
  assert.ok(gate < setupNode, "setup-node belongs after the relevance gate");
  assert.ok(gate < prepare, "apt belongs after the relevance gate");
  assert.ok(gate < install, "dependencies belong after the relevance gate");
  assert.doesNotMatch(workflow, /npm ci --prefix scripts\/screenshots/u);
});
