// Checks the plugin layout rules that a reader could otherwise only learn by
// copying another plugin, which is how two of them drifted.
//
//   npm run check:layout
import {
  existsSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Packaging and tooling configuration npm and each tool require in the root. */
const ROOT_FILES = new Set([
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "README.md",
  "CHANGELOG.md",
  "LICENSE",
  "vitest.config.ts",
]);

/** What a plugin may keep beside `src/`, plus what tooling writes there. */
const ROOT_DIRECTORIES = new Set([
  "src",
  "assets",
  "skills",
  "themes",
  "scripts",
  "dist",
  "node_modules",
  ".claude",
]);

const TEST_SOURCE = /\.test\.[jt]sx?$/u;
const SHIPPED_SCREENSHOT = /^(screenshot|card).*\.png$/u;

/**
 * Title Case is every word capitalized, which is what a reader notices. A
 * first word that is a proper noun — ChatGPT — is not that, so only the words
 * after it decide.
 */
function isTitleCase(name) {
  const words = name.trim().split(/\s+/u);
  return words.length > 1 && words.slice(1).every((word) => /^[A-Z]/u.test(word));
}

/**
 * Every rule broken by one plugin, as sentences naming what to change.
 *
 * Pure, so the CLI below reads the plugin off disk and this stays testable.
 */
export function layoutProblems({
  manifest,
  tsconfig,
  rootEntries,
  sources,
  assets,
  importsAlias,
  testsImportAlias,
  vitestMapsAlias,
}) {
  const problems = [];
  const bb = manifest.bb;
  if (bb === undefined) return ["package.json has no bb block"];

  if (typeof bb.name === "string" && isTitleCase(bb.name)) {
    problems.push(`bb.name "${bb.name}" is Title Case; write plugin names in sentence case`);
  }
  for (const entry of ["server", "app"]) {
    const value = bb[entry];
    if (typeof value === "string" && !value.startsWith("./src/")) {
      problems.push(`bb.${entry} is ${value}; every TypeScript source belongs under src/`);
    }
  }

  const alias = tsconfig?.compilerOptions?.paths?.["@/*"];
  if (importsAlias && (alias === undefined || alias[0] !== "./src/*")) {
    problems.push('sources import "@/", so tsconfig needs paths "@/*": ["./src/*"]');
  }
  // vitest does not read the tsconfig path, so a test importing through the
  // alias resolves only if the plugin maps it again for vitest.
  if (testsImportAlias && !vitestMapsAlias) {
    problems.push('tests import "@/", so vitest.config.ts must map "@" to src/; vitest does not read the tsconfig path');
  }

  const files = manifest.files ?? [];
  if (sources.some((path) => TEST_SOURCE.test(path))) {
    for (const pattern of ['!src/**/*.test.ts', '!src/**/*.test.tsx']) {
      if (!files.includes(pattern)) {
        problems.push(`files ships this plugin's tests; add ${pattern}`);
      }
    }
  }
  if (assets.some((name) => SHIPPED_SCREENSHOT.test(name))) {
    for (const pattern of ['!assets/screenshot*.png', '!assets/card*.png']) {
      if (!files.includes(pattern)) {
        problems.push(`files ships this plugin's README screenshots; add ${pattern}`);
      }
    }
  }

  for (const entry of rootEntries) {
    if (ROOT_FILES.has(entry) || ROOT_DIRECTORIES.has(entry)) continue;
    problems.push(`${entry} is in the plugin root; only packaging and tooling configuration belongs there`);
  }
  return problems;
}

/** tsconfig.json is JSON with comments often enough to strip them here. */
/**
 * Files a plugin has to keep its own copy of, and what makes each copy needed.
 * LICENSE ships in every tarball, and npm drops a symlinked one without a
 * word. vitest.config.ts has to sit where vitest is installed, which is the
 * plugin rather than the repository root.
 */
const REPLICATED = [
  { field: "license", name: "LICENSE", everywhere: true },
  { field: "vitestConfig", name: "vitest.config.ts", everywhere: false },
];

/** Rules that only a second plugin can break. */
export function sharedFileProblems(plugins) {
  const problems = [];
  for (const { field, name, everywhere } of REPLICATED) {
    if (everywhere) {
      for (const plugin of plugins.filter((each) => each[field] == null)) {
        problems.push(`${plugin.id}: has no ${name}, and npm ships one in every package`);
      }
    }
    const [reference, ...rest] = plugins.filter((each) => each[field] != null);
    if (reference === undefined) continue;
    for (const plugin of rest) {
      if (plugin[field] !== reference[field]) {
        problems.push(`${plugin.id}: ${name} differs from ${reference.id}`);
      }
    }
  }
  return problems;
}

function read(path) {
  if (!existsSync(path)) return null;
  const text = readFileSync(path, "utf8").replace(/^\s*\/\/.*$/gmu, "");
  return JSON.parse(text);
}

function walk(directory, files = []) {
  if (!existsSync(directory)) return files;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) walk(path, files);
    else files.push(path);
  }
  return files;
}

export function readPlugin(pluginDirectory) {
  const sources = walk(join(pluginDirectory, "src")).map((path) =>
    relative(pluginDirectory, path),
  );
  const importsFrom = (path) =>
    /from\s+["']@\//u.test(readFileSync(join(pluginDirectory, path), "utf8"));
  const vitestConfig = join(pluginDirectory, "vitest.config.ts");
  return {
    id: relative(dirname(pluginDirectory), pluginDirectory),
    manifest: read(join(pluginDirectory, "package.json")) ?? {},
    tsconfig: read(join(pluginDirectory, "tsconfig.json")),
    testsImportAlias: sources.some(
      (path) => TEST_SOURCE.test(path) && importsFrom(path),
    ),
    vitestMapsAlias:
      existsSync(vitestConfig) &&
      /["']@["']\s*:/u.test(readFileSync(vitestConfig, "utf8")),
    rootEntries: readdirSync(pluginDirectory),
    sources,
    license: existsSync(join(pluginDirectory, "LICENSE"))
      ? readFileSync(join(pluginDirectory, "LICENSE"), "utf8")
      : null,
    vitestConfig: existsSync(vitestConfig)
      ? readFileSync(vitestConfig, "utf8")
      : null,
    assets: existsSync(join(pluginDirectory, "assets"))
      ? readdirSync(join(pluginDirectory, "assets"))
      : [],
    importsAlias: sources.some(
      (path) => !TEST_SOURCE.test(path) && importsFrom(path),
    ),
  };
}

// realpathSync on both sides: Node resolves import.meta.url through symlinks
// and leaves process.argv[1] as typed, so on a symlinked path they differ, the
// body is skipped, and the check exits 0 having verified nothing.
if (realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const plugins = join(repositoryRoot, "plugins");
  const reported = [];
  const checked = [];
  const read_ = [];
  for (const id of readdirSync(plugins)) {
    const directory = join(plugins, id);
    if (!statSync(directory).isDirectory()) continue;
    if (!existsSync(join(directory, "package.json"))) continue;
    checked.push(id);
    const plugin = readPlugin(directory);
    read_.push(plugin);
    for (const problem of layoutProblems(plugin)) {
      reported.push(`${id}: ${problem}`);
    }
  }
  reported.push(...sharedFileProblems(read_));
  if (reported.length > 0) {
    process.stderr.write(
      `Plugin layout problems:\n${reported.map((line) => `  ${line}`).join("\n")}\n`,
    );
    process.exit(1);
  }
  console.log(`${checked.length} plugin layouts are correct.`);
}
