import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { delimiter, join, resolve } from "node:path";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import plugin from "./server";

let directory: string;
let host: ReturnType<typeof createFakePluginHost>;
let reply: string;
let calls: string;
beforeEach(async () => {
  await mkdir(resolve("../../.scratch/work"), { recursive: true });
  directory = await mkdtemp(resolve("../../.scratch/work/gh-skills-"));
  const bin = join(directory, "bin");
  await mkdir(bin);
  reply = join(directory, "reply.json"); calls = join(directory, "calls.jsonl");
  await writeFile(reply, JSON.stringify({ stdout: "[]" }));
  await writeFile(join(bin, "gh"), `#!${process.execPath}\nimport fs from 'node:fs';fs.appendFileSync(${JSON.stringify(calls)},JSON.stringify(process.argv.slice(2))+'\\n');const r=JSON.parse(fs.readFileSync(${JSON.stringify(reply)},'utf8'));if(r.delay)await new Promise(resolve=>setTimeout(resolve,r.delay));process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');process.exitCode=r.code||0;\n`);
  await chmod(join(bin, "gh"), 0o755);
  vi.stubEnv("PATH", `${bin}${delimiter}${process.env.PATH}`);
  host = createFakePluginHost({ pluginId: "gh-skills", dataDir: join(directory, "server-data") });
  await plugin(host.bb);
});
afterEach(async () => {
  await host?.harness.lifecycle.dispose();
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});

test("lists only the BB server skills directory, without accepting a client destination", async () => {
  const result = await host.harness.behavior.callRpc("skills.list", null);
  expect(result).toEqual({ directory: join(directory, "server-data/skills"), skills: [] });
  const arguments_ = JSON.parse((await readFile(calls, "utf8")).trim());
  expect(arguments_.slice(0, 2)).toEqual(["skill", "list"]);
  expect(arguments_[arguments_.indexOf("--dir") + 1]).toBe(join(directory, "server-data/skills"));
  await expect(host.harness.behavior.callRpc("skills.list", { directory: "/other-host" })).rejects.toThrow();
});

test("installs with gh's explicit pin and force options, always into the server directory", async () => {
  await writeFile(reply, JSON.stringify({ stdout: "Installed models" }));
  expect(await host.harness.behavior.callRpc("skills.install", {
    repository: "example/skills", skill: "skills/models", pin: "reviewed-branch", force: true,
  })).toEqual({ output: "Installed models" });
  const args = JSON.parse((await readFile(calls, "utf8")).trim());
  expect(args).toContain("reviewed-branch");
  expect(args).toContain("--force");
  expect(args).toContain("skills/models");
  expect(args[args.indexOf("--dir") + 1]).toBe(join(directory, "server-data/skills"));
  await expect(host.harness.behavior.callRpc("skills.install", {
    repository: "example/skills", skill: "models", directory: "/elsewhere",
  })).rejects.toThrow();
});

