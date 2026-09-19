import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { join } from "node:path";
import test from "node:test";
import { seed, THREADS } from "./fixture.mjs";

test("seeding settles each checkout before starting another fixture thread", (t) => {
  mkdirSync(".scratch", { recursive: true });
  const directory = mkdtempSync(join(".scratch", "fixture-test-"));
  const threads = new Map();
  const value = (args, flag) => args[args.indexOf(flag) + 1];
  const mock = t.mock.method(childProcess, "execFileSync", (command, args) => {
    if (command !== "fixture-bb") return "";
    const operation = args.slice(0, 2).join(" ");
    if (operation === "project create") {
      return JSON.stringify({ id: value(args, "--name") });
    }
    if (operation === "thread section") return '{"id":"section"}';
    if (operation === "thread spawn") {
      assert.equal(
        [...threads.values()].some((thread) => thread.status === "starting"),
        false,
        "another fixture is still preparing its checkout",
      );
      const id = `thread-${threads.size}`;
      threads.set(id, {
        status: "starting",
        spec: THREADS.find((spec) => spec.title === value(args, "--title")),
      });
      return JSON.stringify({ id });
    }
    if (operation === "thread wait") {
      const thread = threads.get(args[2]);
      const status = value(args, "--status");
      assert.equal(status, thread.spec.hang ? "active" : "idle");
      thread.status = status;
    }
    return "";
  });
  syncBuiltinESMExports();
  try {
    const fixture = seed({
      stack: { env: { BB_DATA_DIR: directory } },
      workspaceRoot: join(directory, "workspaces"),
      bb: "fixture-bb",
    });
    assert.equal(fixture.threads.size, THREADS.length);
    assert.equal(
      [...threads.values()].filter((thread) => thread.status === "active").length,
      1,
    );
    assert.ok(
      [...threads.values()].every((thread) => thread.status !== "starting"),
    );
  } finally {
    mock.mock.restore();
    syncBuiltinESMExports();
    rmSync(directory, { recursive: true, force: true });
  }
});
