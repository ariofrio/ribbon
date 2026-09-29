// Keeps a plugin forked from one of bb's built-ins in step with upstream, at
// the bb release fork.json pins.
//
// A fork is a copy of a directory of get-bb/bb that this repository then
// changes freely. Nothing in git ties the copy to upstream — this repository
// squash-merges every pull request, which flattens the ancestry a subtree
// merge would need — so the tie is the pin instead: fork.json names the
// upstream ref, fork.lock.json records what upstream held there, and this
// script fetches that ref when it needs the base of a three-way merge.
//
//   node scripts/fork.mjs sync [<ref>]   merge upstream changes between the
//                                        pinned ref and <ref>, then move the pin
//   node scripts/fork.mjs diff [--commit <sha>] [--stat]
//                                        the fork's changes, in upstream paths,
//                                        as a patch that applies in a bb checkout
//   node scripts/fork.mjs --check        offline; the pin agrees with the lock
//                                        and with the vendor-ui.json release
//
// A fork's files keep their upstream-relative paths under the prefixes
// fork.json maps, so a diff between the two trees is a diff of the same file,
// and a change that touches only upstream's files can travel back as a patch.
// Files fork.json marks owned — package.json, tsconfig.json, vitest.config.ts,
// the ones a fork rewrites wholesale to build outside bb's monorepo — are
// never merged; sync reports what upstream changed in them.
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
  pinnedVersion,
  readConfig as readVendorConfig,
  readLock as readVendorLock,
} from "./vendor-ui.mjs";

export function readConfig(repositoryRoot) {
  return JSON.parse(readFileSync(join(repositoryRoot, "fork.json"), "utf8"));
}

export function lockPath(repositoryRoot) {
  return join(repositoryRoot, "fork.lock.json");
}

