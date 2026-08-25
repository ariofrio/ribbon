// Vendors the bb UI components each plugin uses, from the @bb shadcn registry
// pinned in vendor-ui.json.
//
// The registry is generated verbatim from bb's own packages/shared-ui, so a
// vendored file is a copy of the code running in the window around it. Editing
// one forks bb's UI kit: the next refresh silently reverts the edit, and until
// then the plugin drifts from every other surface. bb exports seams for this —
// CompactViewportOverrideProvider, ResponsiveDrawerShell, MobileTrigger,
// stripRadixContentProps, MENU_ITEM_LAST_HOVERED_CLASS, LIST_HOVER_TRANSITION —
// so compose around a component rather than reaching into it.
//
// This script is therefore the only writer of the files vendor-ui.lock.json
// lists, and `--check` fails on any other hand.
//
// Each plugin declares the items it imports directly; registryDependencies
// supply the rest, the same transitive closure `npx shadcn add` would pull. A
// file that falls out of every closure — as use-pointer-coarse did when
// responsive-overlay stopped importing it at v0.39 — is reported as untracked
// rather than left behind as an orphan nobody notices.
//
// Usage: npm run build:ui       fetch the pinned registry and rewrite
//        npm run check:ui       offline; verify nothing was hand-edited
import { createHash } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
  realpathSync,
} from "node:fs";
import { dirname, join, normalize, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The one directory the generator owns, relative to a plugin's src/. bb's own
 * layout is preserved underneath it, so a registry item's target still decides
 * where it lands — but every vendored file is under a single root, visible in
 * every import, and anything else inside it is an orphan by definition.
 *
 * Registry targets do not agree on a home otherwise: use-media-query and
 * use-browser-dimming-modal are both registry:hook, and land in
 * components/ui/hooks and hooks respectively. Scanning a hardcoded list of
 * such directories would miss whichever one a future item invents.
 */
export const VENDOR_ROOT = "vendor";

export function readConfig(repositoryRoot) {
  return JSON.parse(
    readFileSync(join(repositoryRoot, "vendor-ui.json"), "utf8"),
  );
}

/** The release the registry URL is pinned to, e.g. "0.39.0". */
export function pinnedVersion(config) {
  const match = /desktop-v([^/]+)\//u.exec(config.registry);
  if (match === null) {
    throw new Error(
      `vendor-ui.json registry is not pinned to a desktop-v<version> tag: ${config.registry}`,
    );
  }
  return match[1];
}

/**
 * Every plugin's `bb-app` devDependency, which is what decides the build
 * toolchain and shim configuration a bundle is compiled against. Components
 * vendored from a different release are components the app around them is not
 * running, so the pin has to track this and not drift behind it.
 */
export function bbAppVersions(repositoryRoot, config) {
  const found = new Map();
  for (const pluginDirectory of Object.keys(config.plugins)) {
    let manifest;
    try {
      manifest = JSON.parse(
        readFileSync(join(repositoryRoot, pluginDirectory, "package.json"), "utf8"),
      );
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      continue;
    }
    const version = manifest.devDependencies?.["bb-app"];
    if (version === undefined) continue;
    found.set(pluginDirectory, version);
  }
  return found;
}

/** Plugins whose bb-app release is not the one the registry is pinned to. */
export function pinMismatches(repositoryRoot, config) {
  const pinned = pinnedVersion(config);
  return [...bbAppVersions(repositoryRoot, config)]
    .filter(([, version]) => version !== pinned)
    .map(([pluginDirectory, version]) => ({ pluginDirectory, version }));
}

/**
 * The value of `const <symbol> = "…"` in a file, joining the adjacent string
 * literals TypeScript would. Used for values copied out of bb by hand, which
 * no registry item can supply.
 */
export function readLiteral(source, symbol) {
  const declaration = new RegExp(
    `(?:export\\s+)?const\\s+${symbol}\\s*(?::[^=]+)?=\\s*([\\s\\S]*?);`,
    "u",
  ).exec(source);
  if (declaration === null) return null;
  const parts = [...declaration[1].matchAll(/"((?:[^"\\]|\\.)*)"/gu)].map(
    (match) => match[1],
  );
  return parts.length === 0 ? null : parts.join("");
}

export function lockPath(repositoryRoot) {
  return join(repositoryRoot, "vendor-ui.lock.json");
}

export function digest(contents) {
  return `sha256-${createHash("sha256").update(contents).digest("base64")}`;
}

