import assert from "node:assert/strict";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
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

test("a node_modules/.bin shim is followed to the CLI it links to", () => {
  // The only bb in CI is this shim, since bb-app is a devDependency and nothing
  // installs the desktop app. Its target is absolute and outside .bin, so it is
  // safe to hand to a child as BB_CLI.
  const real = fakeBbDirectory();
  const shim = fakeBbDirectory("node_modules/.bin");
  rmSync(shim.path);
  symlinkSync(real.path, shim.path);
  process.env.BB_CLI = shim.path;
  process.env.PATH = "/nonexistent-for-this-test";
  assert.equal(resolveBbCli(), realpathSync(real.path));
});

test("a shim that links nowhere is refused rather than returned", () => {
  const shim = fakeBbDirectory("node_modules/.bin");
  rmSync(shim.path);
  symlinkSync(join(shim.directory, "absent"), shim.path);
  process.env.BB_CLI = shim.path;
  process.env.PATH = "/nonexistent-for-this-test";
  assert.throws(() => resolveBbCli(), /absolute path/u);
});

test("without BB_CLI it resolves an absolute path from PATH", () => {
  const { directory, path } = fakeBbDirectory();
  delete process.env.BB_CLI;
  process.env.PATH = directory;
  assert.equal(resolveBbCli(), path);
});

test("a shim on PATH resolves to its target, not to the shim path", () => {
  const real = fakeBbDirectory();
  const shim = fakeBbDirectory("node_modules/.bin");
  rmSync(shim.path);
  symlinkSync(real.path, shim.path);
  delete process.env.BB_CLI;
  process.env.PATH = shim.directory;
  assert.equal(resolveBbCli(), realpathSync(real.path));
});

test("no bb anywhere is an explicit failure, not a bare name", () => {
  delete process.env.BB_CLI;
  process.env.PATH = "/nonexistent-for-this-test";
  assert.throws(() => resolveBbCli(), /not found on PATH/u);
});

test("a shim linking to bb-app's launcher resolves past it to the CLI", () => {
  // node_modules/.bin/bb links to bb-app/dist/bb.js, which re-reads BB_CLI and
  // spawns it — handing that back would make the launcher spawn itself.
  const root = mkdtempSync(join(tmpdir(), "bb-cli-"));
  const launcher = join(root, "node_modules", "bb-app", "dist", "bb.js");
  const cli = join(root, "node_modules", "bb-app", "host-daemon", "dist", "bb");
  for (const p of [launcher, cli]) {
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, "#!/bin/sh\nexit 0\n");
    chmodSync(p, 0o755);
  }
  const shimDir = join(root, "node_modules", ".bin");
  mkdirSync(shimDir, { recursive: true });
  const shim = join(shimDir, "bb");
  symlinkSync(launcher, shim);

  process.env.BB_CLI = shim;
  process.env.PATH = "/nonexistent-for-this-test";
  assert.equal(resolveBbCli(), realpathSync(cli));
});

test("a launcher with no CLI beside it is refused, not returned", () => {
  const root = mkdtempSync(join(tmpdir(), "bb-cli-"));
  const launcher = join(root, "node_modules", "bb-app", "dist", "bb.js");
  mkdirSync(dirname(launcher), { recursive: true });
  writeFileSync(launcher, "#!/bin/sh\nexit 0\n");
  chmodSync(launcher, 0o755);
  process.env.BB_CLI = launcher;
  process.env.PATH = "/nonexistent-for-this-test";
  assert.throws(() => resolveBbCli(), /absolute path/u);
});