export function readLock(repositoryRoot) {
  try {
    return JSON.parse(readFileSync(lockPath(repositoryRoot), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

export function digest(contents) {
  return `sha256-${createHash("sha256").update(contents).digest("base64")}`;
}

/** The ref vendor-ui.json's registry pin implies, which every fork must share. */
export function vendorRef(vendorConfig) {
  return `desktop-v${pinnedVersion(vendorConfig)}`;
}

/**
 * Where an upstream file lands in the fork. `map` pairs upstream prefixes
 * with local ones; the longest matching upstream prefix wins, and "" catches
 * everything else. Returns null for a file the fork owns.
 */
export function toLocal(upstreamPath, fork) {
  if (fork.owned.includes(upstreamPath)) return null;
  const [upstreamPrefix, localPrefix] = longestPrefix(upstreamPath, Object.entries(fork.map));
  return localPrefix + upstreamPath.slice(upstreamPrefix.length);
}

/** The inverse of toLocal: null for a file that has no upstream counterpart. */
export function toUpstream(localPath, fork) {
  const entries = Object.entries(fork.map).map(([upstream, local]) => [local, upstream]);
  const match = longestPrefix(localPath, entries);
  if (match === null) return null;
  const upstreamPath = match[1] + localPath.slice(match[0].length);
  return fork.owned.includes(upstreamPath) ? null : upstreamPath;
}

function longestPrefix(path, entries) {
  let best = null;
  for (const entry of entries) {
    if (!path.startsWith(entry[0])) continue;
    if (best === null || entry[0].length > best[0].length) best = entry;
  }
  return best;
}

/**
 * What sync does to each file, given three snapshots of the fork's upstream
 * directory: `base` at the pinned ref, `next` at the ref being synced to, and
 * `ours` on disk, each a Map of upstream-relative path → contents (a Buffer),
 * with `ours` keyed by the same upstream paths after toUpstream.
 *
 * Pure, so the decision table is testable without a checkout. `merge` is the
 * only action that needs a tool: three-way, done by git merge-file.
 */
export function plan({ base, next, ours, fork }) {
  const actions = [];
  const paths = new Set([...base.keys(), ...next.keys(), ...ours.keys()]);
  for (const upstream of [...paths].sort()) {
    const local = toLocal(upstream, fork);
    const b = base.get(upstream);
    const n = next.get(upstream);
    const o = ours.get(upstream);
    if (local === null) {
      if (!same(b, n)) actions.push({ kind: "owned-changed", upstream });
      continue;
    }
    if (same(b, n)) continue; // upstream did not move; ours stands as it is
    if (n === undefined) {
      // upstream deleted it
      if (o === undefined) continue;
      actions.push(
        same(o, b)
          ? { kind: "delete", upstream, local }
          : { kind: "deleted-upstream", upstream, local },
      );
      continue;
    }
    if (o === undefined) {
      actions.push(
        b === undefined
          ? { kind: "add", upstream, local, contents: n }
          : { kind: "deleted-here", upstream, local },
      );
      continue;
    }
    if (same(o, n)) continue; // already carries upstream's version
    if (same(o, b)) {
      actions.push({ kind: "update", upstream, local, contents: n });
      continue;
    }
    actions.push({ kind: "merge", upstream, local, base: b, next: n, ours: o });
  }
  return actions;
}

function same(a, b) {
  if (a === undefined || b === undefined) return a === b;
  return a.equals(b);
}

/**
 * Three-way merge of one file with git merge-file. Returns the merged text
 * and how many conflict hunks it left behind; a base that never existed
 * (added on both sides) merges against an empty file.
 */
export function mergeFile({ base, next, ours }, cwd = mkdtempSync(join(tmpdir(), "fork-merge-"))) {
  const paths = { ours: join(cwd, "ours"), base: join(cwd, "base"), next: join(cwd, "next") };
  writeFileSync(paths.ours, ours);
  writeFileSync(paths.base, base ?? "");
  writeFileSync(paths.next, next);
  const result = spawnSync(
    "git",
    [
      "merge-file",
      "-p",
      "--diff3",
      "-L", "fork",
      "-L", "upstream (pinned)",
      "-L", "upstream (new)",
      paths.ours,
      paths.base,
      paths.next,
    ],
    { encoding: "buffer" },
  );
  rmSync(cwd, { recursive: true, force: true });
  if (result.status === null || result.status < 0 || result.status > 127) {
    throw new Error(`git merge-file failed: ${result.stderr.toString()}`);
  }
  return { contents: result.stdout, conflicts: result.status };
}

/** Every file under a directory, as upstream-relative posix paths. */
export function readTree(directory) {
  const files = new Map();
  if (!existsSync(directory)) return files;
  for (const entry of readdirSync(directory, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const absolute = join(entry.parentPath, entry.name);
    const path = relative(directory, absolute).split(sep).join("/");
    if (path.startsWith("node_modules/") || path.startsWith("dist/")) continue;
    files.set(path, readFileSync(absolute));
  }
  return files;
}

/** The fork's files on disk, keyed by the upstream path each stands for. */
export function readFork(repositoryRoot, pluginDirectory, fork) {
  const ours = new Map();
  for (const [local, contents] of readTree(join(repositoryRoot, pluginDirectory))) {
    const upstream = toUpstream(local, fork);
    if (upstream !== null) ours.set(upstream, contents);
  }
  return ours;
}

/**
 * A sparse, blobless clone of upstream at one ref, kept under .scratch/fork
 * so a second sync or diff of the same ref costs no network. Returns the
 * checkout's root.
 */
export function fetchUpstream(repositoryRoot, config, ref, paths) {
  const checkout = join(repositoryRoot, ".scratch", "fork", ref);
  const stamp = join(checkout, ".fork-paths");
  const wanted = [...paths].sort().join("\n");
  if (existsSync(stamp) && readFileSync(stamp, "utf8") === wanted) return checkout;
  rmSync(checkout, { recursive: true, force: true });
  mkdirSync(dirname(checkout), { recursive: true });
  const git = (args, cwd) => execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "inherit"] });
  git([
    "clone", "--quiet", "--filter=blob:none", "--no-checkout", "--depth=1",
    "--branch", ref, config.upstream, checkout,
  ]);
  git(["sparse-checkout", "set", "--no-cone", ...paths], checkout);
  git(["checkout", "--quiet"], checkout);
  writeFileSync(stamp, wanted);
  return checkout;
}

export function upstreamCommit(checkout) {
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd: checkout, encoding: "utf8" }).trim();
}

/** The lock's view of one snapshot: upstream repo path → digest. */
export function lockFiles(config, snapshots) {
  const files = {};
  for (const [pluginDirectory, fork] of Object.entries(config.forks)) {
    const snapshot = snapshots.get(pluginDirectory);
    for (const path of [...snapshot.keys()].sort()) {
      files[`${fork.path}/${path}`] = digest(snapshot.get(path));
    }
  }
  return files;
}

/**
 * What --check can say without the network: the pin, the lock, and the
 * vendored-UI release all name the same bb.
 */
export function checkProblems({ config, lock, vendorConfig, repositoryRoot = null }) {
  const problems = [];
  const expected = vendorRef(vendorConfig);
  if (config.ref !== expected) {
    problems.push(
      `fork.json pins ${config.ref}, but vendor-ui.json vendors components from ${expected}; a fork runs beside the components of one release, so move both pins together`,
    );
  }
  if (lock === null) {
    problems.push("No fork.lock.json. Run node scripts/fork.mjs sync.");
    return problems;
  }
  if (lock.ref !== config.ref) {
    problems.push(
      `The fork pin moved without a sync:\n  lock:   ${lock.ref}\n  config: ${config.ref}\nRun node scripts/fork.mjs sync ${config.ref}.`,
    );
  }
  if (repositoryRoot !== null) {
    for (const pluginDirectory of Object.keys(config.forks)) {
      if (!existsSync(join(repositoryRoot, pluginDirectory))) {
        problems.push(`${pluginDirectory} is listed in fork.json but does not exist`);
      }
    }
  }
  return problems;
}

