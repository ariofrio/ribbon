// A version-only change is what the release pull request makes to every
// manifest it touches. Calling a real change version-only skips the jobs that
// would have caught it, so every doubt has to fall on the side of running them.
import assert from "node:assert/strict";
import test from "node:test";
import { substantiveChanges, versionOnly } from "./changes.mjs";

const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

const manifest = (version, extra = {}) =>
  json({ name: "bb-plugin-example", version, ...extra });

const lockfile = (version, playwright = "1.62.1") =>
  json({
    name: "ribbon",
    version: "0.0.0",
    lockfileVersion: 3,
    packages: {
      "": { name: "ribbon", version: "0.0.0", workspaces: ["plugins/*"] },
      "node_modules/bb-plugin-example": {
        resolved: "plugins/bb-plugin-example",
        link: true,
      },
      "node_modules/playwright": {
        version: playwright,
        resolved: `https://registry.npmjs.org/playwright/-/playwright-${playwright}.tgz`,
        integrity: `sha512-${playwright}`,
      },
      "plugins/bb-plugin-example": {
        name: "bb-plugin-example",
        version,
        dependencies: { react: "^19.0.0" },
      },
    },
  });

test("a manifest whose only change is its version is version-only", () => {
  assert.ok(
    versionOnly("plugins/x/package.json", manifest("0.6.0"), manifest("0.7.0")),
  );
});

test("a manifest that also changes a dependency is not", () => {
  assert.equal(
    versionOnly(
      "plugins/x/package.json",
      manifest("0.6.0"),
      manifest("0.7.0", { dependencies: { react: "^19.1.0" } }),
    ),
    false,
  );
});

test("a lockfile that bumps its own packages is version-only", () => {
  assert.ok(
    versionOnly("package-lock.json", lockfile("0.6.0"), lockfile("0.7.0")),
  );
});

test("a lockfile that moves an installed package is not", () => {
  assert.equal(
    versionOnly(
      "package-lock.json",
      lockfile("0.6.0"),
      lockfile("0.7.0", "1.63.0"),
    ),
    false,
  );
});

test("only manifests and lockfiles can be version-only", () => {
  const text = json({ version: "1" });
  assert.equal(versionOnly("tsconfig.json", text, json({ version: "2" })), false);
  assert.equal(versionOnly("package.json", text, text), true);
});

test("an added, deleted, or unreadable file is not version-only", () => {
  assert.equal(versionOnly("package.json", null, manifest("0.7.0")), false);
  assert.equal(versionOnly("package.json", manifest("0.6.0"), null), false);
  assert.equal(versionOnly("package.json", "{", manifest("0.7.0")), false);
});

/** A stand-in for `gh api` that answers from a table of routes. */
function fakeGh(routes) {
  const calls = [];
  const gh = (args) => {
    calls.push(args);
    const route = args.find((arg) => arg.startsWith("/repos/"));
    const answer = routes[route];
    if (answer === undefined) throw new Error(`gh api ${route}: 404`);
    return answer;
  };
  return { gh, calls };
}

const repository = "ariofrio/ribbon";
const raw = (path, ref) => `/repos/${repository}/contents/${path}?ref=${ref}`;

test("a pull request drops its version bumps and keeps everything else", () => {
  const { gh } = fakeGh({
    [`/repos/${repository}/pulls/135/files?per_page=100`]: [
      ".changeset/a.md",
      "package-lock.json",
      "plugins/x/package.json",
      "plugins/x/CHANGELOG.md",
      "plugins/y/package.json",
    ].join("\n"),
    [`/repos/${repository}/compare/base...head`]: "merge-base\n",
    [raw("package-lock.json", "merge-base")]: lockfile("0.6.0"),
    [raw("package-lock.json", "head")]: lockfile("0.7.0"),
    [raw("plugins/x/package.json", "merge-base")]: manifest("0.6.0"),
    [raw("plugins/x/package.json", "head")]: manifest("0.7.0"),
    [raw("plugins/y/package.json", "merge-base")]: manifest("0.1.0"),
    [raw("plugins/y/package.json", "head")]: manifest("0.1.0", {
      dependencies: { react: "^19.1.0" },
    }),
  });
  const paths = substantiveChanges({
    eventName: "pull_request",
    event: {
      pull_request: {
        number: 135,
        changed_files: 5,
        base: { sha: "base" },
        head: { sha: "head" },
      },
    },
    repository,
    gh,
  });
  assert.deepEqual(paths, [
    ".changeset/a.md",
    "plugins/x/CHANGELOG.md",
    "plugins/y/package.json",
  ]);
});

// main only fast-forwards, so the commit a push moved it from is the base.
test("a push compares the commits it moved main between", () => {
  const { gh } = fakeGh({
    [`/repos/${repository}/compare/before...after`]: "plugins/x/package.json\n",
    [raw("plugins/x/package.json", "before")]: manifest("0.6.0"),
    [raw("plugins/x/package.json", "after")]: manifest("0.7.0"),
  });
  const paths = substantiveChanges({
    eventName: "push",
    event: { before: "before", after: "after" },
    repository,
    gh,
  });
  assert.deepEqual(paths, []);
});

// GitHub lists at most 3000 files for a pull request, so a longer list is
// incomplete and cannot prove anything irrelevant.
test("a pull request too large to list is unknown", () => {
  const { gh, calls } = fakeGh({});
  const paths = substantiveChanges({
    eventName: "pull_request",
    event: { pull_request: { number: 1, changed_files: 3001 } },
    repository,
    gh,
  });
  assert.equal(paths, null);
  assert.deepEqual(calls, []);
});
