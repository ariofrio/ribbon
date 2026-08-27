#!/usr/bin/env node
// A scripted stand-in for a coding agent, spawned by bb as a custom ACP agent.
// It replays a canned transcript for each prompt instead of calling a model, so
// seeded threads cost nothing, run offline, and read the same in every capture.
//
// bb speaks the subset of the Agent Client Protocol documented at
// https://agentclientprotocol.com: newline-delimited JSON-RPC 2.0 over stdio.
import { createInterface } from "node:readline";
import { readFileSync } from "node:fs";

const ACP_PROTOCOL_VERSION = 1;

const transcripts = JSON.parse(
  readFileSync(process.env.BB_SCREENSHOT_TRANSCRIPTS, "utf8"),
);

let nextSessionId = 1;
const sessionIdPrefix = process.env.BB_THREAD_ID ?? `process-${process.pid}`;

function allocateSessionId() {
  return `screenshot-session-${sessionIdPrefix}-${nextSessionId++}`;
}

function send(message) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", ...message })}\n`);
}

/**
 * bb sends its system instructions as a leading text block, so the user's own
 * message is the last one.
 */
function promptText(prompt) {
  const blocks = (prompt ?? []).filter((block) => block?.type === "text");
  return (blocks.at(-1)?.text ?? "").trim();
}

/** A transcript matches a prompt exactly, by prefix with a trailing *, or as
 * the lone "*" fallback. */
function transcriptFor(prompt) {
  const text = promptText(prompt);
  const prefixed = (transcript) =>
    transcript.prompt.endsWith("*") &&
    transcript.prompt !== "*" &&
    text.startsWith(transcript.prompt.slice(0, -1));
  return (
    transcripts.find((transcript) => transcript.prompt.trim() === text) ??
    transcripts.find(prefixed) ??
    transcripts.find((transcript) => transcript.prompt === "*")
  );
}

async function handlePrompt(id, params) {
  const transcript = transcriptFor(params.prompt);
  for (const update of transcript?.updates ?? []) {
    send({
      method: "session/update",
      params: { sessionId: params.sessionId, update },
    });
  }
  // A thread that never finishes its turn is how the fixture holds a thread in
  // a running state for the capture that needs one.
  if (transcript?.hang) return;
  send({ id, result: { stopReason: "end_turn" } });
}

const handlers = {
  initialize: () => ({
    protocolVersion: ACP_PROTOCOL_VERSION,
    agentCapabilities: {
      // Without this bb warns, in the thread itself, that the previous session
      // could not be restored; the transcript is scripted, so nothing is lost
      // by claiming a session can be resumed.
      loadSession: true,
      // A side chat forks the thread's session, and bb refuses to open one
      // against an agent that does not advertise it.
      sessionCapabilities: { fork: {} },
      promptCapabilities: { image: false, audio: false, embeddedContext: true },
    },
  }),
  "session/new": () => ({
    sessionId: allocateSessionId(),
    models: {
      currentModelId: process.env.BB_SCREENSHOT_MODEL_ID,
      availableModels: [
        {
          modelId: process.env.BB_SCREENSHOT_MODEL_ID,
          name: process.env.BB_SCREENSHOT_MODEL_NAME,
        },
      ],
    },
  }),
  // Nothing to restore or carry over: the reply for each prompt comes from the
  // transcript, not from the agent's own history.
  "session/load": () => null,
  "session/fork": () => ({ sessionId: allocateSessionId() }),
  "session/cancel": () => null,
};

createInterface({ input: process.stdin, terminal: false }).on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let message;
  try {
    message = JSON.parse(trimmed);
  } catch {
    return;
  }
  if (typeof message.method !== "string") return;

  if (message.method === "session/prompt") {
    void handlePrompt(message.id, message.params);
    return;
  }

  const handler = handlers[message.method];
  if (message.id === undefined) return;
  send(
    handler === undefined
      ? { id: message.id, error: { code: -32601, message: "Method not found" } }
      : { id: message.id, result: handler(message.params) ?? null },
  );
});
