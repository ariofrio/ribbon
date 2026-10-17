import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";
import { canReuse, validationRecord } from "./ci-reuse.mjs";

const repository = "ariofrio/ribbon";
const before = "a".repeat(40);
const after = "b".repeat(40);
const event = {
  action: "synchronize",
  before,
  after,
  pull_request: {
    head: { sha: after, ref: "feature", repo: { full_name: repository } },
  },
};
const entry = (path, hash = "c".repeat(40), mode = "100644") =>
  `${mode} blob ${hash}\t${path}\0`;
const source = entry("plugins/x/src/app.tsx");
const picture = entry("plugins/x/assets/screenshot-light.png");
const tree = createHash("sha256").update(source).digest("hex");

function fixture({ screenshot = true, plugins = true, pending = false } = {}) {
  const calls = [];
  const runs = {
    "screenshots.yml": { id: 10, run_attempt: 1 },
    "plugins.yml": { id: 20, run_attempt: 2 },
  };
  for (const run of Object.values(runs)) {
    Object.assign(run, {
      head_sha: before,
      head_branch: "feature",
      head_repository: { full_name: repository },
      event: "pull_request",
      status: "completed",
      conclusion: "success",
    });
  }
  // The screenshot push can cancel the producing run after it uploaded proof.
  runs["screenshots.yml"].conclusion = "cancelled";
  if (pending) {
    runs["plugins.yml"].status = "in_progress";
    runs["plugins.yml"].conclusion = null;
  }
  const records = {
    10: screenshot ? { kind: "screenshots", source: before, commit: after } : null,
    20: plugins ? { kind: "plugins", tree } : null,
  };
  const options = {
    kind: "plugins",
    eventName: "pull_request",
    event: structuredClone(event),
    repository,
    git: () => source + picture,
    gh: (route) => {
      calls.push(route);
      if (route.includes("/workflows/")) {
        const name = route.split("/workflows/")[1].split("/")[0];
        const run = runs[name];
        return { total_count: 1, workflow_runs: [run] };
      }
      const single = /\/runs\/(\d+)$/u.exec(route);
      if (single) return Object.values(runs).find((run) => run.id === Number(single[1]));
      const id = Number(/\/runs\/(\d+)\//u.exec(route)?.[1]);
      const run = Object.values(runs).find((value) => value.id === id);
      const kind = id === 10 ? "screenshots" : "plugins";
      const artifacts = records[id] && run.status === "completed"
        ? [{ name: `ci-validation-${kind}-${run.run_attempt}`, expired: false }]
        : [];
      return { total_count: artifacts.length, artifacts };
    },
    download: (run, name) => {
      calls.push({ download: run.id, name });
      return records[run.id];
    },
    wait: async (run) => {
      calls.push({ wait: run.id });
      run.status = "completed";
      run.conclusion = "success";
    },
  };
  return { options, calls, records, runs };
}

test("a CI-produced screenshot commit reuses successful tests of the same inputs", async () => {
  const { options, calls } = fixture();
  assert.equal(await canReuse(options), true);
  assert.ok(calls.some((call) => call.name === "ci-validation-plugins-2"));
});

test("screenshots reuse the producing run even when its own push cancelled it", async () => {
  const { options, calls } = fixture();
  options.kind = "screenshots";
  assert.equal(await canReuse(options), true);
  assert.equal(calls.some((call) => call.download === 20), false);
});

test("a screenshot update waits for the original tests before reusing them", async () => {
  const { options, calls } = fixture({ pending: true });
  assert.equal(await canReuse(options), true);
  assert.ok(calls.some((call) => call.wait === 20));
});

test("failed, cancelled, and skipped test runs cannot be reused", async () => {
  for (const conclusion of ["failure", "cancelled", "skipped", null]) {
    const { options, runs } = fixture();
    runs["plugins.yml"].conclusion = conclusion;
    assert.equal(await canReuse(options), false, String(conclusion));
  }
});

test("a failed wait falls back to running the tests", async () => {
  const { options } = fixture({ pending: true });
  options.wait = async () => { throw new Error("previous tests failed"); };
  assert.equal(await canReuse(options), false);
});

test("missing, expired, or wrong-attempt proof cannot authorize reuse", async () => {
  for (const kind of ["screenshots", "plugins"]) {
    const { options } = fixture({ [kind === "screenshots" ? "screenshot" : kind]: false });
    assert.equal(await canReuse(options), false, kind);
  }
  for (const artifact of [
    { name: "ci-validation-screenshots-1", expired: true },
    { name: "ci-validation-screenshots-2", expired: false },
  ]) {
    const { options } = fixture();
    const gh = options.gh;
    options.gh = (route) => route.endsWith("/artifacts?per_page=100")
      ? { total_count: 1, artifacts: [artifact] } : gh(route);
    assert.equal(await canReuse(options), false);
  }
});

test("manual or amended images and a different capture source need a full run", async () => {
  for (const change of [{ commit: "d".repeat(40) }, { source: "e".repeat(40) }, { kind: "plugins" }]) {
    const { options, records } = fixture();
    Object.assign(records[10], change);
    assert.equal(await canReuse(options), false);
  }
});

test("source, workflow, icon, and merge-base changes invalidate prior tests", async () => {
  for (const path of [
    "plugins/x/src/app.tsx", ".github/workflows/plugins.yml",
    "plugins/x/assets/icon.svg", "assets/other.png", "package-lock.json",
  ]) {
    const { options } = fixture();
    options.git = () => source + entry(path, "d".repeat(40)) + picture;
    assert.equal(await canReuse(options), false, path);
  }
});

test("only generated screenshots are excluded from the tested tree", () => {
  for (const path of [
    "assets/hero-dark.png", "assets/hero-light.png",
    "plugins/x/assets/screenshot-dark.png", "plugins/x/assets/card-light.png",
    "plugins/x/assets/card-beside-dark.png",
  ]) {
    assert.deepEqual(validationRecord("plugins", { git: () => source + entry(path) }),
      { kind: "plugins", tree });
  }
  assert.notEqual(validationRecord("plugins", { git: () => source.replace("100644", "100755") }).tree, tree);
});

test("real Git trees retain their validation across recapture but not source or base changes", (t) => {
  const root = resolve(".scratch/work");
  mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "ci-tree-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const git = (args) => execFileSync("git", args, { cwd: directory, encoding: "utf8" });
  git(["init", "--quiet"]);
  git(["config", "user.name", "CI tree test"]);
  git(["config", "user.email", "ci@example.test"]);
  mkdirSync(join(directory, "assets"));
  writeFileSync(join(directory, "app.js"), "source\n");
  writeFileSync(join(directory, "assets/hero-dark.png"), "initial picture\n");
  git(["add", "."]);
  git(["commit", "--quiet", "-m", "initial"]);
  const original = validationRecord("plugins", { git });
  writeFileSync(join(directory, "assets/hero-dark.png"), "recaptured picture\n");
  git(["commit", "--quiet", "-am", "recapture"]);
  assert.deepEqual(validationRecord("plugins", { git }), original);
  writeFileSync(join(directory, "base.js"), "change from the base branch\n");
  git(["add", "."]);
  git(["commit", "--quiet", "-m", "updated merge tree"]);
  assert.notDeepEqual(validationRecord("plugins", { git }), original);
});

test("the capture proof binds the resulting commit to the source actually captured", () => {
  assert.deepEqual(validationRecord("screenshots", {
    git: () => after,
    event: { pull_request: { head: { sha: before } } },
  }), { kind: "screenshots", commit: after, source: before });
});

test("ordinary pushes, PR opens, forks, and malformed events do not reuse", async () => {
  for (const change of [
    { eventName: "push" }, { event: { ...event, action: "opened" } },
    { event: { ...event, before: undefined } },
    { event: { ...event, after: "c".repeat(40) } },
    { event: { ...event, pull_request: {} } },
    { repository: "someone/fork" },
  ]) {
    const { options, calls } = fixture();
    Object.assign(options, change);
    assert.equal(await canReuse(options), false);
    assert.deepEqual(calls, []);
  }
});

test("runs from another branch, repository, head, or event cannot supply proof", async () => {
  for (const change of [
    { head_branch: "other" }, { head_sha: "f".repeat(40) },
    { head_repository: { full_name: "someone/fork" } }, { event: "workflow_dispatch" },
  ]) {
    const { options, runs } = fixture();
    Object.assign(runs["screenshots.yml"], change);
    assert.equal(await canReuse(options), false);
  }
});

test("truncated API lists and unavailable evidence fall back to a full run", async () => {
  for (const response of [
    { total_count: 101, workflow_runs: [] },
    { total_count: 101, artifacts: [] },
    null,
  ]) {
    const { options } = fixture();
    options.gh = () => {
      if (response === null) throw new Error("API unavailable");
      return response;
    };
    assert.equal(await canReuse(options), false);
  }
  const { options } = fixture();
  const gh = options.gh;
  options.gh = (route) => route.includes("/artifacts?")
    ? { total_count: 101, artifacts: [] } : gh(route);
  assert.equal(await canReuse(options), false);
});
