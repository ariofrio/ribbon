import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

async function until(check, label) {
  const deadline = Date.now() + 120_000;
  while (!(await check())) {
    if (Date.now() > deadline)
      throw new Error(`Timed out waiting for ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

export async function verifyThreadTitles({ stack, fixture }) {
  const { run, runJson } = fixture;
  const transcriptsPath = join(stack.dataDir, "transcripts.json");
  const transcripts = JSON.parse(readFileSync(transcriptsPath, "utf8"));
  transcripts.unshift({
    prompt: "Include team invitations",
    hang: true,
    updates: [],
  });
  transcripts.unshift({
    prompt: "Generate a concise sentence-case title*",
    updates: [
      {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: '{"title":"Build a shared calendar"}' },
      },
    ],
  });
  writeFileSync(transcriptsPath, JSON.stringify(transcripts));
  run(["plugin", "config", "thread-titles", "set", "model", "fixture"]);
  // A short prompt intentionally retains bb's prompt-derived title fallback.
  const source = runJson([
    "thread",
    "spawn",
    "--project",
    "proj_personal",
    "--provider",
    "acp-screenshots",
    "--model",
    "fixture",
    "--permission-mode",
    "accept-edits",
    "--prompt",
    "Calendar",
  ]);
  run(["thread", "wait", source.id, "--status", "idle"]);
  assert.equal(runJson(["thread", "show", source.id]).thread.title, null);
  run(["thread", "tell", source.id, "Add sharing"]);
  run(["thread", "wait", source.id, "--status", "idle"]);
  run(["thread", "tell", source.id, "Include team invitations"]);
  await until(
    () =>
      runJson(["thread", "show", source.id]).thread.title ===
      "Build a shared calendar",
    "the one-time title update",
  );
  const workers = async () => {
    const response = await fetch(
      new URL(
        "/api/v1/threads?includeHidden=true&originPluginId=thread-titles&limit=100",
        stack.serverUrl,
      ),
    );
    assert.ok(response.ok, await response.clone().text());
    const body = await response.json();
    return (Array.isArray(body) ? body : body.threads).filter(
      (thread) => thread.lifecycleOwnerThreadId === source.id,
    );
  };
  await until(
    async () => (await workers()).some((worker) => worker.archivedAt !== null),
    "worker cleanup",
  );
  const before = await workers();
  assert.equal(before.length, 1);
  assert.equal(before[0].visibility, "hidden");
  assert.equal(before[0].parentThreadId, null);
  assert.equal(runJson(["thread", "show", source.id]).thread.status, "active");
  run(["thread", "stop", source.id]);
  run(["plugin", "reload", "thread-titles"]);
  await stack.restartServer();
  run(["thread", "wait", source.id, "--status", "idle"]);
  run(["thread", "tell", source.id, "Also support reminders"]);
  run(["thread", "wait", source.id, "--status", "idle"]);
  assert.equal(
    runJson(["thread", "show", source.id]).thread.title,
    "Build a shared calendar",
  );
  assert.equal((await workers()).length, 1);
}
