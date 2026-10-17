import { lstat, mkdir, readFile, realpath, rm, stat } from "node:fs/promises";
import { isAbsolute, join, relative, sep } from "node:path";
import { randomUUID } from "node:crypto";
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { installedSkill, rpcContract, skillOperation, type SkillOperation } from "./contract";
import { runGh } from "./gh";

export default async function plugin(bb: BbPluginApi) {
  const directory = join(bb.server.experimental_dataDir, "skills");
  const lifecycle = new AbortController();
  bb.onDispose(() => lifecycle.abort());
  const gh = async (...args: string[]) => {
    await mkdir(directory, { recursive: true });
    return runGh(args, directory, lifecycle.signal);
  };
  async function list() {
    const output = await gh("list", "--dir", directory, "--json", "skillName,sourceURL,version,pinned,path");
    const entries = z.array(installedSkill.omit({ id: true })).nullable().parse(JSON.parse(output));
    const skills = (entries ?? []).map((entry) => {
      const id = relative(directory, entry.path);
      if (!id || id.startsWith(`..${sep}`) || id === ".." || isAbsolute(id)) {
        throw new Error("gh skill returned a path outside the BB server skills directory.");
      }
      return { ...entry, id: id.split(sep).join("/") };
    });
    return { directory, skills };
  }
  async function installedPath(id: string) {
    const entry = (await list()).skills.find((skill) => skill.id === id);
    if (!entry) throw new Error("This skill is no longer installed. Refresh the list.");
    const root = await realpath(directory);
    const path = await realpath(entry.path);
    const inside = relative(root, path);
    if (!inside || inside === ".." || inside.startsWith(`..${sep}`) || isAbsolute(inside)) {
      throw new Error("The skill resolves outside the BB server skills directory.");
    }
    if ((await lstat(entry.path)).isSymbolicLink()) throw new Error("Symlinked skill directories are not supported.");
    return path;
  }
  const saved = skillOperation.safeParse(await bb.storage.kv.get("lastOperation"));
  let operation: SkillOperation | null = saved.success ? saved.data : null;
  if (operation?.state === "running") {
    operation = { ...operation, state: "failed", finishedAt: Date.now(), error: "The plugin stopped before this operation finished. Refresh your skills before retrying." };
    await bb.storage.kv.set("lastOperation", operation);
  }
  async function publishOperation() {
    await bb.storage.kv.set("lastOperation", operation);
    bb.realtime.publish("skills.operation", null);
  }
  async function mutate(kind: SkillOperation["kind"], target: string, run: () => Promise<string>) {
    if (operation?.state === "running") throw new Error("Another skill operation is in progress. Wait for it to finish.");
    operation = { id: randomUUID(), kind, target, state: "running", startedAt: Date.now() };
    try {
      await publishOperation();
      const output = await run();
      operation = { ...operation, state: "succeeded", output: output.slice(-16 * 1024), finishedAt: Date.now() };
      return { output };
    } catch (cause) {
      operation = { ...operation, state: "failed", error: (cause instanceof Error ? cause.message : String(cause)).slice(-16 * 1024), finishedAt: Date.now() };
      throw cause;
    } finally {
      if (!lifecycle.signal.aborted) {
        await publishOperation();
        bb.realtime.publish("skills.changed", null);
      }
    }
  }
  bb.rpc.register(rpcContract, {
    "skills.operation": async () => operation,
    "skills.list": list,
    "skills.search": async ({ query, owner, page }) => {
      const args = ["search", "--limit", "20", "--page", String(page), "--json", "skillName,namespace,repo,path,description,stars"];
      if (owner) args.push("--owner", owner);
      args.push("--", query);
      return rpcContract["skills.search"].output.parse({ skills: JSON.parse(await gh(...args)) ?? [] });
    },
    "skills.preview": async ({ repository, skill, allowHidden }) => ({
      output: await gh("preview", ...(allowHidden ? ["--allow-hidden-dirs"] : []), "--", repository, skill),
    }),
    "skills.discover": async ({ repository, allowHidden }) => ({
      output: await gh("install", "--dir", directory, ...(allowHidden ? ["--allow-hidden-dirs"] : []), "--", repository),
    }),
    "skills.install": (input) => mutate("install", input.all ? input.repository : input.skill!, () => {
      const args = ["install", "--dir", directory];
      if (input.pin) args.push("--pin", input.pin);
      if (input.all) args.push("--all");
      if (input.force) args.push("--force");
      if (input.allowHidden) args.push("--allow-hidden-dirs");
      args.push("--", input.repository);
      if (input.skill) args.push(input.skill);
      return gh(...args);
    }),
    "skills.update": (input) => mutate(input.dryRun ? "check" : "update", input.id ?? "all skills", async () => {
      const args = ["update", "--dir", directory, "--all"];
      if (input.dryRun) args.push("--dry-run");
      if (input.force) args.push("--force");
      if (input.unpin) args.push("--unpin");
      if (input.id) {
        const entry = (await list()).skills.find((skill) => skill.id === input.id);
        if (!entry) throw new Error("This skill is no longer installed. Refresh the list.");
        args.push("--", entry.skillName);
      }
      return gh(...args);
    }),
    "skills.read": async ({ id }) => {
      const path = await installedPath(id);
      const file = await realpath(join(path, "SKILL.md"));
      if (relative(path, file) !== "SKILL.md") throw new Error("SKILL.md must be inside its installed skill directory.");
      if ((await stat(file)).size > 1024 * 1024) throw new Error("SKILL.md is too large to preview (maximum 1 MiB).");
      return { content: await readFile(file, "utf8") };
    },
    "skills.remove": ({ id }) => mutate("remove", id, async () => {
      await rm(await installedPath(id), { recursive: true });
      return `Removed ${id}.`;
    }),
  });
}
