// scripts/e2e/affects.mjs decides whether a pull request runs the end-to-end
// suites. It skips them only for files nothing installs or runs, so a path it
// has never heard of runs them.
import assert from "node:assert/strict";
import test from "node:test";
import { affectsEndToEnd } from "./e2e/affects.mjs";

const runs = (path) => affectsEndToEnd([path]);

test("release notes do not run the suites", () => {
  assert.equal(runs(".changeset/child-thread-stages.md"), false);
  assert.equal(runs("plugins/bb-plugin-ribbon-sidebar/CHANGELOG.md"), false);
  assert.equal(runs("README.md"), false);
  assert.equal(runs("plugins/bb-plugin-icons/README.md"), false);
});

test("anything else runs them", () => {
  for (const path of [
    "plugins/bb-plugin-ribbon-sidebar/src/app.tsx",
    // Markdown under src can be bundled.
    "plugins/bb-plugin-ribbon-sidebar/src/help.md",
    "plugins/bb-plugin-ribbon-sidebar/package.json",
    "package-lock.json",
    ".changeset/config.json",
    "scripts/e2e/run.mjs",
    ".github/workflows/plugins.yml",
    ".nvmrc",
  ]) {
    assert.ok(runs(path), path);
  }
});

test("one file that matters runs the suites for the whole change", () => {
  assert.equal(affectsEndToEnd([".changeset/a.md", "README.md"]), false);
  assert.equal(
    affectsEndToEnd([".changeset/a.md", "scripts/e2e/run.mjs"]),
    true,
  );
  assert.equal(affectsEndToEnd([]), false);
});
