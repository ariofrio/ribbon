import { lstat, mkdir, readFile, realpath, rm, stat } from "node:fs/promises";
import { isAbsolute, join, relative, sep } from "node:path";
import { randomUUID } from "node:crypto";
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { installedSkill, rpcContract, skillOperation, type SkillOperation, type SkillUpdateCheck } from "./contract";
import { runGh } from "./gh";
import { skillDocument } from "./skill-document";

export default async function plugin(bb: BbPluginApi) {
  const directory = join(bb.server.experimental_dataDir, "skills");
  const lifecycle = new AbortController();
  bb.onDispose(() => lifecycle.abort());
  const gh = async (...args: string[]) => {
    await mkdir(directory, { recursive: true });
    return runGh(args, directory, lifecycle.signal);
  };
  const api = (...args: string[]) => runGh(args, directory, lifecycle.signal, "api");
  async function preview(repository: string, skill: string, allowHidden: boolean) {
    const output = await gh("preview", ...(allowHidden ? ["--allow-hidden-dirs"] : []), "--", repository, skill);
    const separator = skill.lastIndexOf("@");
    const path = separator > 0 ? skill.slice(0, separator) : skill;
    if (!path.endsWith("SKILL.md") || path.split("/").some((part) => part === ".." || part === "." || !part)) return { output };
    try {
      let ref = separator > 0 ? skill.slice(separator + 1) : "";
      if (!ref) {
        try { ref = z.object({ tag_name: z.string().min(1) }).parse(JSON.parse(await api(`repos/${repository}/releases/latest`))).tag_name; }
        catch (cause) {
          if (!(cause instanceof Error) || !cause.message.includes("404")) throw cause;
          ref = z.object({ default_branch: z.string().min(1) }).parse(JSON.parse(await api(`repos/${repository}`))).default_branch;
        }
      }
      const content = await api(`repos/${repository}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(ref)}`, "--header", "Accept: application/vnd.github.raw+json");
      if (Buffer.byteLength(content) > 1024 * 1024) return { output };
      const document = skillDocument(content);
      return { output, content: document.content, description: document.description, sourcePath: path, ref };
    } catch { return { output }; }
  }
  async function list() {
    const output = await gh("list", "--dir", directory, "--json", "skillName,sourceURL,version,pinned,path");
    const entries = z.array(installedSkill.omit({ id: true, description: true, sourcePath: true })).nullable().parse(JSON.parse(output));
    const skills = await Promise.all((entries ?? []).map(async (entry) => {
      const id = relative(directory, entry.path);
      if (!id || id.startsWith(`..${sep}`) || id === ".." || isAbsolute(id)) {
        throw new Error("gh skill returned a path outside the BB server skills directory.");
      }
      let description = "", sourcePath = "";
      try { ({ description, sourcePath } = skillDocument(await readSkillFile(entry.path))); } catch { /* Unreadable skills still appear in inventory. */ }
      return { ...entry, id: id.split(sep).join("/"), description, sourcePath };
    }));
    return { directory, skills };
  }
  async function readSkillFile(path: string) {
    const root = await realpath(directory);
    const resolved = await realpath(path);
    const inside = relative(root, resolved);
    if (!inside || inside === ".." || inside.startsWith(`..${sep}`) || isAbsolute(inside) || (await lstat(path)).isSymbolicLink()) throw new Error("The skill resolves outside the BB server skills directory.");
    const file = await realpath(join(resolved, "SKILL.md"));
    if (relative(resolved, file) !== "SKILL.md") throw new Error("SKILL.md must be inside its installed skill directory.");
    if ((await stat(file)).size > 1024 * 1024) throw new Error("SKILL.md is too large to preview (maximum 1 MiB).");
    return readFile(file, "utf8");
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
  let revision = 0;
  let lastCheck: SkillUpdateCheck | undefined;
  let pendingCheck: Promise<SkillUpdateCheck> | undefined;
  async function check(force: boolean) {
    if (operation?.state === "running") throw new Error("Wait for the current skill operation to finish before checking updates.");
    if (!force && lastCheck && Date.now() - lastCheck.checkedAt < 5 * 60_000) return lastCheck;
    if (pendingCheck) return pendingCheck;
    const startedRevision = revision;
    const request = gh("update", "--dir", directory, "--all", "--dry-run").then((output) => {
      const updates = [...output.matchAll(/^\s*•\s+(.+?)\s+\(([^\s)]+)\)\s+(\S+)\s+>\s+(\S+)\s+\[([^\]\r\n]+)\]\s*$/gmu)].map((match) => ({ skillName: match[1]!, repository: match[2]!, from: match[3]!, to: match[4]!, ref: match[5]! }));
      const result = { output, updates, checkedAt: Date.now() };
      if (revision === startedRevision) lastCheck = result;
      return result;
    });
    pendingCheck = request;
    try { return await request; } finally { if (pendingCheck === request) pendingCheck = undefined; }
  }
  if (operation?.state === "running") {
    operation = { ...operation, state: "failed", finishedAt: Date.now(), error: "The plugin stopped before this operation finished. Refresh your skills before retrying." };
    await bb.storage.kv.set("lastOperation", operation);
  }
  async function publishOperation() {
    await bb.storage.kv.set("lastOperation", operation);
    bb.realtime.publish("skills.operation", null);
  }
  async function mutate(kind: SkillOperation["kind"], target: string, run: () => Promise<string>, repository?: string) {
    if (operation?.state === "running") throw new Error("Another skill operation is in progress. Wait for it to finish.");
    revision++; lastCheck = undefined; pendingCheck = undefined;
    operation = { id: randomUUID(), kind, target, ...(repository ? { repository } : {}), state: "running", startedAt: Date.now() };
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
    "skills.check": ({ force }) => check(force),
    "skills.list": list,
    "skills.search": async ({ query, owner, page, limit }) => {
      const args = ["search", "--limit", String(limit), "--page", String(page), "--json", "skillName,namespace,repo,path,description,stars"];
      if (owner) args.push("--owner", owner);
      args.push("--", query);
      return rpcContract["skills.search"].output.parse({ skills: JSON.parse(await gh(...args)) ?? [] });
    },
    "skills.preview": ({ repository, skill, allowHidden }) => preview(repository, skill, allowHidden),
    "skills.discover": async ({ repository, allowHidden, pin }) => {
      const output = await gh("install", "--dir", directory, ...(allowHidden ? ["--allow-hidden-dirs"] : []), ...(pin ? ["--pin", pin] : []), "--", repository);
      const skills = output.split(/\r?\n/u).filter((line) => line.includes("\t")).map((line) => {
        const [name, ...description] = line.split("\t");
        return { name: name!.trim(), description: description.join("\t").trim() };
      }).filter((entry) => entry.name && entry.name !== "SKILL");
      return { output, skills };
    },
    "skills.install": (input) => mutate("install", input.all ? input.repository : input.skill!, () => {
      const args = ["install", "--dir", directory];
      if (input.pin) args.push("--pin", input.pin);
      if (input.all) args.push("--all");
      if (input.force) args.push("--force");
      if (input.allowHidden) args.push("--allow-hidden-dirs");
      args.push("--", input.repository);
      if (input.skill) args.push(input.skill);
      return gh(...args);
    }, input.repository),
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
      return { content: skillDocument(await readSkillFile(path)).content };
    },
    "skills.remove": ({ id }) => mutate("remove", id, async () => {
      await rm(await installedPath(id), { recursive: true });
      return `Removed ${id}.`;
    }),
  });
}
