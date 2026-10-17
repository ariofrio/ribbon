// Hash the checked-out merge tree, including names and modes. Only the
// generated screenshots are omitted; they cannot change what the tests run.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const GENERATED = /^(?:assets\/hero-(?:light|dark)\.png|plugins\/[^/]+\/assets\/(?:screenshot|card|card-beside)-(?:light|dark)\.png)$/u;

export function validationKey(tree) {
  const inputs = tree.split("\0")
    .filter((entry) => entry && !GENERATED.test(entry.slice(entry.indexOf("\t") + 1)))
    .join("\0");
  return createHash("sha256").update(inputs).digest("hex");
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] ?? "")).href) {
  const tree = execFileSync("git", ["ls-tree", "-r", "-z", "HEAD"], { encoding: "utf8" });
  process.stdout.write(`key=${validationKey(tree)}\n`);
}
