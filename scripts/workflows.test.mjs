// A workflow listening for both `push` and `pull_request` runs every job twice
// for a branch in this repository, since one push raises both events. Only a
// fork needs both unrestricted: there `push` fires in the fork and
// `pull_request` fires here, so neither one duplicates the other.
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

const files = readdirSync(workflows).filter((name) => name.endsWith(".yml"));

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