/** Fetch one registry item, or throw with the URL that failed. */
async function fetchItem(registry, name) {
  const url = registry.replace("{name}", name);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${name}: ${response.status} fetching ${url}`);
  }
  return response.json();
}

/**
 * Resolve `names` and everything their registryDependencies reach, in the
 * order shadcn would. `fetchOne` is injected so tests need no network.
 */
export async function resolveClosure(names, fetchOne) {
  const items = new Map();
  const pending = [...names];
  while (pending.length > 0) {
    const name = pending.shift();
    if (items.has(name)) continue;
    const item = await fetchOne(name);
    items.set(name, item);
    for (const dependency of item.registryDependencies ?? []) {
      pending.push(dependency.replace(/^@bb\//u, ""));
    }
  }
  return items;
}

/**
 * The files one plugin vendors: repository-relative path → contents. A
 * registry item's `target` is src-relative, matching the `@/*` alias.
 */
export async function pluginFiles(pluginDirectory, names, fetchOne) {
  const closure = await resolveClosure(names, fetchOne);
  const files = new Map();
  for (const item of closure.values()) {
    for (const file of item.files ?? []) {
      const target = file.target ?? file.path;
      // normalize first: a prefix check passes "a/../../../etc/passwd".
      const within = normalize(target).split(sep).join("/");
      if (within.startsWith("../") || within === ".." || target.startsWith("/")) {
        throw new Error(`${item.name}: target escapes the plugin: ${target}`);
      }
      files.set(`${pluginDirectory}/src/${VENDOR_ROOT}/${within}`, file.content);
    }
  }
  return files;
}

/** Every file currently sitting in a plugin's vendored directories. */
export function vendoredOnDisk(repositoryRoot, pluginDirectory) {
  const absolute = join(repositoryRoot, pluginDirectory, "src", VENDOR_ROOT);
  let entries;
  try {
    entries = readdirSync(absolute, { recursive: true, withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) =>
      relative(
        join(repositoryRoot, pluginDirectory),
        join(entry.parentPath, entry.name),
      )
        .split(sep)
        .join("/"),
    )
    .sort();
}

/**
 * Compare the working tree against the lock, offline. Returns the three ways a
 * vendored tree can be wrong: a file edited by hand, one the generator wrote
 * that has since gone, and one sitting in a vendored directory that no
 * closure explains.
 */
export function inspect(repositoryRoot, config, lock) {
  const edited = [];
  const missing = [];
  const untracked = [];

  for (const [path, expected] of Object.entries(lock.files)) {
    let contents;
    try {
      contents = readFileSync(join(repositoryRoot, path));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      missing.push(path);
      continue;
    }
    if (digest(contents) !== expected) edited.push(path);
  }

  for (const pluginDirectory of Object.keys(config.plugins)) {
    for (const relativePath of vendoredOnDisk(repositoryRoot, pluginDirectory)) {
      const path = `${pluginDirectory}/${relativePath}`;
      if (lock.files[path] === undefined) untracked.push(path);
    }
  }

  // Values copied out of bb: the lock holds what upstream said when they were
  // last fetched, so an edit here is caught without a network round trip.
  const changedLiterals = [];
  for (const literal of config.literals ?? []) {
    const recorded = lock.literals?.[`${literal.file}#${literal.symbol}`];
    let value = null;
    try {
      value = readLiteral(
        readFileSync(join(repositoryRoot, literal.file), "utf8"),
        literal.symbol,
      );
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    if (value === null || recorded === undefined || digest(value) !== recorded) {
      changedLiterals.push(`${literal.file}#${literal.symbol}`);
    }
  }

  return {
    edited: edited.sort(),
    missing: missing.sort(),
    untracked: untracked.sort(),
    changedLiterals: changedLiterals.sort(),
    pinMismatches: pinMismatches(repositoryRoot, config),
    stalePin: lock.registry !== config.registry,
  };
}

export function formatProblems(problems, config, lock) {
  const lines = [];
  if (problems.stalePin) {
    lines.push(
      `The registry pin moved without a rebuild:\n  lock:   ${lock.registry}\n  config: ${config.registry}`,
    );
  }
  if (problems.edited.length > 0) {
    lines.push(
      `These are bb's own components and were edited by hand:\n${problems.edited
        .map((path) => `  ${path}`)
        .join("\n")}\nCompose around them instead — see vendor-ui.json.`,
    );
  }
  if (problems.missing.length > 0) {
    lines.push(
      `Vendored files are missing:\n${problems.missing
        .map((path) => `  ${path}`)
        .join("\n")}`,
    );
  }
  if (problems.untracked.length > 0) {
    lines.push(
      `No registry item explains these files under src/${VENDOR_ROOT}/, which the generator owns outright — they are orphans from an older pin, or a plugin's own code that belongs outside it:\n${problems.untracked
        .map((path) => `  ${path}`)
        .join("\n")}`,
    );
  }
  if (problems.changedLiterals.length > 0) {
    lines.push(
      `These values were copied out of bb and no longer match what was recorded:\n${problems.changedLiterals
        .map((entry) => `  ${entry}`)
        .join("\n")}`,
    );
  }
  if (problems.pinMismatches.length > 0) {
    lines.push(
      `The vendored components are pinned to bb ${pinnedVersion(config)}, but these plugins build against another release, so they would run components their own app is not:\n${problems.pinMismatches
        .map(({ pluginDirectory, version }) => `  ${pluginDirectory}  bb-app ${version}`)
        .join("\n")}\nMove the vendor-ui.json pin to match, then rebuild.`,
    );
  }
  return lines.join("\n\n");
}

async function build(repositoryRoot, config) {
  const registry = config.registry;
  const cache = new Map();
  const fetchOne = async (name) => {
    if (!cache.has(name)) cache.set(name, await fetchItem(registry, name));
    return cache.get(name);
  };

  const files = new Map();
  for (const [pluginDirectory, names] of Object.entries(config.plugins)) {
    for (const [path, contents] of await pluginFiles(
      pluginDirectory,
      names,
      fetchOne,
    )) {
      files.set(path, contents);
    }
  }

  // Clear the owned root of anything this build does not write. Removing only
  // what a previous lock listed would leave a stray that was never locked in
  // place, and --check would then demand a rebuild that could not remove it.
  const previous = new Set();
  for (const pluginDirectory of Object.keys(config.plugins)) {
    for (const relativePath of vendoredOnDisk(repositoryRoot, pluginDirectory)) {
      previous.add(`${pluginDirectory}/${relativePath}`);
    }
  }
  for (const path of Object.keys(readLock(repositoryRoot)?.files ?? {})) {
    previous.add(path);
  }
  for (const path of previous) {
    if (files.has(path)) continue;
    rmSync(join(repositoryRoot, path), { force: true });
  }

  // A copied value has to still exist upstream, or the copy is stale in a way
  // no local check could see.
  const lockLiterals = {};
  for (const literal of config.literals ?? []) {
    const local = readLiteral(
      readFileSync(join(repositoryRoot, literal.file), "utf8"),
      literal.symbol,
    );
    if (local === null) {
      throw new Error(`${literal.file} declares no ${literal.symbol}`);
    }
    const url = registry
      .replace(/\/packages\/plugin-registry\/r\/\{name\}\.json$/u, "")
      .concat(`/${literal.upstream}`);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`${literal.symbol}: ${response.status} fetching ${url}`);
    }
    if (!(await response.text()).includes(local)) {
      throw new Error(
        `${literal.file} copies ${literal.symbol} from ${literal.upstream}, but bb no longer contains that value — reconcile them by hand.`,
      );
    }
    lockLiterals[`${literal.file}#${literal.symbol}`] = digest(local);
  }

  const lockFiles = {};
  for (const path of [...files.keys()].sort()) {
    const absolute = join(repositoryRoot, path);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, files.get(path));
    lockFiles[path] = digest(files.get(path));
  }
  writeFileSync(
    lockPath(repositoryRoot),
    `${JSON.stringify({ registry, literals: lockLiterals, files: lockFiles }, null, 2)}\n`,
  );
  return { count: files.size, removed: [...previous].filter((p) => !files.has(p)) };
}

