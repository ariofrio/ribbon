// Record the actual ACP prompt sent by bb, then use the shared scripted agent.
import { appendFileSync } from "node:fs";
import { createInterface } from "node:readline";

createInterface({ input: process.stdin, terminal: false }).on("line", (line) => {
  const message = JSON.parse(line);
  if (message.method === "session/prompt") {
    appendFileSync(process.env.BB_INSTRUCTIONS_PROMPTS, JSON.stringify({
      threadId: process.env.BB_THREAD_ID,
      prompt: message.params.prompt,
    }) + "\n");
  }
});
await import("../screenshots/agent.mjs");
