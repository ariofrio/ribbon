// What a push or pull request changed, for the jobs that skip work when
// nothing in it can matter to them. The release pull request bumps versions in
// manifests and lockfiles, which would otherwise count as dependency changes.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { isDeepStrictEqual } from "node:util";

/** GitHub lists at most this many files for a pull request. */
const LISTABLE_FILES = 3000;

const FILENAMES = "(.filename, (.previous_filename // empty))";

const MANIFESTS = new Set(["package.json", "package-lock.json"]);

/** A package's own version, which nothing installed or bundled reads. */
function withoutOwnVersions(name, value) {
  const copy = structuredClone(value);
  delete copy.version;
  if (name === "package-lock.json") {
    for (const [path, entry] of Object.entries(copy.packages ?? {})) {
      // The root and workspace packages; installed ones live in node_modules.
      if (!path.includes("node_modules/")) delete entry.version;
    }
  }
  return copy;
}

/** Whether a file changed nothing but the versions of the packages it defines. */
export function versionOnly(path, before, after) {
  const name = basename(path);
  if (!MANIFESTS.has(name)) return false;
  if (before === null || after === null) return false;
  try {
    return isDeepStrictEqual(
      withoutOwnVersions(name, JSON.parse(before)),
      withoutOwnVersions(name, JSON.parse(after)),
    );
  } catch {
    return false;
  }
}

function lines(text) {
  return text.split("\n").filter((line) => line.trim() !== "");
}

function ghApi(args) {
  return execFileSync("gh", ["api", ...args], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

/**
 * Every path the event changed except version bumps, or null when GitHub
 * cannot list them all.
 */
export function substantiveChanges({
  eventName = process.env.GITHUB_EVENT_NAME,
  event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8")),
  repository = process.env.GITHUB_REPOSITORY,
  gh = ghApi,
} = {}) {
  let paths;
  let base;
  let head;
  if (eventName === "push") {
    // main only fast-forwards, so the commit it moved from is the base.
    base = event.before;
    head = event.after;
    paths = gh([
      "--paginate",
      `/repos/${repository}/compare/${base}...${head}`,
      "--jq",
      `.files[] | ${FILENAMES}`,
    ]);
  } else {
    const pull = event.pull_request;
    if (pull.changed_files > LISTABLE_FILES) return null;
    paths = gh([
      "--paginate",
      `/repos/${repository}/pulls/${pull.number}/files?per_page=100`,
      "--jq",
      `.[] | ${FILENAMES}`,
    ]);
    head = pull.head.sha;
    // The files a pull request lists are relative to where it branched.
    base = lines(
      gh([
        `/repos/${repository}/compare/${pull.base.sha}...${head}`,
        "--jq",
        ".merge_base_commit.sha",
      ]),
    )[0];
  }

  const read = (path, ref) => {
    try {
      return gh([
        "-H",
        "Accept: application/vnd.github.raw+json",
        `/repos/${repository}/contents/${path}?ref=${ref}`,
      ]);
    } catch {
      return null;
    }
  };
  return [...new Set(lines(paths))].filter(
    (path) =>
      !MANIFESTS.has(basename(path)) ||
      !versionOnly(path, read(path, base), read(path, head)),
  );
}

/**
 * What a relevance CLI judges: the workflow event's substantive changes, or
 * the paths piped to it when run by hand.
 */
export async function changedPaths() {
  if (process.env.GITHUB_EVENT_PATH) {
    const paths = substantiveChanges();
    console.error(paths?.join("\n") ?? "Too many files to list.");
    return paths;
  }
  let text = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) text += chunk;
  return lines(text);
}
