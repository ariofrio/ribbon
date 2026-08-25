// Fails when a plugin's SDK package pin or vendored declarations are stale.
// Usage: node scripts/verify-types.mjs [pluginDir]
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { resolveBbCli } from "./bb-cli.mjs";

const pluginDirectory = resolve(process.argv[2] ?? process.cwd());
const manifest = JSON.parse(
  readFileSync(resolve(pluginDirectory, "package.json"), "utf8"),
);

execFileSync(resolveBbCli(), ["plugin", "types", "--check", pluginDirectory], {
  stdio: "inherit",
});

if (manifest.devDependencies?.["@get-bb/plugin-sdk"] !== undefined) {
  const typesDirectory = resolve(pluginDirectory, "types");
  const files = existsSync(typesDirectory)
    ? readdirSync(typesDirectory, { recursive: true })
    : [];
  if (files.length > 0) {
    process.stderr.write(
      "This plugin uses @get-bb/plugin-sdk but still has vendored declarations in types/.\n",
    );
    process.exit(1);
  }
  console.log("SDK package pin is current; no vendored declarations remain.");
  process.exit(0);
}

const diff = spawnSync(
  "git",
  ["diff", "--no-ext-diff", "--exit-code", "--", "types"],
  { cwd: pluginDirectory, encoding: "utf8" },
);
const untracked = execFileSync(
  "git",
  ["ls-files", "--others", "--exclude-standard", "--", "types"],
  { cwd: pluginDirectory, encoding: "utf8" },
).trim();

if (diff.status !== 0 || untracked) {
  if (diff.stdout) process.stderr.write(diff.stdout);
  if (diff.stderr) process.stderr.write(diff.stderr);
  if (untracked) {
    process.stderr.write(`Uncommitted declarations:\n${untracked}\n`);
  }
  process.stderr.write(
    "Committed declarations differ from Git. Run bb plugin types and commit types/.\n",
  );
  process.exit(1);
}

console.log("Committed declarations are current.");
