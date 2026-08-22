import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { afterEach } from "node:test";

import { resolveBbCli } from "./bb-cli.mjs";

const originalEnv = { BB_CLI: process.env.BB_CLI, PATH: process.env.PATH };

afterEach(() => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

/** A directory holding an executable named `bb`, as a PATH entry would. */
function fakeBbDirectory(nested = "") {
  const root = mkdtempSync(join(tmpdir(), "bb-cli-"));
  const directory = nested === "" ? root : join(root, ...nested.split("/"));
  mkdirSync(directory, { recursive: true });
  const path = join(directory, "bb");
  writeFileSync(path, "#!/bin/sh\nexit 0\n");
  chmodSync(path, 0o755);
  return { directory, path };
}

test("an absolute BB_CLI is used as given", () => {
  const { path } = fakeBbDirectory();
  process.env.BB_CLI = path;
  assert.equal(resolveBbCli(), path);
});

test("a bare BB_CLI is refused — it is what makes the launcher spawn itself", () => {
  const { directory } = fakeBbDirectory();
  process.env.BB_CLI = "bb";
  process.env.PATH = "/nonexistent-for-this-test";
  assert.throws(() => resolveBbCli(), /absolute path/u);
  // With a real bb on PATH it resolves rather than throwing, but never to the
  // bare name it was handed.
  process.env.PATH = directory;
  assert.notEqual(resolveBbCli(), "bb");
});

test("a node_modules/.bin shim is refused, since it re-enters the launcher", () => {
  const { path } = fakeBbDirectory("node_modules/.bin");
  process.env.BB_CLI = path;
  process.env.PATH = "/nonexistent-for-this-test";
  assert.throws(() => resolveBbCli(), /absolute path/u);
});

test("without BB_CLI it resolves an absolute path from PATH", () => {
  const { directory, path } = fakeBbDirectory();
  delete process.env.BB_CLI;
  process.env.PATH = directory;
  assert.equal(resolveBbCli(), path);
});

test("a shim earlier on PATH is skipped in favour of the real CLI", () => {
  const shim = fakeBbDirectory("node_modules/.bin");
  const real = fakeBbDirectory();
  delete process.env.BB_CLI;
  process.env.PATH = `${shim.directory}:${real.directory}`;
  assert.equal(resolveBbCli(), real.path);
});

test("no bb anywhere is an explicit failure, not a bare name", () => {
  delete process.env.BB_CLI;
  process.env.PATH = "/nonexistent-for-this-test";
  assert.throws(() => resolveBbCli(), /not found on PATH/u);
});
