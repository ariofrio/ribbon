import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  digest,
  inspect,
  pluginFiles,
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

test("files land under the plugin's src/, matching the @/* alias", async () => {
  const files = await pluginFiles("plugins/bb-plugin-x", ["icon"], fetchOne);
  assert.deepEqual([...files.keys()].sort(), [
    "plugins/bb-plugin-x/src/components/ui/icon.tsx",
    "plugins/bb-plugin-x/src/lib/utils.ts",
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
  registry: "https://example.test/{name}.json",
  plugins: { "plugins/bb-plugin-x": ["icon"] },
};

const lockFor = (files) => ({
  registry: config.registry,
  files: Object.fromEntries(
    Object.entries(files).map(([path, contents]) => [path, digest(contents)]),
  ),
});

const vendored = {
  "plugins/bb-plugin-x/src/components/ui/icon.tsx": "export const Icon = 0;\n",
  "plugins/bb-plugin-x/src/lib/utils.ts": "export const cn = 0;\n",
};

test("a pristine tree reports no problems", () => {
  const root = writeTree(vendored);
  assert.deepEqual(inspect(root, config, lockFor(vendored)), {
    edited: [],
    missing: [],
    untracked: [],
    stalePin: false,
  });
});

test("a hand-edited bb component is reported", () => {
  const root = writeTree({
    ...vendored,
    "plugins/bb-plugin-x/src/components/ui/icon.tsx":
      "export const Icon = 0; // tweaked\n",
  });
  assert.deepEqual(inspect(root, config, lockFor(vendored)).edited, [
    "plugins/bb-plugin-x/src/components/ui/icon.tsx",
  ]);
});

test("a deleted vendored file is reported", () => {
  const root = writeTree({
    "plugins/bb-plugin-x/src/lib/utils.ts": vendored[
      "plugins/bb-plugin-x/src/lib/utils.ts"
    ],
  });
  assert.deepEqual(inspect(root, config, lockFor(vendored)).missing, [
    "plugins/bb-plugin-x/src/components/ui/icon.tsx",
  ]);
});

test("a file no closure explains is reported as untracked", () => {
  const root = writeTree({
    ...vendored,
    "plugins/bb-plugin-x/src/components/ui/hooks/use-pointer-coarse.ts":
      "export const usePointerCoarse = 0;\n",
  });
  assert.deepEqual(inspect(root, config, lockFor(vendored)).untracked, [
    "plugins/bb-plugin-x/src/components/ui/hooks/use-pointer-coarse.ts",
  ]);
});

test("a plugin's own file in a vendored directory is allowed once declared", () => {
  const root = writeTree({
    ...vendored,
    "plugins/bb-plugin-x/src/components/ui/tooltip.test.tsx": "// mine\n",
  });
  assert.deepEqual(
    inspect(
      root,
      {
        ...config,
        pluginOwned: {
          "plugins/bb-plugin-x": ["components/ui/tooltip.test.tsx"],
        },
      },
      lockFor(vendored),
    ).untracked,
    [],
  );
});

test("bumping the pin without rebuilding is reported", () => {
  const root = writeTree(vendored);
  const problems = inspect(
    root,
    { ...config, registry: "https://example.test/v2/{name}.json" },
    lockFor(vendored),
  );
  assert.equal(problems.stalePin, true);
});

test("vendoredOnDisk lists only the vendored directories", () => {
  const root = writeTree({
    ...vendored,
    "plugins/bb-plugin-x/src/app.tsx": "// not vendored\n",
  });
  assert.deepEqual(vendoredOnDisk(root, "plugins/bb-plugin-x"), [
    "src/components/ui/icon.tsx",
    "src/lib/utils.ts",
  ]);
});
