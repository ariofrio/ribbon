import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fetchFromStack } from "../screenshots/fetch.mjs";

async function until(check, label) {
  const deadline = Date.now() + 120_000;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

export async function verifyThreadTitles({ stack, fixture }) {
  const { run, runJson } = fixture;
  const transcriptsPath = join(stack.dataDir, "transcripts.json");
  const selected = await fetchFromStack(
    new URL("/api/v1/plugins/thread-titles/rpc/selection.set", stack.serverUrl),
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        selection: { providerId: "acp-screenshots", model: "fixture", reasoningLevel: "low" },
      }),
    },
  );
  assert.ok(selected.ok, await selected.text());
  for (const [initialTitle, decision, expectedTitle] of [
    ["Calendar", { action: "rename", reason: "generic", title: "Build a shared calendar" }, "Build a shared calendar"],
    ["Build a shared calendar", { action: "keep" }, "Build a shared calendar"],
  ]) {
    const transcripts = JSON.parse(readFileSync(transcriptsPath, "utf8"));
    for (const [prompt, result] of [
      ["Generate a concise sentence-case title*", { title: initialTitle }],
      ["Assess whether the existing title needs correction*", decision],
    ]) {
      transcripts.unshift({
        prompt,
        updates: [{ sessionUpdate: "agent_message_chunk", content: { type: "text", text: JSON.stringify(result) } }],
      });
    }
    // The first turn stays open, so the first-message pass runs before it ends.
    transcripts.unshift({ prompt: "Calendar", hang: true, updates: [] });
    writeFileSync(transcriptsPath, JSON.stringify(transcripts));
    // A short prompt intentionally retains bb's prompt-derived title fallback.
    const source = runJson([
      "thread", "spawn", "--project", "proj_personal", "--provider", "acp-screenshots",
      "--model", "fixture", "--permission-mode", "accept-edits", "--prompt", "Calendar",
    ]);
    const workers = async () => {
      const response = await fetchFromStack(new URL(
        "/api/v1/threads?includeHidden=true&originPluginId=thread-titles&limit=100", stack.serverUrl,
      ));
      assert.ok(response.ok, await response.clone().text());
      const body = await response.json();
      return (Array.isArray(body) ? body : body.threads).filter(
        (thread) => thread.lifecycleOwnerThreadId === source.id,
      );
    };
    const settled = (count) => async () => {
      let all;
      try {
        all = await workers();
      } catch (error) {
        if (error instanceof TypeError && error.message === "fetch failed") return false;
        throw error;
      }
      return all.length === count && all.every((worker) => worker.archivedAt !== null);
    };
    await until(settled(1), "first-message pass and cleanup");
    await until(() => {
      const current = runJson(["thread", "show", source.id]).thread;
      return (current.title ?? current.titleFallback) === initialTitle;
    }, "first-message title");
    run(["thread", "stop", source.id]);
    run(["thread", "wait", source.id, "--status", "idle"]);
    await until(settled(2), "first-turn pass and cleanup");
    const first = await workers();
    assert.ok(first.every((worker) => worker.visibility === "hidden" && worker.parentThreadId === null));
    run(["plugin", "reload", "thread-titles"]);
    await stack.restartServer();
    run(["thread", "tell", source.id, "Add sharing"]);
    run(["thread", "wait", source.id, "--status", "idle"]);
    assert.equal((await workers()).length, 2);
    run(["thread", "tell", source.id, "Include team invitations"]);
    run(["thread", "wait", source.id, "--status", "idle"]);
    await until(settled(3), "third-message assessment and cleanup");
    assert.equal(runJson(["thread", "show", source.id]).thread.title, expectedTitle);
    run(["plugin", "reload", "thread-titles"]);
    run(["thread", "tell", source.id, "Also support reminders"]);
    run(["thread", "wait", source.id, "--status", "idle"]);
    assert.equal(runJson(["thread", "show", source.id]).thread.title, expectedTitle);
    assert.equal((await workers()).length, 3);
  }
}

