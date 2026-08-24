// What decides whether a pull request pays for a capture.
//
// Nothing records what a screenshot was captured from any more, so this is the
// whole gate. A path that can move a picture and is missing here is a
// screenshot that merges stale; a path that cannot and is present here costs
// five minutes to redraw an identical set of files.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { affectsScreenshots } from "./affects.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const plugins = readdirSync(join(repositoryRoot, "plugins"));

/** The question the workflow asks, for one file at a time. */
const captures = (path) => affectsScreenshots([path]);

test("a plugin's own source recaptures", () => {
  assert.ok(plugins.length > 0, "no plugins to check");
  for (const plugin of plugins) {
    assert.ok(captures(`plugins/${plugin}/src/app.tsx`), `plugins/${plugin}/src`);
  }
});

// A dependency bump can move what a plugin draws, which is why the digest this
// replaced hashed the manifest too.
test("a plugin's manifest recaptures", () => {
  for (const plugin of plugins) {
    assert.ok(captures(`plugins/${plugin}/package.json`));
  }
});

test("the harness that frames every shot recaptures", () => {
  assert.ok(captures("scripts/screenshots/shots.mjs"));
  assert.ok(captures("scripts/screenshots/capture.mjs"));
  // bb itself is pinned here, and a new bb redraws every window.
  assert.ok(captures("scripts/screenshots/package.json"));
  assert.ok(captures("scripts/screenshots/package-lock.json"));
});

// The container's tag tracks the playwright version, which decides the
// Chromium on disk, which decides how every glyph is rasterised.
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

// A workflow skipped by a `paths:` filter never reports its check, and a check
// that never reports blocks a pull request that requires it. The filter has to
// stay out of the trigger for the check to be requirable at all.
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
