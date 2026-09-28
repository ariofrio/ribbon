import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
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
