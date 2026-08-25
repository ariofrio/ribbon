// Resolves the bb CLI to an absolute path, for scripts that hand `BB_CLI` to a
// child process.
//
// Never pass a bare "bb". npm prepends node_modules/.bin to PATH, and a plugin
// that depends on bb-app has a `bb` symlink there pointing at the launcher
// shim. The launcher spawns `process.env.BB_CLI ?? <bundled cli>`, so a bare
// name re-resolves through that same PATH and re-enters the shim — and because
// the launcher passes its environment down, every child repeats it. A plugin
// whose `build` script is `bb plugin build` then forks without bound.
//
// An absolute path alone is not enough, because a node_modules/.bin entry links
// to bb-app/dist/bb.js — which IS the launcher, not the CLI it stands in for.
// Handing that back as BB_CLI makes the launcher spawn itself, which is the very
// loop this module exists to prevent. So a shim is followed to its target and
// then, if that target is the launcher, on to the CLI the launcher would have
// run: bb-app/host-daemon/dist/bb, which ships in the same package.
//
// In CI that chain is the only bb there is, since bb-app is a devDependency and
// nothing installs the desktop app.
import { accessSync, constants, realpathSync } from "node:fs";
import { delimiter, dirname, isAbsolute, join, sep } from "node:path";

const SHIM_DIRECTORY = `${sep}node_modules${sep}.bin${sep}`;

function isShim(path) {
  return path.includes(SHIM_DIRECTORY);
}

/** bb-app's launcher, which re-reads BB_CLI and would spawn itself. */
function isLauncher(path) {
  return path.endsWith(`${sep}bb-app${sep}dist${sep}bb.js`);
}

/**
 * The CLI the launcher would have run, shipped beside it in the same package.
 * Returns null when this is not a launcher or the CLI is not there.
 */
function pastLauncher(path) {
  if (!isLauncher(path)) return path;
  const cli = join(dirname(dirname(path)), "host-daemon", "dist", "bb");
  try {
    accessSync(cli, constants.X_OK);
    return cli;
  } catch {
    return null;
  }
}

/** A .bin entry resolved past the shim and past the launcher to the CLI. */
function throughShim(path) {
  let resolved = path;
  if (isShim(resolved)) {
    try {
      resolved = realpathSync(resolved);
    } catch {
      return null;
    }
    if (isShim(resolved)) return null;
  }
  return pastLauncher(resolved);
}

// Walked here rather than shelled out to `which`, which would itself have to be
// found on the PATH this is inspecting.
function fromPath() {
  for (const directory of (process.env.PATH ?? "").split(delimiter)) {
    if (directory.length === 0 || !isAbsolute(directory)) continue;
    const candidate = join(directory, "bb");
    try {
      accessSync(candidate, constants.X_OK);
    } catch {
      continue;
    }
    const resolved = throughShim(candidate);
    if (resolved !== null) return resolved;
  }
  return null;
}

/** Absolute path to the bb CLI, or throw explaining why a bare name is unsafe. */
export function resolveBbCli() {
  const override = process.env.BB_CLI;
  if (override !== undefined && isAbsolute(override)) {
    const resolved = throughShim(override);
    if (resolved !== null) return resolved;
  }
  const found = fromPath();
  if (found !== null) return found;
  throw new Error(
    override === undefined
      ? "bb was not found on PATH. Set BB_CLI to the absolute path of bb's CLI."
      : `BB_CLI must be an absolute path to bb's CLI, not ${JSON.stringify(override)} — a bare name or a node_modules/.bin shim makes "bb plugin build" spawn itself without bound.`,
  );
}