export function readLock(repositoryRoot) {
  try {
    return JSON.parse(readFileSync(lockPath(repositoryRoot), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

// realpathSync on both sides: Node resolves import.meta.url through symlinks
// and leaves process.argv[1] as typed, so on a symlinked path — macOS /tmp, a
// symlinked home, a worktree — they differ, the body is skipped, and the check
// exits 0 having verified nothing. Wrong by succeeding, which is the one way a
// gate must never fail.
if (realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const config = readConfig(repositoryRoot);

  if (process.argv.includes("--check")) {
    const lock = readLock(repositoryRoot);
    if (lock === null) {
      process.stderr.write(
        "No vendor-ui.lock.json. Run npm run build:ui.\n",
      );
      process.exit(1);
    }
    const problems = inspect(repositoryRoot, config, lock);
    const failed =
      problems.stalePin ||
      problems.edited.length > 0 ||
      problems.missing.length > 0 ||
      problems.untracked.length > 0 ||
      problems.changedLiterals.length > 0 ||
      problems.pinMismatches.length > 0;
    if (failed) {
      process.stderr.write(
        `${formatProblems(problems, config, lock)}\n\nRun npm run build:ui.\n`,
      );
      process.exit(1);
    }
    console.log(
      `Vendored bb UI is current (${Object.keys(lock.files).length} files).`,
    );
  } else {
    const { count, removed } = await build(repositoryRoot, config);
    for (const path of removed) console.log(`removed ${path}`);
    console.log(`Wrote ${count} vendored bb UI files.`);
  }
}
