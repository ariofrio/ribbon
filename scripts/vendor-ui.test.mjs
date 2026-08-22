import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  digest,
  inspect,
  pinMismatches,
  pinnedVersion,
  pluginFiles,
  readLiteral,
  resolveClosure,
  vendoredOnDisk,
} from "./vendor-ui.mjs";

const item = (name, target, content, registryDependencies = []) => ({
  name,
  registryDependencies,
  files: [{ path: `registry/${target}`, target, content }],
});

const registry = new Map(
  [
    item("utils", "lib/utils.ts", "export const cn = 0;\n"),
    item("icon", "components/ui/icon.tsx", "export const Icon = 0;\n", [
      "@bb/utils",
    ]),
    item(
      "dropdown-menu",
      "components/ui/dropdown-menu.tsx",
      "export const DropdownMenu = 0;\n",
      ["@bb/icon", "@bb/utils"],
    ),
  ].map((entry) => [entry.name, entry]),
);

const fetchOne = async (name) => {
  const found = registry.get(name);
  if (found === undefined) throw new Error(`${name}: 404`);
  return found;
};

function writeTree(files) {
  const root = mkdtempSync(join(tmpdir(), "vendor-ui-"));
  for (const [path, contents] of Object.entries(files)) {
    const absolute = join(root, path);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, contents);
  }
  return root;
}

test("a closure pulls in every registryDependency transitively", async () => {
  const closure = await resolveClosure(["dropdown-menu"], fetchOne);
  assert.deepEqual([...closure.keys()].sort(), [
    "dropdown-menu",
    "icon",
    "utils",
  ]);
});

test("closure resolution visits each item once", async () => {
  const seen = [];
  await resolveClosure(["dropdown-menu", "icon"], async (name) => {
    seen.push(name);
    return fetchOne(name);
  });
  assert.deepEqual(seen.sort(), ["dropdown-menu", "icon", "utils"]);
});

test("files land under src/vendor/, keeping bb's own layout beneath it", async () => {
  const files = await pluginFiles("plugins/bb-plugin-x", ["icon"], fetchOne);
  assert.deepEqual([...files.keys()].sort(), [
    "plugins/bb-plugin-x/src/vendor/components/ui/icon.tsx",
    "plugins/bb-plugin-x/src/vendor/lib/utils.ts",
  ]);
});

test("a registry item may not write outside the plugin", async () => {
  await assert.rejects(
    pluginFiles("plugins/bb-plugin-x", ["escape"], async () =>
      item("escape", "../../../etc/passwd", "x"),
    ),
    /escapes the plugin/u,
  );
});

const config = {
  registry:
    "https://raw.githubusercontent.com/get-bb/bb/desktop-v0.39.0/packages/plugin-registry/r/{name}.json",
  plugins: { "plugins/bb-plugin-x": ["icon"] },
};

const lockFor = (files) => ({
  registry: config.registry,
  files: Object.fromEntries(
    Object.entries(files).map(([path, contents]) => [path, digest(contents)]),
  ),
});

const vendored = {
  "plugins/bb-plugin-x/src/vendor/components/ui/icon.tsx": "export const Icon = 0;\n",
  "plugins/bb-plugin-x/src/vendor/lib/utils.ts": "export const cn = 0;\n",
};

test("a pristine tree reports no problems", () => {
  const root = writeTree(vendored);
  assert.deepEqual(inspect(root, config, lockFor(vendored)), {
    edited: [],
    missing: [],
    untracked: [],
    changedLiterals: [],
    pinMismatches: [],
    stalePin: false,
  });
});

test("a hand-edited bb component is reported", () => {
  const root = writeTree({
    ...vendored,
    "plugins/bb-plugin-x/src/vendor/components/ui/icon.tsx":
      "export const Icon = 0; // tweaked\n",
  });
  assert.deepEqual(inspect(root, config, lockFor(vendored)).edited, [
    "plugins/bb-plugin-x/src/vendor/components/ui/icon.tsx",
  ]);
});