test("checks and updates using gh semantics, with pin removal only when explicitly requested", async () => {
  await writeFile(reply, JSON.stringify({ stdout: "Pinned skill skipped" }));
  await host.harness.behavior.callRpc("skills.update", { all: true, dryRun: true });
  await host.harness.behavior.callRpc("skills.update", { all: true, unpin: true, force: true });
  const invocations: string[][] = (await readFile(calls, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
  expect(invocations[0]).toContain("--dry-run");
  expect(invocations[0]).not.toContain("--unpin");
  expect(invocations[1]).toEqual(expect.arrayContaining(["--all", "--force", "--unpin"]));
  for (const args of invocations) expect(args[args.indexOf("--dir") + 1]).toBe(join(directory, "server-data/skills"));
});

test("reads and removes an installed skill while refusing traversal and symlink escapes", async () => {
  const root = join(directory, "server-data/skills");
  const folder = join(root, "demo");
  await mkdir(folder, { recursive: true });
  await writeFile(join(folder, "SKILL.md"), "# Installed skill\n");
  await writeFile(reply, JSON.stringify({ stdout: JSON.stringify([
    { skillName: "demo", sourceURL: "", version: "", pinned: false, path: folder },
  ]) }));
  expect(await host.harness.behavior.callRpc("skills.read", { id: "demo" })).toEqual({ content: "# Installed skill\n" });
  await expect(host.harness.behavior.callRpc("skills.remove", { id: "../outside" })).rejects.toThrow();
  const outside = join(directory, "outside");
  await mkdir(outside); await writeFile(join(outside, "SKILL.md"), "private");
  await symlink(outside, join(root, "escape"));
  await writeFile(reply, JSON.stringify({ stdout: JSON.stringify([
    { skillName: "escape", sourceURL: "", version: "", pinned: false, path: join(root, "escape") },
  ]) }));
  await expect(host.harness.behavior.callRpc("skills.remove", { id: "escape" })).rejects.toThrow();
  await writeFile(reply, JSON.stringify({ stdout: JSON.stringify([
    { skillName: "demo", sourceURL: "", version: "", pinned: false, path: folder },
  ]) }));
  await host.harness.behavior.callRpc("skills.remove", { id: "demo" });
  await expect(readFile(join(folder, "SKILL.md"))).rejects.toThrow();
  expect(await readFile(join(outside, "SKILL.md"), "utf8")).toBe("private");
});

test("searches and previews through gh, and propagates its authentication errors", async () => {
  const found = [{ skillName: "models", namespace: "", repo: "example/skills", path: "skills/models/SKILL.md", description: "Query models", stars: 12 }];
  await writeFile(reply, JSON.stringify({ stdout: JSON.stringify(found), stderr: "A harmless warning" }));
  expect(await host.harness.behavior.callRpc("skills.search", { query: "models", page: 2 })).toEqual({ skills: found });
  await writeFile(reply, JSON.stringify({ stdout: "# Models\nDocumentation" }));
  expect(await host.harness.behavior.callRpc("skills.preview", { repository: "example/skills", skill: "models@v1" })).toEqual({ output: "# Models\nDocumentation" });
  await writeFile(reply, JSON.stringify({ code: 1, stderr: "Run gh auth login on this server" }));
  await expect(host.harness.behavior.callRpc("skills.preview", { repository: "example/skills", skill: "models" })).rejects.toThrow("Run gh auth login on this server");
});

test("accepts a GitHub repository URL and passes its canonical name to gh", async () => {
  await writeFile(reply, JSON.stringify({ stdout: "Installed models" }));
  await host.harness.behavior.callRpc("skills.install", { repository: "https://github.com/example/skills.git/", skill: "models" });
  const args = JSON.parse((await readFile(calls, "utf8")).trim());
  expect(args.slice(args.indexOf("--") + 1)).toEqual(["example/skills", "models"]);
});

test("reports running operations to other clients and retains the result after a plugin reload", async () => {
  expect(await host.harness.behavior.callRpc("skills.operation", null)).toBeNull();
  await writeFile(reply, JSON.stringify({ stdout: "Installed models", delay: 300 }));
  const installation = host.harness.behavior.callRpc("skills.install", { repository: "example/skills", skill: "models" });
  try {
    await vi.waitFor(async () => expect(await host.harness.behavior.callRpc("skills.operation", null)).toMatchObject({ kind: "install", target: "models", state: "running" }));
  } finally { await installation; }
  await host.harness.lifecycle.reload(plugin);
  expect(await host.harness.behavior.callRpc("skills.operation", null)).toMatchObject({ kind: "install", target: "models", state: "succeeded", output: "Installed models" });
});

test("retains command failures for a client that reopens the page", async () => {
  await writeFile(reply, JSON.stringify({ code: 1, stderr: "Run gh auth login on this server" }));
  await expect(host.harness.behavior.callRpc("skills.install", { repository: "example/private-skills", skill: "models" })).rejects.toThrow("Run gh auth login");
  await host.harness.lifecycle.reload(plugin);
  expect(await host.harness.behavior.callRpc("skills.operation", null)).toMatchObject({ state: "failed", error: "Run gh auth login on this server" });
});
