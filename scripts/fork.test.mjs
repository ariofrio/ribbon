import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  checkProblems,
  mergeFile,
  plan,
  readFork,
  toLocal,
  toUpstream,
  vendorRef,
} from "./fork.mjs";

const fork = {
  path: "plugins/thread-list",
  map: { "": "src/", "skills/": "skills/" },
  owned: ["package.json", "tsconfig.json", "vitest.config.ts"],
};

const buffer = (text) => Buffer.from(text);
const tree = (entries) =>
  new Map(Object.entries(entries).map(([path, text]) => [path, buffer(text)]));

test("upstream paths land under src/ except the prefixes mapped elsewhere", () => {
  assert.equal(toLocal("app.tsx", fork), "src/app.tsx");
  assert.equal(toLocal("app/list/ProjectList.tsx", fork), "src/app/list/ProjectList.tsx");
  assert.equal(toLocal("skills/thread-list/SKILL.md", fork), "skills/thread-list/SKILL.md");
  assert.equal(toLocal("package.json", fork), null, "owned files are not synced");
});

test("the mapping inverts, and the fork's own files have no upstream path", () => {
  for (const path of ["app.tsx", "app/list/ProjectList.tsx", "skills/thread-list/SKILL.md"]) {
    assert.equal(toUpstream(toLocal(path, fork), fork), path);
  }
  assert.equal(toUpstream("package.json", fork), null);
  assert.equal(toUpstream("README.md", fork), null);
  assert.equal(toUpstream("assets/icon.svg", fork), null);
  assert.equal(toUpstream("src/package.json", fork), null, "an owned name under src/ is still owned");
});

test("plan: upstream unchanged leaves the fork alone, whatever it did", () => {
  const base = tree({ "a.ts": "1", "b.ts": "1" });
  const next = tree({ "a.ts": "1", "b.ts": "1" });
  const ours = tree({ "a.ts": "fork", "c.ts": "fork-only" }); // b.ts deleted here
  assert.deepEqual(plan({ base, next, ours, fork }), []);
});

test("plan: a file the fork left as upstream had it takes upstream's new version", () => {
  const actions = plan({
    base: tree({ "a.ts": "1" }),
    next: tree({ "a.ts": "2" }),
    ours: tree({ "a.ts": "1" }),
    fork,
  });
  assert.deepEqual(actions, [
    { kind: "update", upstream: "a.ts", local: "src/a.ts", contents: buffer("2") },
  ]);
});

test("plan: a file both sides changed is merged; one already at upstream's version is not", () => {
  const actions = plan({
    base: tree({ "a.ts": "1", "b.ts": "1" }),
    next: tree({ "a.ts": "2", "b.ts": "2" }),
    ours: tree({ "a.ts": "fork", "b.ts": "2" }),
    fork,
  });
  assert.deepEqual(
    actions.map(({ kind, upstream }) => [kind, upstream]),
    [["merge", "a.ts"]],
  );
});

test("plan: additions and deletions follow upstream unless the fork touched the file", () => {
  const actions = plan({
    base: tree({ "gone.ts": "1", "edited-then-gone.ts": "1", "we-deleted.ts": "1" }),
    next: tree({ "new.ts": "n", "we-deleted.ts": "2" }),
    ours: tree({ "gone.ts": "1", "edited-then-gone.ts": "fork" }),
    fork,
  });
  assert.deepEqual(
    actions.map(({ kind, upstream }) => [kind, upstream]),
    [
      ["deleted-upstream", "edited-then-gone.ts"],
      ["delete", "gone.ts"],
      ["add", "new.ts"],
      ["deleted-here", "we-deleted.ts"],
    ],
  );
});

test("plan: owned files are reported when upstream changes them, never written", () => {
  const actions = plan({
    base: tree({ "package.json": "{}", "tsconfig.json": "{}" }),
    next: tree({ "package.json": "{ }", "tsconfig.json": "{}" }),
    ours: tree({}),
    fork,
  });
  assert.deepEqual(actions, [{ kind: "owned-changed", upstream: "package.json" }]);
});

test("mergeFile: disjoint edits combine; overlapping ones leave a conflict", () => {
  const clean = mergeFile({
    base: buffer("a\nb\nc\nd\ne\n"),
    next: buffer("a\nB\nc\nd\ne\n"),
    ours: buffer("a\nb\nc\nd\nE\n"),
  });
  assert.equal(clean.conflicts, 0);
  assert.equal(clean.contents.toString(), "a\nB\nc\nd\nE\n");

  const clash = mergeFile({
    base: buffer("a\nb\nc\n"),
    next: buffer("a\nB\nc\n"),
    ours: buffer("a\nbee\nc\n"),
  });
  assert.equal(clash.conflicts, 1);
  assert.match(clash.contents.toString(), /<<<<<<< fork\n/u);
  assert.match(clash.contents.toString(), />>>>>>> upstream \(new\)\n/u);
});

test("readFork keys the fork's files by upstream path and skips what has none", () => {
  const root = mkdtempSync(join(tmpdir(), "fork-"));
  const files = {
    "plugins/p/src/app.tsx": "app",
    "plugins/p/src/app/x.ts": "x",
    "plugins/p/skills/s/SKILL.md": "skill",
    "plugins/p/package.json": "{}",
    "plugins/p/README.md": "readme",
    "plugins/p/node_modules/dep/index.js": "dep",
  };
  for (const [path, contents] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), contents);
  }
  const ours = readFork(root, "plugins/p", fork);
  assert.deepEqual([...ours.keys()].sort(), ["app.tsx", "app/x.ts", "skills/s/SKILL.md"]);
});

test("--check ties the fork pin to the lock and to the vendored-UI release", () => {
  const vendorConfig = {
    registry:
      "https://raw.githubusercontent.com/get-bb/bb/desktop-v0.44.0/packages/plugin-registry/r/{name}.json",
  };
  assert.equal(vendorRef(vendorConfig), "desktop-v0.44.0");
  const config = { ref: "desktop-v0.44.0", forks: {} };
  assert.deepEqual(
    checkProblems({ config, lock: { ref: "desktop-v0.44.0", files: {} }, vendorConfig }),
    [],
  );
  assert.match(
    checkProblems({ config, lock: { ref: "desktop-v0.43.4", files: {} }, vendorConfig })[0],
    /pin moved without a sync/u,
  );
  assert.match(
    checkProblems({ config: { ...config, ref: "desktop-v0.45.0" }, lock: { ref: "desktop-v0.45.0" }, vendorConfig })[0],
    /vendor-ui\.json vendors components from desktop-v0\.44\.0/u,
  );
  assert.match(checkProblems({ config, lock: null, vendorConfig })[0], /No fork\.lock\.json/u);
});
