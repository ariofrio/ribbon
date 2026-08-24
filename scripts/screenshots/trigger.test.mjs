// What decides whether a push recaptures.
//
// The capture is its own check: the workflow renders every shot and commits
// whatever came out different, so nothing records what a screenshot was
// captured from. That leaves the trigger's own path filter as the whole gate,
// and a filter that misses an input is a screenshot that quietly stays stale
// until some later push happens to touch a path that is covered.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const workflow = readFileSync(
  join(repositoryRoot, ".github/workflows/screenshots.yml"),
  "utf8",
);

/** The `paths:` list under the workflow's push trigger, in order. */
function triggerPaths() {
  const lines = workflow.split("\n");
  const start = lines.findIndex((line) => /^\s*paths:\s*$/u.test(line));
  assert.notEqual(start, -1, "the push trigger has no paths filter");
  const patterns = [];
  for (const line of lines.slice(start + 1)) {
    // The list is commented between its entries, and a comment is not the end
    // of it. Anything that is neither an entry nor a comment is.
    if (/^\s*#/u.test(line)) continue;
    const item = /^\s*-\s+(.+?)\s*$/u.exec(line);
    if (item === null) break;
    patterns.push(item[1].replace(/^["']|["']$/gu, ""));
  }
  return patterns;
}

/**
 * GitHub's own filter syntax, which is narrower than a shell glob: `*` matches
 * anything but a slash, `**` matches across slashes, and a `!` pattern removes
 * what the patterns before it added. Last match wins.
 */
function expand(pattern) {
  let source = "";
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (character === "*") {
      if (pattern[index + 1] === "*") {
        source += ".*";
        index += 1;
        if (pattern[index + 1] === "/") index += 1;
      } else source += "[^/]*";
    } else if (character === "?") source += "[^/]";
    else source += character.replace(/[.+^${}()|[\]\\]/gu, "\\$&");
  }
  return new RegExp(`^${source}$`, "u");
}

const patterns = triggerPaths().map((pattern) => ({
  negated: pattern.startsWith("!"),
  test: expand(pattern.replace(/^!/u, "")),
}));

function capturesOn(path) {
  let captures = false;
  for (const pattern of patterns) {
    if (pattern.test.test(path)) captures = !pattern.negated;
  }
  return captures;
}

const plugins = readdirSync(join(repositoryRoot, "plugins"));

test("a plugin's own source recaptures", () => {
  assert.ok(plugins.length > 0, "no plugins to check");
  for (const plugin of plugins) {
    assert.ok(
      capturesOn(`plugins/${plugin}/src/app.tsx`),
      `plugins/${plugin}/src is not covered`,
    );
  }
});

// A dependency bump can move what a plugin draws, which is why the digest this
// replaced hashed the manifest too.
test("a plugin's manifest recaptures", () => {
  for (const plugin of plugins) {
    assert.ok(capturesOn(`plugins/${plugin}/package.json`));
  }
});

test("the harness that frames every shot recaptures", () => {
  assert.ok(capturesOn("scripts/screenshots/shots.mjs"));
  assert.ok(capturesOn("scripts/screenshots/capture.mjs"));
  // bb itself is pinned here, and a new bb redraws every window.
  assert.ok(capturesOn("scripts/screenshots/package.json"));
  assert.ok(capturesOn("scripts/screenshots/package-lock.json"));
});

// The container's tag tracks the playwright version, which decides the
// Chromium on disk, which decides how every glyph is rasterised.
test("the pinned Chromium recaptures", () => {
  assert.ok(capturesOn("package-lock.json"));
  assert.ok(capturesOn(".github/workflows/screenshots.yml"));
});

// A test is neither shipped nor bundled, so editing one cannot move a pixel.
// Charging it a full capture costs five minutes to redraw an identical set.
test("a test does not recapture", () => {
  for (const name of ["app.test.ts", "app.test.tsx", "route.test.ts"]) {
    assert.equal(
      capturesOn(`plugins/${plugins[0]}/src/${name}`),
      false,
      `${name} should not recapture`,
    );
  }
  assert.equal(capturesOn("scripts/screenshots/capture.test.mjs"), false);
});

test("prose does not recapture", () => {
  assert.equal(capturesOn("README.md"), false);
  assert.equal(capturesOn(`plugins/${plugins[0]}/README.md`), false);
  assert.equal(capturesOn(".changeset/wide-personal-bubble.md"), false);
  assert.equal(capturesOn("AGENTS.md"), false);
});
