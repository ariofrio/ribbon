import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import test from "node:test";
import { discoverSuites, selectSuites } from "./e2e/suites.mjs";

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
