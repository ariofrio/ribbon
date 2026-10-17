// Screenshot commits need fresh required checks, but do not change the code
// already exercised by CI. Reuse only evidence uploaded by those workflows:
// the exact commit the renderer produced, and the tree the tests passed on.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const KINDS = new Set(["plugins", "screenshots"]);
const SHA = /^[a-f0-9]{40}$/u;
const GENERATED = /^(?:assets\/hero-(?:light|dark)\.png|plugins\/[^/]+\/assets\/(?:screenshot|card|card-beside)-(?:light|dark)\.png)$/u;
const validationPath = ".scratch/work/ci-validation/validation.json";

function gitCommand(args) {
  return execFileSync("git", args, { encoding: "utf8" });
}

function ghApi(route) {
  return JSON.parse(execFileSync("gh", ["api", route], {
    encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  }));
}

function readEvent() {
  return JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
}

export function validationRecord(kind, { git = gitCommand, event } = {}) {
  if (!KINDS.has(kind)) throw new Error(`Unknown validation kind: ${kind}`);
  if (kind === "screenshots") {
    event ??= readEvent();
    return {
      kind,
      source: event.pull_request?.head.sha ?? event.after,
      commit: git(["rev-parse", "HEAD"]).trim(),
    };
  }
  // Include modes, object IDs, paths, and every non-generated file. In a PR
  // this is the checked-out merge tree, so a changed base invalidates reuse.
  const entries = git(["ls-tree", "-r", "-z", "HEAD"])
    .split("\0")
    .filter((entry) => entry && !GENERATED.test(entry.slice(entry.indexOf("\t") + 1)))
    .map((entry) => `${entry}\0`)
    .join("");
  return { kind, tree: createHash("sha256").update(entries).digest("hex") };
}

function downloadProof(run, name) {
  const root = resolve(".scratch/work/ci-reuse");
  mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "proof-"));
  try {
    execFileSync("gh", ["run", "download", String(run.id), "--name", name, "--dir", directory], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    return JSON.parse(readFileSync(join(directory, "validation.json"), "utf8"));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function waitForRun(run) {
  console.error(`Waiting for ${run.html_url} to finish validating the unchanged inputs.`);
  execFileSync("gh", ["run", "watch", String(run.id), "--exit-status", "--interval", "10"], {
    stdio: ["ignore", "ignore", "pipe"],
    timeout: 15 * 60 * 1000,
  });
}

export async function canReuse({
  kind,
  eventName = process.env.GITHUB_EVENT_NAME,
  event = readEvent(),
  repository = process.env.GITHUB_REPOSITORY,
  git = gitCommand,
  gh = ghApi,
  download = downloadProof,
  wait = waitForRun,
}) {
  if (!KINDS.has(kind)) throw new Error(`Unknown validation kind: ${kind}`);
  const pull = event.pull_request;
  if (eventName !== "pull_request" || event.action !== "synchronize" ||
      !SHA.test(event.before ?? "") || !SHA.test(event.after ?? "") ||
      event.after !== pull?.head?.sha || pull?.head?.repo?.full_name !== repository) {
    return false;
  }

  try {
    const runs = (workflow) => {
      const result = gh(`/repos/${repository}/actions/workflows/${workflow}.yml/runs?event=pull_request&head_sha=${event.before}&per_page=100`);
      // API lists are bounded. Incomplete evidence cannot authorize a skip.
      if (result.total_count !== result.workflow_runs?.length) return [];
      return result.workflow_runs.filter((run) =>
        run.event === "pull_request" && run.head_sha === event.before &&
        run.head_branch === pull.head.ref && run.head_repository?.full_name === repository)
        .sort((a, b) => b.id - a.id);
    };
    const proof = (run, workflow) => {
      const result = gh(`/repos/${repository}/actions/runs/${run.id}/artifacts?per_page=100`);
      if (result.total_count !== result.artifacts?.length) return null;
      const name = `ci-validation-${workflow}-${run.run_attempt}`;
      if (!result.artifacts.some((artifact) => artifact.name === name && !artifact.expired)) return null;
      return download(run, name);
    };

    // This artifact is uploaded after capture and commit, before the push.
    // Its existence does not depend on the producer surviving self-cancellation.
    const producer = runs("screenshots").find((run) => {
      const record = proof(run, "screenshots");
      return record?.kind === "screenshots" && record.source === event.before && record.commit === event.after;
    });
    if (!producer) return false;
    if (kind === "screenshots") {
      console.error(`Reusing the capture from run ${producer.id}.`);
      return true;
    }

    let [run] = runs("plugins");
    if (!run) return false;
    if (run.status !== "completed") {
      await wait(run);
      run = gh(`/repos/${repository}/actions/runs/${run.id}`);
    }
    if (run.status !== "completed" || run.conclusion !== "success") return false;
    const record = proof(run, "plugins");
    const matches = record?.kind === "plugins" && record.tree === validationRecord("plugins", { git }).tree;
    if (matches) console.error(`Reusing successful plugin validation from run ${run.id}.`);
    return matches;
  } catch (error) {
    // Missing permissions, expired evidence, API failures, and failed previous
    // runs all take the ordinary validation path, never a successful skip.
    console.error(`Cannot reuse CI validation: ${error.message}`);
    return false;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [operation, kind] = process.argv.slice(2);
  if (operation === "record") {
    const record = validationRecord(kind);
    mkdirSync(resolve(validationPath, ".."), { recursive: true });
    writeFileSync(validationPath, `${JSON.stringify(record)}\n`);
  } else if (operation === "reuse") {
    process.stdout.write(`reuse=${await canReuse({ kind })}\n`);
  } else {
    throw new Error("Usage: node scripts/ci-reuse.mjs record|reuse plugins|screenshots");
  }
}
