// Fails when a Tailwind arbitrary variant the plugin's source uses is missing
// from the stylesheet the build produced.
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

/** Tailwind arbitrary variants — `[&...]:utility` — written in source. */
export function arbitraryVariants(source) {
  return [...source.matchAll(/\[&[^\]\s"'`]*\]:[A-Za-z0-9_\-[\]/.]+/gu)].map(
    (match) => match[0],
  );
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

if (process.argv[1] !== undefined) {
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
  console.log(
    `Every arbitrary variant in source reached the stylesheet (${new Set(used).size} checked).`,
  );
}