function snapshotsAt(repositoryRoot, config, ref) {
  const checkout = fetchUpstream(
    repositoryRoot,
    config,
    ref,
    Object.values(config.forks).map((fork) => fork.path),
  );
  const snapshots = new Map();
  for (const [pluginDirectory, fork] of Object.entries(config.forks)) {
    snapshots.set(pluginDirectory, readTree(join(checkout, fork.path)));
  }
  return { checkout, snapshots };
}

function sync(repositoryRoot, config, targetRef) {
  const lock = readLock(repositoryRoot);
  const base = snapshotsAt(repositoryRoot, config, config.ref);
  if (lock !== null && lock.ref === config.ref) {
    const recorded = lockFiles(config, base.snapshots);
    const moved = Object.keys({ ...lock.files, ...recorded }).filter(
      (path) => lock.files[path] !== recorded[path],
    );
    if (moved.length > 0) {
      throw new Error(
        `${config.ref} no longer holds what fork.lock.json recorded (${moved.length} files differ, e.g. ${moved[0]}). The tag moved; sync from the commit the lock names instead.`,
      );
    }
  }
  const next = targetRef === config.ref ? base : snapshotsAt(repositoryRoot, config, targetRef);

  const report = [];
  for (const [pluginDirectory, fork] of Object.entries(config.forks)) {
    const ours = readFork(repositoryRoot, pluginDirectory, fork);
    const actions = plan({
      base: base.snapshots.get(pluginDirectory),
      next: next.snapshots.get(pluginDirectory),
      ours,
      fork,
    });
    for (const action of actions) {
      const absolute = action.local === undefined ? null : join(repositoryRoot, pluginDirectory, action.local);
      switch (action.kind) {
        case "add":
        case "update":
          mkdirSync(dirname(absolute), { recursive: true });
          writeFileSync(absolute, action.contents);
          report.push(`  ${action.kind === "add" ? "A" : "U"} ${pluginDirectory}/${action.local}`);
          break;
        case "delete":
          unlinkSync(absolute);
          report.push(`  D ${pluginDirectory}/${action.local}`);
          break;
        case "merge": {
          const merged = mergeFile(action);
          writeFileSync(absolute, merged.contents);
          report.push(
            merged.conflicts > 0
              ? `  C ${pluginDirectory}/${action.local}  ${merged.conflicts} conflict${merged.conflicts === 1 ? "" : "s"} to resolve`
              : `  M ${pluginDirectory}/${action.local}`,
          );
          break;
        }
        case "deleted-upstream":
          report.push(
            `  ! ${pluginDirectory}/${action.local}  upstream deleted this file and the fork had changed it; keep or delete it by hand`,
          );
          break;
        case "deleted-here":
          report.push(
            `  ! ${pluginDirectory}/${action.local}  the fork deleted this file and upstream changed it; nothing was written`,
          );
          break;
        case "owned-changed":
          report.push(
            `  ! ${fork.path}/${action.upstream}  is owned by the fork and changed upstream; compare by hand:\n      git -C ${relative(repositoryRoot, next.checkout)} diff ${config.ref} -- ${fork.path}/${action.upstream}`,
          );
          break;
        default:
          throw new Error(`unknown action ${action.kind}`);
      }
    }
  }

  const lockContents = {
    ref: targetRef,
    commit: upstreamCommit(next.checkout),
    files: lockFiles(config, next.snapshots),
  };
  writeFileSync(lockPath(repositoryRoot), `${JSON.stringify(lockContents, null, 2)}\n`);
  if (targetRef !== config.ref) {
    const source = readFileSync(join(repositoryRoot, "fork.json"), "utf8");
    writeFileSync(join(repositoryRoot, "fork.json"), source.replace(`"ref": "${config.ref}"`, `"ref": "${targetRef}"`));
  }
  return report;
}

/**
 * A git tree holding `entries` (path → blob sha) under `prefix`, built in a
 * throwaway index so a diff between two such trees prints upstream paths.
 */
function writeTree(repositoryRoot, entries, prefix) {
  const index = join(mkdtempSync(join(tmpdir(), "fork-index-")), "index");
  const env = { ...process.env, GIT_INDEX_FILE: index };
  const lines = [...entries]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([path, sha]) => `100644 ${sha}\t${prefix}${path}`)
    .join("\n");
  execFileSync("git", ["update-index", "--add", "--index-info"], {
    cwd: repositoryRoot,
    env,
    input: `${lines}\n`,
  });
  const tree = execFileSync("git", ["write-tree"], { cwd: repositoryRoot, env, encoding: "utf8" }).trim();
  rmSync(dirname(index), { recursive: true, force: true });
  return tree;
}

