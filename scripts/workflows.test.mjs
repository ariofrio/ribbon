// Two things the workflow files have to get right: no job may run twice for
// one push, and the job the ruleset requires by name has to wait for the jobs
// that do the work.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const workflows = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../.github/workflows",
);

/** The lines under a top-level key, by the indentation that follows it. */
function block(lines, start) {
  const body = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trim() === "" || /^\s*#/u.test(line)) continue;
    if (!/^\s/u.test(line)) break;
    body.push(line);
  }
  return body;
}

/** Each event a workflow listens for, and the lines qualifying it. */
function triggers(source) {
  const lines = source.split("\n");
  const start = lines.findIndex((line) => /^on:\s*$/u.test(line));
  assert.notEqual(start, -1, "no top-level `on:` block");
  const events = new Map();
  const body = block(lines, start);
  for (const [index, line] of body.entries()) {
    const event = /^ {2}(\w+):/u.exec(line);
    if (event === null) continue;
    events.set(
      event[1],
      block(body, index).filter((nested) => /^ {4,}/u.test(nested)),
    );
  }
  return events;
}

/** Every job in a workflow, and the jobs each one waits for. */
function jobs(source) {
  const lines = source.split("\n");
  const start = lines.findIndex((line) => /^jobs:\s*$/u.test(line));
  assert.notEqual(start, -1, "no top-level `jobs:` block");
  const body = block(lines, start);
  const found = new Map();
  let current = null;
  for (const line of body) {
    const job = /^ {2}([\w-]+):/u.exec(line);
    if (job !== null) {
      current = job[1];
      found.set(current, []);
      continue;
    }
    const needs = /^ {4}needs:\s*\[(.*)\]/u.exec(line);
    if (needs !== null && current !== null) {
      found.set(
        current,
        needs[1].split(",").map((name) => name.trim()).filter(Boolean),
      );
    }
  }
  return found;
}

const files = readdirSync(workflows).filter((name) => name.endsWith(".yml"));

// The ruleset requires `plugins` by name, so a job it does not wait for is a
// job nothing requires.
test("the required gate waits for every other job in Plugins", () => {
  const found = jobs(readFileSync(join(workflows, "plugins.yml"), "utf8"));
  assert.ok(found.has("plugins"), "Plugins has no `plugins` gate job");

  const reached = new Set();
  const walk = (name) => {
    for (const need of found.get(name) ?? []) {
      if (reached.has(need)) continue;
      reached.add(need);
      walk(need);
    }
  };
  walk("plugins");

  const unguarded = [...found.keys()].filter(
    (name) => name !== "plugins" && !reached.has(name),
  );
  assert.deepEqual(
    unguarded,
    [],
    `these jobs are not required, because the gate does not wait for them: ${unguarded.join(", ")}`,
  );
});

test("no workflow runs twice for one push to a branch here", () => {
  assert.ok(files.length > 0, "no workflows found");
  for (const file of files) {
    const events = triggers(readFileSync(join(workflows, file), "utf8"));
    if (!events.has("push") || !events.has("pull_request")) continue;
    assert.match(
      events.get("push").join("\n"),
      /branches:/u,
      `${file} listens for both push and pull_request, so it runs every job twice for a branch in this repository. Restrict its push trigger to a branch.`,
    );
  }
});