test("a deleted vendored file is reported", () => {
  const root = writeTree({
    "plugins/bb-plugin-x/src/vendor/lib/utils.ts": vendored[
      "plugins/bb-plugin-x/src/vendor/lib/utils.ts"
    ],
  });
  assert.deepEqual(inspect(root, config, lockFor(vendored)).missing, [
    "plugins/bb-plugin-x/src/vendor/components/ui/icon.tsx",
  ]);
});

test("a file no closure explains is reported as untracked", () => {
  const root = writeTree({
    ...vendored,
    "plugins/bb-plugin-x/src/vendor/components/ui/hooks/use-pointer-coarse.ts":
      "export const usePointerCoarse = 0;\n",
  });
  assert.deepEqual(inspect(root, config, lockFor(vendored)).untracked, [
    "plugins/bb-plugin-x/src/vendor/components/ui/hooks/use-pointer-coarse.ts",
  ]);
});

test("a plugin's own file outside the root is not the generator's business", () => {
  // No allowlist to maintain: the root is owned outright, so plugin code is
  // simply not in it.
  const root = writeTree({
    ...vendored,
    "plugins/bb-plugin-x/src/components/ThreadFilter.tsx": "// mine\n",
    "plugins/bb-plugin-x/src/lib/dialog-position.ts": "// also mine\n",
  });
  assert.deepEqual(inspect(root, config, lockFor(vendored)).untracked, []);
});

test("bumping the pin without rebuilding is reported", () => {
  const root = writeTree(vendored);
  const problems = inspect(
    root,
    { ...config, registry: "https://raw.githubusercontent.com/get-bb/bb/desktop-v0.40.0/packages/plugin-registry/r/{name}.json" },
    lockFor(vendored),
  );
  assert.equal(problems.stalePin, true);
});

test("vendoredOnDisk scans one root, whatever depth a target invents", () => {
  const root = writeTree({
    ...vendored,
    "plugins/bb-plugin-x/src/app.tsx": "// not vendored\n",
    "plugins/bb-plugin-x/src/components/ui/mine.tsx": "// not vendored either\n",
    "plugins/bb-plugin-x/src/vendor/a/b/c/deep.ts": "// a target four levels down\n",
  });
  assert.deepEqual(vendoredOnDisk(root, "plugins/bb-plugin-x"), [
    "src/vendor/a/b/c/deep.ts",
    "src/vendor/components/ui/icon.tsx",
    "src/vendor/lib/utils.ts",
  ]);
});

test("the pinned version is read off the registry URL", () => {
  assert.equal(
    pinnedVersion({
      registry:
        "https://raw.githubusercontent.com/get-bb/bb/desktop-v0.39.0/packages/plugin-registry/r/{name}.json",
    }),
    "0.39.0",
  );
});

test("a registry URL with no desktop tag is refused", () => {
  assert.throws(
    () => pinnedVersion({ registry: "https://example.test/{name}.json" }),
    /pinned to a desktop-v/u,
  );
});

test("a plugin building against another bb release is reported", () => {
  const root = writeTree({
    ...vendored,
    "plugins/bb-plugin-x/package.json": JSON.stringify({
      devDependencies: { "bb-app": "0.40.0" },
    }),
  });
  assert.deepEqual(pinMismatches(root, config), [
    { pluginDirectory: "plugins/bb-plugin-x", version: "0.40.0" },
  ]);
});

test("a plugin on the pinned release is not reported", () => {
  const root = writeTree({
    ...vendored,
    "plugins/bb-plugin-x/package.json": JSON.stringify({
      devDependencies: { "bb-app": "0.39.0" },
    }),
  });
  assert.deepEqual(pinMismatches(root, config), []);
});

test("a copied literal is read out of its declaration", () => {
  assert.equal(
    readLiteral('export const A_CLASS =\n  "text-xs font-normal";\n', "A_CLASS"),
    "text-xs font-normal",
  );
});

test("a literal split across adjacent strings is joined as TypeScript would", () => {
  assert.equal(
    readLiteral('const A_CLASS =\n  "text-xs " +\n  "font-normal";\n', "A_CLASS"),
    "text-xs font-normal",
  );
});

test("a missing symbol reads as null rather than an empty value", () => {
  assert.equal(readLiteral('export const OTHER = "x";\n', "A_CLASS"), null);
});
