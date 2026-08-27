import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scratchRoot = join(process.cwd(), ".scratch");

test("namespaces every ACP session by its bb thread", async () => {
  await mkdir(scratchRoot, { recursive: true });
  const directory = await mkdtemp(join(scratchRoot, "screenshot-agent-test-"));
  const transcriptsPath = join(directory, "transcripts.json");
  await writeFile(transcriptsPath, "[]");

  const child = spawn(
    process.execPath,
    [fileURLToPath(new URL("./agent.mjs", import.meta.url))],
    {
      env: {
        ...process.env,
        BB_SCREENSHOT_TRANSCRIPTS: transcriptsPath,
        BB_THREAD_ID: "thr_capture",
      },
      stdio: ["pipe", "pipe", "inherit"],
    },
  );

  try {
    for (const [id, method] of [
      [1, "initialize"],
      [2, "session/new"],
      [3, "session/fork"],
    ]) {
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method })}\n`);
    }
    child.stdin.end();

    const responses = [];
    for await (const line of createInterface({ input: child.stdout })) {
      responses.push(JSON.parse(line));
    }

    const newSession = responses.find(({ id }) => id === 2)?.result.sessionId;
    const forkedSession = responses.find(({ id }) => id === 3)?.result.sessionId;
    assert.equal(newSession, "screenshot-session-thr_capture-1");
    assert.equal(forkedSession, "screenshot-session-thr_capture-2");
    assert.notEqual(newSession, forkedSession);
  } finally {
    child.kill();
    await rm(directory, { recursive: true, force: true });
  }
});