function hashObject(repositoryRoot, contents) {
  return execFileSync("git", ["hash-object", "-w", "--stdin"], {
    cwd: repositoryRoot,
    input: contents,
    encoding: "utf8",
  }).trim();
}

function blobsOf(repositoryRoot, snapshot) {
  const entries = new Map();
  for (const [path, contents] of snapshot) entries.set(path, hashObject(repositoryRoot, contents));
  return entries;
}

/** Upstream-path → blob sha for the fork's files as of one commit. */
function forkAtCommit(repositoryRoot, commit, pluginDirectory, fork) {
  const entries = new Map();
  const listing = execFileSync("git", ["ls-tree", "-r", commit, "--", pluginDirectory], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  for (const line of listing.split("\n")) {
    if (line === "") continue;
    const [meta, path] = line.split("\t");
    const sha = meta.split(" ")[2];
    const upstream = toUpstream(path.slice(`${pluginDirectory}/`.length), fork);
    if (upstream !== null) entries.set(upstream, sha);
  }
  return entries;
}

/**
 * The fork's files that stand for nothing upstream and say nothing about the
 * fork: bb's own components, vendored by vendor-ui.mjs under the fork's src/.
 */
function vendoredUpstreamPaths(repositoryRoot, pluginDirectory, fork) {
  const paths = new Set();
  for (const path of Object.keys(readVendorLock(repositoryRoot)?.files ?? {})) {
    if (!path.startsWith(`${pluginDirectory}/`)) continue;
    const upstream = toUpstream(path.slice(pluginDirectory.length + 1), fork);
    if (upstream !== null) paths.add(upstream);
  }
  return paths;
}

function diff(repositoryRoot, config, { commit, stat }) {
  const output = [];
  for (const [pluginDirectory, fork] of Object.entries(config.forks)) {
    let before;
    let after;
    const vendored = vendoredUpstreamPaths(repositoryRoot, pluginDirectory, fork);
    if (commit === undefined) {
      const { snapshots } = snapshotsAt(repositoryRoot, config, config.ref);
      const synced = new Map(
        [...snapshots.get(pluginDirectory)].filter(([path]) => toLocal(path, fork) !== null),
      );
      before = blobsOf(repositoryRoot, synced);
      after = blobsOf(repositoryRoot, readFork(repositoryRoot, pluginDirectory, fork));
    } else {
      before = forkAtCommit(repositoryRoot, `${commit}^`, pluginDirectory, fork);
      after = forkAtCommit(repositoryRoot, commit, pluginDirectory, fork);
    }
    for (const entries of [before, after]) {
      for (const path of vendored) entries.delete(path);
    }
    const prefix = `${fork.path}/`;
    const trees = [writeTree(repositoryRoot, before, prefix), writeTree(repositoryRoot, after, prefix)];
    output.push(
      execFileSync("git", ["diff-tree", "-r", stat ? "--stat" : "-p", ...trees], {
        cwd: repositoryRoot,
        encoding: "utf8",
        maxBuffer: 1 << 28,
      }),
    );
  }
  return output.join("");
}

if (realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const config = readConfig(repositoryRoot);
  const [command, ...rest] = process.argv.slice(2);

  if (command === "--check") {
    const problems = checkProblems({
      config,
      lock: readLock(repositoryRoot),
      vendorConfig: readVendorConfig(repositoryRoot),
      repositoryRoot,
    });
    if (problems.length > 0) {
      process.stderr.write(`${problems.join("\n\n")}\n`);
      process.exit(1);
    }
    console.log(`Forks are pinned to ${config.ref} and the lock agrees.`);
  } else if (command === "sync") {
    const targetRef = rest[0] ?? config.ref;
    const report = sync(repositoryRoot, config, targetRef);
    console.log(
      report.length === 0
        ? `Forks are in step with ${targetRef}.`
        : `Synced ${config.ref} → ${targetRef}:\n${report.join("\n")}`,
    );
    if (report.some((line) => line.includes("  C ") || line.includes("  ! "))) {
      console.log("\nResolve the lines marked C and !, then run the plugin's release:check.");
    }
  } else if (command === "diff") {
    const commitIndex = rest.indexOf("--commit");
    const commit = commitIndex === -1 ? undefined : rest[commitIndex + 1];
    process.stdout.write(diff(repositoryRoot, config, { commit, stat: rest.includes("--stat") }));
  } else {
    process.stderr.write(
      "Usage: node scripts/fork.mjs sync [<ref>] | diff [--commit <sha>] [--stat] | --check\n",
    );
    process.exit(2);
  }
}
