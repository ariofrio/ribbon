import assert from "node:assert/strict";
import test from "node:test";
import { layoutProblems, sharedFileProblems } from "./plugin-layout.mjs";

/** A plugin that follows every rule, for a test to break one thing in. */
function plugin(overrides = {}) {
  return {
    id: "bb-plugin-example",
    manifest: {
      bb: { name: "Example plugin", server: "./src/server.ts", app: "./src/app.tsx" },
      files: [
        "assets",
        "!assets/screenshot*.png",
        "!assets/card*.png",
        "dist",
        "src",
        "!src/**/*.test.ts",
        "!src/**/*.test.tsx",
      ],
    },
    tsconfig: { compilerOptions: { paths: { "@/*": ["./src/*"] } } },
    rootEntries: ["package.json", "tsconfig.json", "README.md", "src", "assets"],
    sources: ["src/app.tsx", "src/app.test.tsx"],
    assets: ["icon.svg", "screenshot-light.png", "card-light.png"],
    importsAlias: true,
    testsImportAlias: false,
    vitestMapsAlias: true,
    ...overrides,
  };
}

const problems = (overrides) => layoutProblems(plugin(overrides));

test("a plugin that follows the rules reports nothing", () => {
  assert.deepEqual(problems(), []);
});

// bb renders the name as written, so Title Case there is visible to a reader.
test("a Title Case plugin name is reported", () => {
  const named = (name) => ({
    manifest: { ...plugin().manifest, bb: { ...plugin().manifest.bb, name } },
  });
  assert.match(problems(named("Missing Keyboard Shortcuts")).join(), /sentence case/u);
  assert.deepEqual(problems(named("Missing keyboard shortcuts")), []);
  // A first word that is a proper noun is not Title Case.
  assert.deepEqual(problems(named("ChatGPT theme")), []);
  assert.deepEqual(problems(named("Icons")), []);
});

test("an entry point outside src/ is reported", () => {
  const entry = (bb) => ({ manifest: { ...plugin().manifest, bb: { ...plugin().manifest.bb, ...bb } } });
  assert.match(problems(entry({ server: "./server.ts" })).join(), /bb\.server/u);
  assert.match(problems(entry({ app: "./app.tsx" })).join(), /bb\.app/u);
});

// tsc reads the tsconfig path and vitest does not, so the alias only has to
// exist where the sources actually use it.
test("a missing @/ alias is reported only when the sources use one", () => {
  assert.match(problems({ tsconfig: { compilerOptions: {} } }).join(), /@\/\*/u);
  assert.deepEqual(
    problems({ tsconfig: { compilerOptions: {} }, importsAlias: false }),
    [],
  );
});

test("an alias pointing somewhere other than src/ is reported", () => {
  const problem = problems({
    tsconfig: { compilerOptions: { paths: { "@/*": ["./lib/*"] } } },
  });
  assert.match(problem.join(), /@\/\*/u);
});

// Shipping a test is harmless but pointless; the rule only bites when there
// are tests to ship.
test("tests shipped in the package are reported, and only when tests exist", () => {
  const without = plugin().manifest.files.filter((f) => !f.startsWith("!src/"));
  assert.match(
    problems({ manifest: { ...plugin().manifest, files: without } }).join(),
    /test/u,
  );
  assert.deepEqual(
    problems({
      manifest: { ...plugin().manifest, files: without },
      sources: ["src/app.tsx"],
    }),
    [],
  );
});

test("screenshots shipped in the package are reported, and only when they exist", () => {
  const without = plugin().manifest.files.filter((f) => !f.startsWith("!assets/"));
  assert.match(
    problems({ manifest: { ...plugin().manifest, files: without } }).join(),
    /assets/u,
  );
  assert.deepEqual(
    problems({
      manifest: { ...plugin().manifest, files: without },
      assets: ["icon.svg"],
    }),
    [],
  );
});

// The failure this prevents is a module-resolution error at test time, which
// names the import rather than the missing config.
test("a test importing through the alias needs vitest told about it", () => {
  assert.match(
    problems({ testsImportAlias: true, vitestMapsAlias: false }).join(),
    /vitest\.config\.ts/u,
  );
  assert.deepEqual(problems({ testsImportAlias: true, vitestMapsAlias: true }), []);
  assert.deepEqual(problems({ testsImportAlias: false, vitestMapsAlias: false }), []);
});

test("a stray file in the plugin root is reported", () => {
  assert.match(
    problems({ rootEntries: [...plugin().rootEntries, "helper.ts"] }).join(),
    /helper\.ts/u,
  );
});

test("the directories a plugin is allowed to keep beside src/ are not reported", () => {
  assert.deepEqual(
    problems({
      rootEntries: [
        ...plugin().rootEntries,
        "skills",
        "themes",
        "scripts",
        "vitest.config.ts",
        "CHANGELOG.md",
        "LICENSE",
        "package-lock.json",
        "node_modules",
        "dist",
        ".claude",
      ],
    }),
    [],
  );
});

test("a plugin with no manifest bb block is reported rather than skipped", () => {
  assert.match(problems({ manifest: { files: [] } }).join(), /bb/u);
});

test("a LICENSE that differs from the other plugins is reported", () => {
  const one = { id: "a", license: "MIT\n" };
  assert.deepEqual(sharedFileProblems([one, { id: "b", license: "MIT\n" }]), []);
  assert.match(
    sharedFileProblems([one, { id: "b", license: "Apache\n" }]).join(),
    /b: LICENSE differs from a/u,
  );
});

test("a plugin with no LICENSE at all is reported", () => {
  assert.match(
    sharedFileProblems([{ id: "a", license: "MIT\n" }, { id: "b", license: null }]).join(),
    /b: has no LICENSE/u,
  );
});

test("nothing to compare reports nothing", () => {
  assert.deepEqual(sharedFileProblems([]), []);
});

test("a vitest config that differs from the others is reported", () => {
  const shared = (id, vitestConfig) => ({ id, license: "MIT\n", vitestConfig });
  assert.deepEqual(
    sharedFileProblems([shared("a", "alias\n"), shared("b", "alias\n"), shared("c", null)]),
    [],
  );
  assert.match(
    sharedFileProblems([shared("a", "alias\n"), shared("b", "other\n")]).join(),
    /b: vitest\.config\.ts differs from a/u,
  );
});
