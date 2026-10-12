import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createFakePluginHost, experimental_scanPublicSdkOnly, makePluginAgentConfigurationContext } from "@get-bb/plugin-sdk/testing";
import plugin from "./server";

describe("server AGENTS.md", () => {
  let dataDir: string;
  let host: ReturnType<typeof createFakePluginHost>;
  beforeEach(async () => {
    const scratch = resolve("../../.scratch/work/global-instructions");
    await mkdir(scratch, { recursive: true });
    dataDir = await mkdtemp(join(scratch, "server-"));
    host = createFakePluginHost({ pluginId: "global-instructions", dataDir });
    await plugin(host.bb);
  });
  afterEach(async () => {
    await host.harness.lifecycle.dispose();
    await rm(dataDir, { recursive: true, force: true });
  });
  const read = async (host: ReturnType<typeof createFakePluginHost>) =>
    await host.harness.behavior.callRpc("instructions.read", null) as {
      instructions: string; revision: string; path: string;
    };

  it("reads a missing file without creating it and contributes no duplicate instructions", async () => {
    const snapshot = await read(host);
    expect(snapshot.instructions).toBe("");
    expect(snapshot.path).toBe(join(dataDir, "AGENTS.md"));
    await expect(stat(snapshot.path)).rejects.toMatchObject({ code: "ENOENT" });
    const config = await host.harness.behavior.resolveAgentConfiguration(makePluginAgentConfigurationContext());
    expect(config.instructions).toBeNull();
  });

  it("round-trips large Unicode source exactly and preserves permissions", async () => {
    const path = join(dataDir, "AGENTS.md");
    const initial = "\uFEFF# Rules\r\n\r\nKeep whitespace.  \r\n";
    await writeFile(path, initial, { mode: 0o640 });
    const snapshot = await read(host);
    expect(snapshot.instructions).toBe(initial);
    const instructions = "# Global rules\n\n" + "日本語 🎉 **Keep this.**\n".repeat(30_000);
    expect(instructions.length).toBeGreaterThan(256 * 1024);
    const result = await host.harness.behavior.callRpc("instructions.save", {
      instructions, revision: snapshot.revision,
    });
    expect(result).toMatchObject({ status: "saved", snapshot: { instructions } });
    expect(await readFile(path, "utf8")).toBe(instructions);
    expect((await stat(path)).mode & 0o777).toBe(0o640);
  });

  it("rejects a stale draft without overwriting external edits", async () => {
    const snapshot = await read(host);
    const path = join(dataDir, "AGENTS.md");
    await writeFile(path, "External rules");
    const result = await host.harness.behavior.callRpc("instructions.save", {
      instructions: "My draft", revision: snapshot.revision,
    });
    expect(result).toMatchObject({ status: "conflict", snapshot: { instructions: "External rules" } });
    expect(await readFile(path, "utf8")).toBe("External rules");
  });

  it("serializes simultaneous saves and detects creation of an empty file", async () => {
    const snapshot = await read(host);
    const save = (instructions: string) => host.harness.behavior.callRpc("instructions.save", {
      instructions, revision: snapshot.revision,
    });
    const results = await Promise.all([save("First"), save("Second")]);
    expect(results).toMatchObject([{ status: "saved" }, { status: "conflict" }]);
    expect(await readFile(snapshot.path, "utf8")).toBe("First");
    await rm(snapshot.path);
    const missing = await read(host);
    await writeFile(snapshot.path, "");
    expect(await host.harness.behavior.callRpc("instructions.save", {
      instructions: "Changed", revision: missing.revision,
    })).toMatchObject({ status: "conflict" });
  });

  it("edits through a symlink and saves an empty file to clear global instructions", async () => {
    const target = join(dataDir, "personal.md");
    await writeFile(target, "Rules");
    await symlink(target, join(dataDir, "AGENTS.md"));
    const snapshot = await read(host);
    expect(await host.harness.behavior.callRpc("instructions.save", {
      instructions: "", revision: snapshot.revision,
    })).toMatchObject({ status: "saved" });
    expect(await readFile(target, "utf8")).toBe("");
    await expect((await import("node:fs/promises")).lstat(snapshot.path).then(s => s.isSymbolicLink())).resolves.toBe(true);
  });

  it("uses only public SDK imports", async () => {
    const result = await experimental_scanPublicSdkOnly(resolve("."), {
      allow: [/^vitest\/config$/, /^@tiptap\//, /^tiptap-markdown$/, /^react$/, /^@\//,
        /^@testing-library\/react$/, /^@radix-ui\//, /^class-variance-authority$/, /^clsx$/, /^tailwind-merge$/, /^fake-indexeddb(?:\/auto)?$/],
    });
    expect(result.violations).toEqual([]);
    expect(result.privateDependencies).toEqual([]);
  });
});
