// Installs every plugin in this repository into the running bb, and rebuilds
// and reloads the ones already installed from these directories, so the same
// command serves a fresh clone and a `git pull`.
// Usage: npm run install:plugins
//        node scripts/install-plugins.mjs --skip-dependencies
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { derivePluginId } from "./plugin-id.mjs";
import { resolveBbCli } from "./bb-cli.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bb = resolveBbCli();
const arguments_ = process.argv.slice(2);
const skipDependencies = arguments_.includes("--skip-dependencies");
for (const argument of arguments_) {
  if (argument !== "--skip-dependencies") {
    throw new Error(`Unknown option ${argument}`);
  }
}

function run(command, args, cwd) {
  execFileSync(command, args, { cwd, stdio: "inherit" });
}

function readManifest(directory) {
  try {
    return JSON.parse(readFileSync(join(directory, "package.json"), "utf8"));
  } catch {
    return null;
  }
}

function installedPlugins() {
  const output = execFileSync(bb, ["plugin", "list", "--json"], {
    encoding: "utf8",
  });
  const parsed = JSON.parse(output);
  const plugins = Array.isArray(parsed) ? parsed : (parsed.plugins ?? []);
  return new Map(plugins.map((plugin) => [plugin.id, plugin]));
}

const pluginsDirectory = join(repositoryRoot, "plugins");
const plugins = readdirSync(pluginsDirectory, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => ({
    directory: join(pluginsDirectory, entry.name),
    manifest: readManifest(join(pluginsDirectory, entry.name)),
  }))
  .filter(({ manifest }) => manifest?.bb !== undefined)
  .map(({ directory, manifest }) => ({
    directory,
    id: derivePluginId(manifest.name),
    name: manifest.bb.name,
  }));

const installed = installedPlugins();
const skipped = [];

for (const plugin of plugins) {
  const existing = installed.get(plugin.id);
  if (existing !== undefined && existing.rootDir !== plugin.directory) {
    skipped.push(
      `${plugin.name} is already installed from ${existing.source} — run \`${bb} plugin remove ${plugin.id}\` first`,
    );
    continue;
  }

  console.log(`\n=== ${plugin.name}`);
  // The server entry runs from source, so its dependencies must be installed.
  // A root workspace install supplies them all at once for screenshot capture.
  if (!skipDependencies) {
    run("npm", ["install", "--workspaces=false"], plugin.directory);
  }
  if (existing === undefined) {
    run(bb, ["plugin", "install", plugin.directory, "--yes"], repositoryRoot);
  }
  // Reloading never rebuilds, so build before loading an updated plugin.
  run("npm", ["run", "build"], plugin.directory);
  run(bb, ["plugin", "reload", plugin.id], repositoryRoot);
}

if (skipped.length > 0) {
  process.stderr.write(`\n${skipped.join("\n")}\n`);
  process.exit(1);
}
