// Fails when a Tailwind arbitrary variant the plugin's source uses is missing
// from the stylesheet the build produced, or when the stylesheet tests an
// ancestor in a shape Chromium cannot invalidate narrowly (see
// unqualifiedGroupHas).
//
// A plugin that reaches past a component's props and styles it by class —
// `[&>svg]:hidden` to drop a glyph bb draws for itself, say — has no test that
// can see the result: jsdom applies no CSS, and the markup reads correctly
// either way. The class simply stops taking effect, silently, and the only
// evidence is a screenshot nobody is comparing.
//
// This closes a narrow part of that gap, and it is worth being exact about
// which part, because testing it disproved the obvious claim. It cannot catch a
// class the scanner never sees — one assembled at runtime is invisible to
// Tailwind and equally invisible here, so the two fail together and agree. What
// it catches is a literal both do see that Tailwind then declines to emit: a
// misspelled or unsupported utility, or a file that has fallen out of the
// content scan. Verified by breaking each in turn.
//
// Whether the selector still names the element it means is a question for a DOM
// test — filter-row-glyphs.test.tsx asks it — and whether the rule takes effect
// is a question only a capture can answer.
//
// Usage: node scripts/verify-styles.mjs [pluginDir]
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Tailwind arbitrary variants — `[&...]:utility`, or `[ancestor_&]:utility` —
 * written in source.
 */
export function arbitraryVariants(source) {
  return [
    ...source.matchAll(
      /\[[^\]\s"'`&]*&[^\]\s"'`]*\]:[A-Za-z0-9_\-[\]/.()]+/gu,
    ),
  ].map((match) => withoutUnopenedParens(match[0]));
}

/** Drops the closing parentheses of a call the class literal sits in. */
function withoutUnopenedParens(name) {
  let unopened =
    (name.match(/\)/gu) ?? []).length - (name.match(/\(/gu) ?? []).length;
  let end = name.length;
  while (unopened > 0 && name[end - 1] === ")") {
    end -= 1;
    unopened -= 1;
  }
  return name.slice(0, end);
}

/**
 * Selectors that test an ancestor with `:has()` inside a wildcard `:is()` —
 * what Tailwind's `group-has-*` variants compile to. Chromium cannot tell
 * which elements such a rule can change, so every node inserted anywhere
 * below the plugin's root restyles and relays out that whole subtree: in the
 * sidebar that put tens of milliseconds into each layout bb forces while it
 * switches threads or the composer changes. Name the ancestor first instead,
 * `[:where(.row):has(:focus-visible)_&]:utility`, which matches the same
 * elements with the same specificity.
 */
export function unqualifiedGroupHas(stylesheet) {
  const found = [];
  let start = 0;
  let depth = 0;
  for (let index = 0; index < stylesheet.length; index += 1) {
    const char = stylesheet[index];
    if (char === "\\") {
      index += 1;
    } else if (char === "(" || char === "[") {
      depth += 1;
    } else if (char === ")" || char === "]") {
      depth -= 1;
    } else if (depth === 0 && (char === "{" || char === "}" || char === ";")) {
      if (char === "{") {
        for (const selector of topLevelList(stylesheet.slice(start, index))) {
          if (/:is\([^{]*:has\([^{]*\s\*\)/u.test(selector)) {
            found.push(selector.trim());
          }
        }
      }
      start = index + 1;
    }
  }
  return found;
}

function topLevelList(prelude) {
  const parts = [];
  let start = 0;
  let depth = 0;
  for (let index = 0; index < prelude.length; index += 1) {
    const char = prelude[index];
    if (char === "\\") index += 1;
    else if (char === "(" || char === "[") depth += 1;
    else if (char === ")" || char === "]") depth -= 1;
    else if (char === "," && depth === 0) {
      parts.push(prelude.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(prelude.slice(start));
  return parts;
}

/**
 * Tailwind escapes these heavily in the emitted selector, so compare against
 * the stylesheet with its backslashes removed rather than trying to reproduce
 * the escaping.
 */
export function missingFrom(stylesheet, classes) {
  const unescaped = stylesheet.replace(/\\/gu, "");
  return [...new Set(classes)].filter((name) => !unescaped.includes(name));
}

function sourceFiles(directory) {
  let entries;
  try {
    entries = readdirSync(directory, { recursive: true, withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isFile() && /\.tsx?$/u.test(entry.name))
    .filter((entry) => !/\.test\.tsx?$/u.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name));
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] ?? "")).href) {
  const pluginDirectory = resolve(process.argv[2] ?? process.cwd());
  const manifest = JSON.parse(
    readFileSync(join(pluginDirectory, "package.json"), "utf8"),
  );
  if (manifest.bb?.app === undefined) {
    console.log("No frontend bundle; nothing to verify.");
    process.exit(0);
  }

  let stylesheet;
  try {
    stylesheet = readFileSync(join(pluginDirectory, "dist/app.css"), "utf8");
  } catch {
    process.stderr.write(
      "No dist/app.css. Run the build before verifying its styles.\n",
    );
    process.exit(1);
  }

  const used = sourceFiles(join(pluginDirectory, "src")).flatMap((file) =>
    arbitraryVariants(readFileSync(file, "utf8")),
  );
  const missing = missingFrom(stylesheet, used);
  if (missing.length > 0) {
    process.stderr.write(
      `These arbitrary variants are used in source but absent from dist/app.css, so they style nothing:\n${missing
        .map((name) => `  ${name}`)
        .join("\n")}\n`,
    );
    process.exit(1);
  }
  const unqualified = unqualifiedGroupHas(stylesheet);
  if (unqualified.length > 0) {
    process.stderr.write(
      `These selectors test an ancestor with :has() inside a wildcard :is(), which restyles the plugin's whole subtree on every DOM insertion. Write the variant as [:where(.ancestor):has(...)_&]:utility instead:\n${unqualified
        .map((selector) => `  ${selector}`)
        .join("\n")}\n`,
    );
    process.exit(1);
  }
  console.log(
    `Every arbitrary variant in source reached the stylesheet (${new Set(used).size} checked).`,
  );
}