export async function verifyDeletedThreadTitles({ stack, fixture }) {
  const { default: Database } = await import("better-sqlite3");
  const { run, runJson } = fixture;
  const transcriptsPath = join(stack.dataDir, "transcripts.json");
  const originalTranscripts = readFileSync(transcriptsPath, "utf8");
  const transcripts = JSON.parse(originalTranscripts);
  transcripts.unshift(
    { prompt: "Generate a concise sentence-case title*", hang: true, updates: [] },
    { prompt: "Calendar", hang: true, updates: [] },
  );
  writeFileSync(transcriptsPath, JSON.stringify(transcripts));
  run(["settings", "ai-services", "set", "thread-title", "off"]);
  const selected = await fetchFromStack(
    new URL("/api/v1/plugins/thread-titles/rpc/selection.set", stack.serverUrl),
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        selection: { providerId: "acp-screenshots", model: "fixture", reasoningLevel: "low" },
      }),
    },
  );
  assert.ok(selected.ok, await selected.text());
  const db = new Database(join(stack.dataDir, "plugins/thread-titles/data.db"), { readonly: true });
  const job = (id) => {
    const row = db.prepare("SELECT data FROM title_jobs WHERE thread_id = ?").get(id);
    return row ? JSON.parse(row.data) : null;
  };
  try {
    for (const missedEvent of [false, true]) {
      const source = runJson([
        "thread", "spawn", "--project", "proj_personal", "--provider", "acp-screenshots",
        "--model", "fixture", "--permission-mode", "accept-edits", "--prompt", "Calendar",
      ]);
      await until(() => job(source.id)?.state === "running", "title worker creation");
      const workerId = job(source.id).workerId;
      if (missedEvent) run(["plugin", "disable", "thread-titles"]);
      run(["thread", "delete", source.id, "--yes"]);
      if (missedEvent) {
        assert.equal(job(source.id).state, "running");
        run(["plugin", "enable", "thread-titles"]);
      }
      await until(() => {
        const current = job(source.id);
        return current.state === "skipped" && current.sourceDeleted && current.cleaned;
      }, "permanent cancellation and worker cleanup");
      for (const id of [source.id, workerId]) {
        const response = await fetchFromStack(new URL(`/api/v1/threads/${id}`, stack.serverUrl));
        assert.equal(response.status, 404);
      }
      run(["plugin", "reload", "thread-titles"]);
      await stack.restartServer();
      assert.equal(job(source.id).state, "skipped");
      assert.equal(job(source.id).sourceDeleted, true);
      assert.equal(job(source.id).cleaned, true);
      const logs = readFileSync(join(stack.dataDir, "plugins/thread-titles/logs/plugin.log"), "utf8");
      assert.ok(!logs.split("\n").some((line) => line.includes(source.id) && line.includes("could not refine title")));
    }
  } finally {
    db.close();
    writeFileSync(transcriptsPath, originalTranscripts);
    run(["settings", "ai-services", "set", "thread-title", "automatic"]);
  }
}

