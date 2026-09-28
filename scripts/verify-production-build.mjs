// Build a plugin from source with only production dependencies, as bb does
// when installing a Git release. Usage: node scripts/verify-production-build.mjs [pluginDir]
import { execFileSync } from "node:child_process";
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { basename, join, resolve } from "node:path";

import { resolveBbCli } from "./bb-cli.mjs";

const repositoryRoot = resolve(import.meta.dirname, "..");
const pluginDirectory = resolve(process.argv[2] ?? process.cwd());
const scratchDirectory = join(repositoryRoot, ".scratch", "work");
mkdirSync(scratchDirectory, { recursive: true });
const temporaryDirectory = mkdtempSync(
  join(scratchDirectory, "production-build-"),
);
const copyRoot = join(temporaryDirectory, "repo");
const copyDirectory = join(copyRoot, "plugins", basename(pluginDirectory));

try {
  mkdirSync(join(copyRoot, "plugins"), { recursive: true });
  copyFileSync(
    join(repositoryRoot, "tsconfig.base.json"),
    join(copyRoot, "tsconfig.base.json"),
  );
  const excluded = new Set([
    join(pluginDirectory, "node_modules"),
    join(pluginDirectory, "dist"),
  ]);
  cpSync(pluginDirectory, copyDirectory, {
    recursive: true,
    filter: (source) => !excluded.has(source),
  });

  execFileSync(
    "npm",
    [
      "ci",
      "--omit=dev",
      "--workspaces=false",
      "--no-audit",
      "--no-fund",
      "--loglevel=error",
    ],
    { cwd: copyDirectory, stdio: "inherit" },
  );
  execFileSync(resolveBbCli(), ["plugin", "build", copyDirectory], {
    stdio: "inherit",
  });
  console.log(`Verified production-only build for ${basename(pluginDirectory)}.`);
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
