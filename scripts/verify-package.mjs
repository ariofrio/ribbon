// Packs a plugin, checks that the tarball holds exactly the publishable files,
// then installs it in a temporary prefix and validates the installed manifest
// and build metadata. Also builds the source with production-only dependencies.
// Usage: node scripts/verify-package.mjs [pluginDir]
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, matchesGlob, relative, resolve, sep } from "node:path";
import { derivePluginId } from "./plugin-id.mjs";

const pluginDirectory = resolve(process.argv[2] ?? process.cwd());
const manifest = JSON.parse(
  readFileSync(join(pluginDirectory, "package.json"), "utf8"),
);
const pluginId = derivePluginId(manifest.name);

const toPackagePath = (path) =>
  relative(pluginDirectory, path).split(sep).join("/");

const listFiles = (directory) =>
  readdirSync(join(pluginDirectory, directory), {
    recursive: true,
    withFileTypes: true,
  })
    .filter((entry) => entry.isFile())
    .map((entry) => toPackagePath(join(entry.parentPath, entry.name)));

const skillPaths = (manifest.bb.skills ?? []).flatMap((directory) =>
  listFiles(directory),
);
// Mirrors npm's own allowlist semantics: entries apply in order, and an entry
// prefixed with "!" drops the files matched so far — how a plugin ships its
// sources without their co-located tests.
const allowlistedFiles = [];
for (const entry of manifest.files ?? []) {
  const normalized = entry.replace(/^!?\.\//, (prefix) =>
    prefix.startsWith("!") ? "!" : "",
  );
  if (normalized.startsWith("!")) {
    const pattern = normalized.slice(1);
    for (let index = allowlistedFiles.length - 1; index >= 0; index -= 1) {
      if (matchesGlob(allowlistedFiles[index], pattern)) {
        allowlistedFiles.splice(index, 1);
      }
    }
    continue;
  }
  allowlistedFiles.push(
    ...(statSync(join(pluginDirectory, normalized)).isDirectory()
      ? listFiles(normalized)
      : [normalized]),
  );
}
const expectedFiles = [
  ...new Set([
    "LICENSE",
    "README.md",
    "package.json",
    ...allowlistedFiles,
  ]),
].sort();

const temporaryDirectory = mkdtempSync(join(tmpdir(), `${pluginId}-pack-`));

try {
  execFileSync(
    process.execPath,
    [resolve(import.meta.dirname, "verify-production-build.mjs"), pluginDirectory],
    { stdio: "inherit" },
  );

  const packOutput = execFileSync(
    "npm",
    [
      "pack",
      "--ignore-scripts",
      "--json",
      "--pack-destination",
      temporaryDirectory,
    ],
    { cwd: pluginDirectory, encoding: "utf8" },
  );
  const [packed] = JSON.parse(packOutput);
  assert.ok(packed, "npm pack did not report an artifact");
  assert.deepEqual(
    packed.files.map(({ path }) => path).sort(),
    expectedFiles,
    "packed artifact contains missing or unexpected files",
  );

  const tarball = join(temporaryDirectory, packed.filename);
  const installPrefix = join(temporaryDirectory, "install");
  execFileSync(
    "npm",
    [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--prefix",
      installPrefix,
      tarball,
    ],
    { stdio: "inherit" },
  );

  const packageRoot = join(installPrefix, "node_modules", manifest.name);
  const installedManifest = JSON.parse(
    readFileSync(join(packageRoot, "package.json"), "utf8"),
  );

  assert.equal(installedManifest.name, manifest.name);
  assert.equal(installedManifest.license, "MIT");
  assert.notEqual(
    installedManifest.private,
    true,
    "package is marked private and cannot be published",
  );
  for (const file of expectedFiles) {
    readFileSync(join(packageRoot, file));
  }
  for (const directory of installedManifest.bb.skills ?? []) {
    assert.ok(
      skillPaths.some((path) => path.endsWith("/SKILL.md")),
      `skills directory ${directory} contains no SKILL.md`,
    );
  }

  const metadataFiles = expectedFiles.filter((file) =>
    file.endsWith(".meta.json"),
  );
  assert.ok(metadataFiles.length > 0, "packed artifact has no build metadata");
  for (const file of metadataFiles) {
    const metadata = JSON.parse(readFileSync(join(packageRoot, file), "utf8"));
    assert.equal(metadata.pluginId, pluginId);
    assert.equal(metadata.pluginVersion, installedManifest.version);
    assert.equal(
      metadata.sdkVersion,
      installedManifest.engines.bbPluginSdk.replace(/^\^/, ""),
    );
  }

  console.log(`Verified packed artifact ${packed.filename}.`);
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
