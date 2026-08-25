// Derives the icons the root README puts beside a plugin's name.
//
// An inline image is centred by vertical-align: middle, which sits it on the
// baseline plus half the x-height — lower than the middle of the capitals it
// stands next to, by about a tenth of an em. Padding the bottom of the
// viewBox moves the drawing up inside its own box by exactly that much, so
// the icon reads as centred on the title's cap height.
//
// Usage: npm run build:heading-icons  (npm run check:heading-icons reports drift)
import {
  existsSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { derivePluginId } from "./plugin-id.mjs";

/**
 * Bottom padding, in viewBox units, for a 24-unit-tall icon. Measured against
 * the rendered heading rather than derived, because each icon's own inset
 * inside its 24x24 box shifts it too: at this value four of the five icons
 * land exactly on the middle of the capitals beside them, and the fifth within
 * four tenths of a pixel.
 */
export const HEADING_ICON_PADDING = 3.5;

export function padViewBox(svg, padding = HEADING_ICON_PADDING) {
  const match = /viewBox="0 0 24 24"/u.exec(svg);
  if (match === null) {
    throw new Error("expected a 24x24 viewBox to pad");
  }
  return svg.replace(match[0], `viewBox="0 0 24 ${24 + padding}"`);
}

export function headingIcons(repositoryRoot) {
  const pluginsDirectory = join(repositoryRoot, "plugins");
  return readdirSync(pluginsDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      const manifest = join(pluginsDirectory, entry.name, "package.json");
      // A directory here is a plugin only if it carries a manifest, the same
      // test plugin-layout.mjs makes. Tooling leaves untracked directories
      // beside them — an agent's `.claude/`, say — and one of those must not
      // read as a plugin missing its icon.
      if (!existsSync(manifest)) return [];
      const id = derivePluginId(JSON.parse(readFileSync(manifest, "utf8")).name);
      return [
        {
          id,
          source: join(pluginsDirectory, entry.name, "assets/icon.svg"),
          output: join(repositoryRoot, "assets/icons", `${id}.svg`),
        },
      ];
    });
}

// realpathSync on both sides: Node resolves import.meta.url through symlinks
// and leaves process.argv[1] as typed, so on a symlinked path — macOS /tmp, a
// symlinked home, a worktree — they differ, the body is skipped, and the check
// exits 0 having verified nothing. Wrong by succeeding, which is the one way a
// gate must never fail.
if (realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const check = process.argv.includes("--check");
  const stale = [];
  for (const icon of headingIcons(repositoryRoot)) {
    const padded = padViewBox(readFileSync(icon.source, "utf8"));
    if (check) {
      const current = readFileSync(icon.output, "utf8");
      if (current !== padded) stale.push(icon.id);
    } else {
      writeFileSync(icon.output, padded);
    }
  }
  if (stale.length > 0) {
    process.stderr.write(
      `Heading icons are out of date: ${stale.join(", ")}\nRun npm run build:heading-icons.\n`,
    );
    process.exit(1);
  }
  console.log(check ? "Heading icons are current." : "Wrote heading icons.");
}
