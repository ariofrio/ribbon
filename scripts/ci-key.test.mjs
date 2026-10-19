import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";
import { validationKey } from "./ci-key.mjs";

const entry = (path, hash = "a".repeat(40), mode = "100644") =>
  `${mode} blob ${hash}\t${path}\0`;
const source = entry("plugins/x/src/app.tsx");

test("recaptured screenshots retain a validation key", () => {
  for (const path of [
    "assets/hero-dark.png", "assets/hero-light.png",
    "plugins/x/assets/screenshot-dark.png", "plugins/x/assets/card-light.png",
    "plugins/x/assets/card-beside-dark.png",
  ]) {
    assert.equal(validationKey(source + entry(path)), validationKey(source), path);
  }
});

test("source, workflows, dependencies, icons, and unrecognized images change the key", () => {
  for (const path of [
    "plugins/x/src/app.tsx", ".github/workflows/plugins.yml",
    ".github/workflows/screenshots.yml", "package-lock.json",
    "plugins/x/assets/icon.svg", "plugins/x/assets/other.png", "assets/other.png",
  ]) {
    assert.notEqual(validationKey(source + entry(path)), validationKey(source), path);
  }
});

test("file contents, names, and executable modes are validation inputs", () => {
  for (const changed of [
    entry("plugins/x/src/app.tsx", "b".repeat(40)),
    entry("plugins/x/src/renamed.tsx"),
    entry("plugins/x/src/app.tsx", "a".repeat(40), "100755"),
  ]) assert.notEqual(validationKey(changed), validationKey(source));
});

test("real Git trees keep the key across recapture and invalidate it for a changed merge tree", (t) => {
  const root = resolve(".scratch/work");
  mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "ci-key-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const git = (args) => execFileSync("git", args, { cwd: directory, encoding: "utf8" });
  const key = () => validationKey(git(["ls-tree", "-r", "-z", "HEAD"]));
  git(["init", "--quiet"]);
  git(["config", "user.name", "CI key test"]);
  git(["config", "user.email", "ci@example.test"]);
  mkdirSync(join(directory, "assets"));
  writeFileSync(join(directory, "app.js"), "source\n");
  writeFileSync(join(directory, "assets/hero-dark.png"), "old image\n");
  git(["add", "."]);
  git(["commit", "--quiet", "-m", "initial"]);
  const original = key();
  const originalTree = git(["rev-parse", "HEAD^{tree}"]);
  writeFileSync(join(directory, "assets/hero-dark.png"), "recaptured image\n");
  git(["commit", "--quiet", "-am", "recapture"]);
  assert.equal(key(), original);
  // The renderer cache includes images, so a manual image edit is a miss.
  assert.notEqual(git(["rev-parse", "HEAD^{tree}"]), originalTree);
  writeFileSync(join(directory, "base.js"), "new base-branch input\n");
  git(["add", "."]);
  git(["commit", "--quiet", "-m", "updated merge tree"]);
  assert.notEqual(key(), original);
});
