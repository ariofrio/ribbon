import { PluginCliError, cliCommand } from "@get-bb/plugin-sdk";
import { resolveThreadId } from "./cli";
import { threadActionsSchema } from "./contracts";
import type { ThreadActionsRecord } from "./thread-actions-store";

interface ThreadActionsCliContext {
  list(threadId: string): Promise<ThreadActionsRecord>;
  save(record: ThreadActionsRecord): Promise<{ ok: true }>;
  run(input: { threadId: string; actionId: string }): Promise<{ ok: true }>;
}

const THREAD_OPTIONS = {
  self: { type: "boolean", description: "Target the current thread" },
  json: { type: "boolean", description: "Print machine-readable JSON output" },
} as const;
const THREAD_POSITIONAL = { name: "thread", description: "Thread ID" };

function humanActions(record: ThreadActionsRecord) {
  const actions = record.actions.map(
    ({ id, label, prompt }) => `  ${id} (${label}): ${prompt}`,
  );
  return `Thread: ${record.threadId}\nHide thread title: ${record.hideTitle}\n${
    actions.length > 0 ? actions.join("\n") : "No actions"
  }\n`;
}

export function threadActionCliCommands(context: ThreadActionsCliContext) {
  return {
    "actions list": cliCommand({
      summary: "List a thread's saved prompt actions",
      positionals: [THREAD_POSITIONAL],
      options: THREAD_OPTIONS,
      async run({ positionals, options }, invocation) {
        const threadId = resolveThreadId(positionals.thread, options.self, invocation);
        const record = await context.list(threadId);
        return {
          exitCode: 0,
          stdout: options.json ? `${JSON.stringify(record, null, 2)}\n` : humanActions(record),
        };
      },
    }),
    "actions set": cliCommand({
      summary: "Replace a thread's saved prompt actions",
      positionals: [THREAD_POSITIONAL],
      options: {
        ...THREAD_OPTIONS,
        actions: {
          type: "string",
          required: true,
          stdin: true,
          placeholder: "json-array",
          description: "JSON array of {id, label, prompt}; unique IDs up to 64 characters, labels 1–24, prompts 1–10000",
        },
        "hide-title": {
          type: "boolean",
          description: "Give the actions the whole row; omitted shows the title",
        },
      },
      async run({ positionals, options }, invocation) {
        const threadId = resolveThreadId(positionals.thread, options.self, invocation);
        let input: unknown;
        try {
          input = JSON.parse(options.actions);
        } catch {
          throw new PluginCliError("Actions must be a JSON array.", {
            code: "invalid_thread_actions",
          });
        }
        const parsed = threadActionsSchema.safeParse(input);
        if (!parsed.success) {
          throw new PluginCliError(parsed.error.message, { code: "invalid_thread_actions" });
        }
        const result = await context.save({
          threadId, actions: parsed.data, hideTitle: options["hide-title"],
        });
        return {
          exitCode: 0,
          stdout: options.json ? `${JSON.stringify(result)}\n` : `Saved actions for ${threadId}.\n`,
        };
      },
    }),
    "actions run": cliCommand({
      summary: "Send a saved action's prompt to its thread",
      positionals: [
        { name: "action", description: "Saved action ID", required: true },
        THREAD_POSITIONAL,
      ],
      options: THREAD_OPTIONS,
      async run({ positionals, options }, invocation) {
        const threadId = resolveThreadId(positionals.thread, options.self, invocation);
        const result = await context.run({ threadId, actionId: positionals.action });
        return {
          exitCode: 0,
          stdout: options.json ? `${JSON.stringify(result)}\n` : `Sent action ${positionals.action} to ${threadId}.\n`,
        };
      },
    }),
  };
}
