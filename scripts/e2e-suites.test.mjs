import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import test from "node:test";
import { discoverSuites, E2E_GROUPS, groupSuites, selectSuites } from "./e2e/suites.mjs";

async function directory(t) {
  const scratch = resolve(".scratch/work");
  await mkdir(scratch, { recursive: true });
  const root = await mkdtemp(join(scratch, "e2e-suites-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

async function add(root, name, descriptor) {
  await writeFile(
    join(root, `${name}.suite.mjs`),
    `export default { ...${JSON.stringify(descriptor)}, run() {} };\n`,
  );
}

test("adding a suite file makes its cases selectable without editing the runner", async (t) => {
  const root = await directory(t);
  await add(root, "existing", {
    id: "existing",
    cases: ["one"],
    plugins: [],
    order: 10,
  });
  await add(root, "new-feature", {
    id: "new-feature",
    cases: ["first", "second"],
    plugins: ["bb-plugin-example"],
  });
  await writeFile(join(root, "helper.mjs"), 'throw new Error("not a suite");');
  const selected = selectSuites(await discoverSuites(root), [
    "new-feature:second",
  ]);
  assert.equal(selected.length, 1);
  assert.equal(selected[0].id, "new-feature");
  assert.deepEqual(selected[0].selectedCases, ["second"]);
  assert.deepEqual(selected[0].plugins, ["bb-plugin-example"]);
  assert.equal(typeof selected[0].run, "function");
});

test("discovery preserves explicit suite order with deterministic ordering for new suites", async (t) => {
  const root = await directory(t);
  await add(root, "a", { id: "last", cases: ["one"], plugins: [], order: 20 });
  await add(root, "z", { id: "first", cases: ["one"], plugins: [], order: 10 });
  await add(root, "b", { id: "new-b", cases: ["one"], plugins: [] });
  await add(root, "c", { id: "new-c", cases: ["one"], plugins: [] });
  assert.deepEqual(
    (await discoverSuites(root)).map((suite) => suite.id),
    ["first", "last", "new-b", "new-c"],
  );
});

test("duplicate suite IDs and malformed suites fail discovery rather than hiding tests", async (t) => {
  const root = await directory(t);
  await add(root, "a", { id: "duplicate", cases: ["one"], plugins: [] });
  await add(root, "b", { id: "duplicate", cases: ["two"], plugins: [] });
  await assert.rejects(discoverSuites(root), /Duplicate E2E suite duplicate/);
  const invalid = await directory(t);
  await add(invalid, "invalid", { id: "invalid", cases: [], plugins: [] });
  await assert.rejects(
    discoverSuites(invalid),
    /Invalid E2E suite.*invalid.suite.mjs/,
  );
});

test("unknown case selectors report the available cases", () => {
  assert.throws(
    () =>
      selectSuites(
        [{ id: "calendar", cases: ["sharing"] }],
        ["calendar:missing"],
      ),
    /Unknown E2E case calendar:missing. Available cases: calendar:sharing/,
  );
});

test("the runner lists selected cases without starting bb", async () => {
  const { execFileSync } = await import("node:child_process");
  const output = execFileSync(
    process.execPath,
    ["scripts/e2e/run.mjs", "--list", "--case", "thread-titles:once"],
    { encoding: "utf8" },
  );
  assert.equal(output, "thread-titles:once\n");
});

test("an empty suite directory fails instead of reporting an empty run as passed", async (t) => {
  const root = await directory(t);
  await assert.rejects(discoverSuites(root), /No E2E suites found/);
});

test("isolated groups partition every discovered case once, preserving suite order", async () => {
  assert.deepEqual(E2E_GROUPS, ["placement", "ordering", "sidebar"]);
  const suites = selectSuites(await discoverSuites(), []);
  const cases = (selected) => selected.flatMap((suite) =>
    suite.selectedCases.map((name) => `${suite.id}:${name}`));
  const grouped = E2E_GROUPS.map((group) =>
    groupSuites(suites, group));
  assert.ok(grouped.every((group) => group.length > 0));
  assert.deepEqual(grouped.flatMap(cases).sort(), cases(suites).sort());
  for (const group of grouped) {
    assert.deepEqual(group, suites.filter((suite) => group.includes(suite)));
  }
  assert.deepEqual(grouped[0].map((suite) => suite.id), [
    "composer-readiness", "missing-shortcuts", "terminal-shortcut", "thread-indicators",
    "completed-placement", "stage-placement",
  ]);
  assert.deepEqual(grouped[1].map((suite) => suite.id), [
    "thread-titles", "section-placement", "machine-order", "custom-sort",
    "thread-reordering", "drag-regressions", "pr-number", "pr-status",
    "new-thread-routing", "selected-title-color", "stage-shortcuts", "model-mentions", "stage-previews",
  ]);
  const sidebarIds = new Set(grouped[2].map((suite) => suite.id));
  for (const id of ["grouping", "child-collapse", "child-stages", "child-rails", "child-reordering",
    "collapsed-preview", "sticky-thread-surfaces", "thread-hover-response", "thread-row-layout", "title-lane"]) {
    assert.ok(sidebarIds.has(id), `${id} stays with the shared child and layout state`);
  }
  assert.deepEqual(groupSuites(suites), suites);
});

test("new suites join the sidebar group and misspelled groups fail discovery", async (t) => {
  const root = await directory(t);
  await add(root, "new", { id: "new", cases: ["one"], plugins: [] });
  const suites = selectSuites(await discoverSuites(root), []);
  assert.deepEqual(groupSuites(suites, "sidebar"), suites);
  await add(root, "typo", { id: "typo", cases: ["one"], plugins: [], group: "sidebaar" });
  await assert.rejects(discoverSuites(root), /Invalid E2E suite.*typo/);
});

test("group selectors list cases without starting bb and reject empty selections", async () => {
  const { execFileSync } = await import("node:child_process");
  const run = (...args) => execFileSync(process.execPath,
    ["scripts/e2e/run.mjs", "--list", ...args], { encoding: "utf8", stdio: "pipe" });
  assert.equal(run("--group", "placement", "--case", "stage-placement:default-order"),
    "stage-placement:default-order\n");
  assert.throws(() => run("--group", "missing"), /Unknown E2E group missing/);
  assert.throws(() => run("--group", "sidebar", "--case", "stage-placement:default-order"),
    /No E2E cases selected/);
  assert.throws(() => run("--group"), /--group requires a value/);
  assert.throws(() => run("--group", "sidebar", "--group", "placement"),
    /--group may only be supplied once/);
});
