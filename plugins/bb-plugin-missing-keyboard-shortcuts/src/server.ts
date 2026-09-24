import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { selectReusableTerminalId } from "./terminal-selection";

const DEFAULT_TERMINAL_COLS = 100;
const DEFAULT_TERMINAL_ROWS = 30;
const SHORTCUTS_PLUGIN_ID = "missing-keyboard-shortcuts";
const SIDE_CHAT_ACTION_ID = "side-chat";

function sideChatChildThreadId(
  tab: unknown,
  parentThreadId: string,
): string | null {
  if (tab === null || typeof tab !== "object" || Array.isArray(tab)) {
    return null;
  }
  const candidate = tab as Record<string, unknown>;
  if (
    candidate.kind !== "plugin-panel" ||
    candidate.actionId !== SIDE_CHAT_ACTION_ID ||
    (candidate.pluginId !== SIDE_CHAT_PLUGIN_ID &&
      candidate.pluginId !== SHORTCUTS_PLUGIN_ID) ||
    typeof candidate.paramsJson !== "string"
  ) {
    return null;
  }
  try {
    const params: unknown = JSON.parse(candidate.paramsJson);
    if (
      params === null ||
      typeof params !== "object" ||
      Array.isArray(params)
    ) {
      return null;
    }
    const values = params as Record<string, unknown>;
    return values.sourceThreadId === parentThreadId &&
      typeof values.threadId === "string" &&
      values.threadId.length > 0
      ? values.threadId
      : null;
  } catch {
    return null;
  }
}

function isReusableSideChat(
  child: {
    archivedAt: number | null;
    originKind: string | null;
    originPluginId: string | null;
    sourceThreadId: string | null;
    visibility: string;
  },
  parentThreadId: string,
): boolean {
  return (
    child.archivedAt === null &&
    child.originKind === "fork" &&
    child.originPluginId === SIDE_CHAT_PLUGIN_ID &&
    child.sourceThreadId === parentThreadId &&
    child.visibility === "hidden"
  );
}

async function findReusableSideChat(
  bb: BbPluginApi,
  parentThreadId: string,
): Promise<string | null> {
  const { tabs } = await bb.sdk.threads.tabs.get({ threadId: parentThreadId });
  for (const tab of [...tabs].reverse()) {
    const childThreadId = sideChatChildThreadId(tab, parentThreadId);
    if (childThreadId === null) continue;
    try {
      const child = await bb.sdk.threads.get({ threadId: childThreadId });
      if (isReusableSideChat(child, parentThreadId)) return childThreadId;
    } catch {
      // A stale durable tab is ignored; validateSideChat removes it when the
      // client selects it.
    }
  }
  return null;
}

async function removeThreadTab(
  bb: BbPluginApi,
  threadId: string,
  tabId: string,
): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const current = await bb.sdk.threads.tabs.get({ threadId });
    const tabs = current.tabs.filter(({ id }) => id !== tabId);
    if (tabs.length === current.tabs.length) return;
    try {
      await bb.sdk.threads.tabs.update({
        expectedRevision: current.revision,
        tabs,
        threadId,
      });
      return;
    } catch (error) {
      if (attempt === 1) throw error;
    }
  }
}

const SIDE_CHAT_PLUGIN_ID = "side-chat";
/** What the Side chat plugin answers `createSideChat` with. */
const sideChatThreadSchema = z.object({ threadId: z.string().min(1) });
const sideChatSendSchema = z.object({ ok: z.literal(true) });

export const rpcContract = defineRpcContract({
  openTerminal: {
    input: z
      .object({
        preferredTerminalId: z.string().min(1).nullable(),
        threadId: z.string().min(1),
      })
      .strict(),
    output: z
      .object({ terminalId: z.string().min(1), created: z.boolean() })
      .strict(),
  },
  validateSideChat: {
    input: z
      .object({
        childThreadId: z.string().min(1),
        parentThreadId: z.string().min(1),
        tabId: z.string().min(1),
      })
      .strict(),
    output: z.object({ reusable: z.boolean() }).strict(),
  },
  createSideChat: {
    input: z.object({ sourceThreadId: z.string().min(1) }).strict(),
    output: sideChatThreadSchema,
  },
  sendToMain: {
    input: z
      .object({
        senderThreadId: z.string().min(1),
        sourceThreadId: z.string().min(1),
        text: z.string().trim().min(1),
      })
      .strict(),
    output: sideChatSendSchema,
  },
});

export default function plugin(bb: BbPluginApi) {
  bb.rpc.register(rpcContract, {
    async openTerminal({ preferredTerminalId, threadId }) {
      const { sessions } = await bb.sdk.terminals.list({
        scope: { kind: "thread", threadId },
      });
      let terminalId = selectReusableTerminalId(
        sessions,
        preferredTerminalId,
      );
      let created = false;
      if (terminalId === null) {
        const session = await bb.sdk.terminals.create({
          cols: DEFAULT_TERMINAL_COLS,
          rows: DEFAULT_TERMINAL_ROWS,
          scope: { kind: "thread", threadId },
        });
        terminalId = session.id;
        created = true;
      }

      return { terminalId, created };
    },
    async validateSideChat({ childThreadId, parentThreadId, tabId }) {
      const child = await bb.sdk.threads.get({ threadId: childThreadId });
      const reusable = isReusableSideChat(child, parentThreadId);
      if (!reusable) await removeThreadTab(bb, parentThreadId, tabId);
      return { reusable };
    },
    async createSideChat({ sourceThreadId }) {
      const existingThreadId = await findReusableSideChat(bb, sourceThreadId);
      if (existingThreadId !== null) return { threadId: existingThreadId };
      const { threadId } = await bb.sdk.plugins.callRpc({
        pluginId: SIDE_CHAT_PLUGIN_ID,
        method: "createSideChat",
        input: { sourceThreadId, anchorText: "" },
        outputSchema: sideChatThreadSchema,
      });
      // A fork is returned while it is still starting. Mounting ThreadChat then
      // can leave BB's initial thread fetch stale across the ready-state event.
      await bb.sdk.threads.wait({ threadId, status: "idle", timeoutMs: 120_000 });
      return { threadId };
    },
    async sendToMain({ senderThreadId, sourceThreadId, text }) {
      return bb.sdk.plugins.callRpc({
        pluginId: SIDE_CHAT_PLUGIN_ID,
        method: "sendToMain",
        input: { senderThreadId, sourceThreadId, text },
        outputSchema: sideChatSendSchema,
      });
    },
  });

  bb.log.info("Missing native shortcuts loaded");
}
