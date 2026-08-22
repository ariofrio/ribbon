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
// An absolute path breaks the cycle, so this returns nothing else. A
// node_modules/.bin entry is followed rather than refused: it is a symlink to
// the CLI, and its target is both absolute and outside .bin, so it is the
// honest answer. In CI that shim is the only bb there is, since bb-app is a
// devDependency and nothing installs the desktop app.
import { accessSync, constants, realpathSync } from "node:fs";
import { delimiter, isAbsolute, join, sep } from "node:path";

const SHIM_DIRECTORY = `${sep}node_modules${sep}.bin${sep}`;

function isShim(path) {
  return path.includes(SHIM_DIRECTORY);
}

/** A .bin entry resolved to the file it links to, or the path unchanged. */
function throughShim(path) {
  if (!isShim(path)) return path;
  try {
    const target = realpathSync(path);
    return isShim(target) ? null : target;
  } catch {
    return null;
  }
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