export async function verifyTitleRetries({ stack, fixture }) {
  const { default: Database } = await import("better-sqlite3");
  const { run, runJson } = fixture;
  const providerDir = join(stack.dataDir, "title-retry-provider");
  mkdirSync(providerDir, { recursive: true });
  writeFileSync(join(providerDir, "package.json"), JSON.stringify({
    name: "bb-plugin-title-retry-fixture",
    version: "0.0.0",
    type: "module",
    bb: {
      name: "Title retry fixture",
      description: "Fails catalog probes for isolated retry tests.",
      branding: { icon: "Toolbox" },
      server: "./server.ts",
      host: "./host.ts",
    },
  }));
  writeFileSync(join(providerDir, "server.ts"), `
export default function(bb) {
  bb.providers.register({
    id: "title-retry-fixture",
    displayName: "Title retry fixture",
    experimental_visibility: "always",
    models: { scope: "host" },
    capabilities: {
      supportsServiceTier: false,
      supportsNativeUserQuestion: false,
      supportsManualCompaction: false,
      supportsThreadArchive: false,
      supportsThreadRename: false,
      fork: "none",
      permissionModes: ["accept-edits"],
      reasoningLevels: ["low"],
    },
    composerActions: [],
  });
}
`);
  writeFileSync(join(providerDir, "host.ts"), `
import { experimental_defineProviderBridge } from "@get-bb/plugin-sdk/provider-bridge";
export const experimental_providerBridge = experimental_defineProviderBridge({
  handleLine(line) {
    const request = JSON.parse(line);
    if (request.id !== undefined) process.stdout.write(JSON.stringify({
      jsonrpc: "2.0", id: request.id,
      error: { code: -32603, message: "Title retry fixture catalog offline" },
    }) + "\\n");
  },
});
`);
  run(["plugin", "install", providerDir, "--yes"]);
  run(["settings", "ai-services", "set", "thread-title", "off"]);
  const select = (selection) => fetchFromStack(
    new URL("/api/v1/plugins/thread-titles/rpc/selection.set", stack.serverUrl),
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ selection }),
    },
  );
  const selected = await select({ providerId: "title-retry-fixture", model: "unavailable", reasoningLevel: "low" });
  assert.ok(selected.ok, await selected.text());
  const db = new Database(join(stack.dataDir, "plugins/thread-titles/data.db"));
  const job = (id) => {
    const row = db.prepare("SELECT data FROM title_jobs WHERE thread_id = ?").get(id);
    return row ? JSON.parse(row.data) : null;
  };
  const save = (current) => db.prepare("UPDATE title_jobs SET state = ?, data = ? WHERE thread_id = ?")
    .run(current.state, JSON.stringify(current), current.threadId);
  try {
    run(["plugin", "config", "thread-titles", "set", "retryWindowHours", "48"]);
    const source = runJson([
      "thread", "spawn", "--project", "proj_personal", "--provider", "acp-screenshots",
      "--model", "fixture", "--permission-mode", "accept-edits", "--prompt", "Calendar",
    ]);
    await until(() => job(source.id)?.retry?.failures === 1, "first failed catalog lookup");
    assert.ok(job(source.id).retry.retryAt > Date.now());
    // Keep this condition independent of the machine's speed during reload.
    const paused = job(source.id);
    paused.retry.retryAt = Date.now() + 86_400_000;
    save(paused);
    run(["plugin", "reload", "thread-titles"]);
    await stack.restartServer();
    assert.deepEqual(job(source.id).retry, paused.retry);
    assert.equal(job(source.id).attemptedAt, paused.attemptedAt);
    // Seed elapsed time instead of waiting two days. A pending backoff must
    // not delay expiry, and the custom setting must survive restart.
    const finalAttempt = job(source.id);
    finalAttempt.attemptedAt = Date.now() - 48 * 3_600_000;
    save(finalAttempt);
    await until(() => job(source.id)?.state === "skipped", "retry budget exhaustion");
    assert.equal(job(source.id).retry.failures, 1);
    assert.equal(job(source.id).retryExpired, true);
    assert.match(job(source.id).reason, /Retry window expired \(48 hours.*1 failed attempt.*catalog unavailable/u);
    run(["plugin", "reload", "thread-titles"]);
    await stack.restartServer();
    assert.equal(job(source.id).state, "skipped");
    const terminal = run(["plugin", "logs", "thread-titles", "-n", "1000"]).split("\n")
      .filter((line) => line.includes(source.id) && line.includes("Retry window expired"));
    assert.equal(terminal.length, 1);
    run(["thread", "delete", source.id, "--yes"]);
  } finally {
    db.close();
    run(["plugin", "config", "thread-titles", "set", "retryWindowHours", "24"]);
    const restored = await select({ providerId: "acp-screenshots", model: "fixture", reasoningLevel: "low" });
    assert.ok(restored.ok, await restored.text());
    run(["settings", "ai-services", "set", "thread-title", "automatic"]);
    run(["plugin", "remove", "title-retry-fixture"]);
  }
}
