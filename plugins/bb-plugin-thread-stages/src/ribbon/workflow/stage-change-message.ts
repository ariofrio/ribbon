import type { BbPluginApi } from "@get-bb/plugin-sdk";
import {
  WORKFLOW_STAGE_LABELS,
  parseWorkflowStage,
  type WorkflowStage,
} from "./workflow-stage";

type StageChangeOrigin = "ui" | "cli";

interface StageChange {
  origin: StageChangeOrigin;
  from: WorkflowStage;
  to: WorkflowStage;
}

type PromptInput = Parameters<
  BbPluginApi["sdk"]["threads"]["send"]
>[0]["input"][number];
type PromptMention = Extract<PromptInput, { type: "text" }>["mentions"][number];

const ORIGIN_DESCRIPTIONS: Record<StageChangeOrigin, string> = {
  ui: "the user, in the Ribbon sidebar",
  cli: "someone using the bb CLI",
};

/**
 * Thread stages owns stage mentions, so they draw with its icon; it resolves
 * `stage:<stage in lowercase>` from its `stage` mention provider.
 */
function stageMention(stage: WorkflowStage, start: number): PromptMention {
  const label = WORKFLOW_STAGE_LABELS[stage];
  return {
    start,
    end: start + 1 + label.length,
    resource: {
      kind: "plugin",
      pluginId: "thread-stages",
      itemId: `stage:${stage.toLowerCase()}`,
      label,
    },
  };
}

/**
 * "Thread stage updated: @Active → @Blocked on third party", with each stage a Thread stages
 * mention exactly as its composer menu would insert it, plus an agent-only note
 * that the move has already happened. Without Thread stages running, nothing
 * could resolve the mentions, so the stages are named in plain text.
 */
function stageChangeInput(
  change: StageChange,
  withMentions: boolean,
): PromptInput[] {
  const prefix = "Thread stage updated: ";
  const separator = " → ";
  const at = withMentions ? "@" : "";
  const fromLabel = WORKFLOW_STAGE_LABELS[change.from];
  const toLabel = WORKFLOW_STAGE_LABELS[change.to];
  const from = `${at}${fromLabel}`;
  const text = `${prefix}${from}${separator}${at}${toLabel}`;
  return [
    {
      type: "text",
      text,
      mentions: withMentions
        ? [
            stageMention(change.from, prefix.length),
            stageMention(
              change.to,
              prefix.length + from.length + separator.length,
            ),
          ]
        : [],
    },
    {
      type: "text",
      text: `Ribbon sent this notice because this thread's stage changed from ${fromLabel} to ${toLabel}, made by ${ORIGIN_DESCRIPTIONS[change.origin]}. The move is already done, so do not place the thread again. No reply is needed unless the new stage changes what you should do.`,
      mentions: [],
      visibility: "agent-only",
    },
  ];
}

export function createStageChangeMessages(
  bb: BbPluginApi,
  options: {
    enabled: () => Promise<boolean>;
    threadStagesRunning: () => boolean;
  },
) {
  async function send(threadId: string, change: StageChange) {
    try {
      if (!(await options.enabled())) return;
      await bb.sdk.threads.send({
        threadId,
        mode: "queue-if-active",
        input: stageChangeInput(change, options.threadStagesRunning()),
      });
    } catch (error) {
      bb.log.warn(
        `Could not message ${threadId} about its stage change: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return {
    /**
     * Message a thread whose stage a person or agent changed. Automatic
     * placement is not announced. Sends in the background so a stage move
     * never waits on delivery.
     */
    announce(
      threadId: string,
      change: { origin: "ui" | "cli" | "auto"; from: string; to: string },
    ): void {
      if (change.origin === "auto") return;
      const from = parseWorkflowStage(change.from);
      const to = parseWorkflowStage(change.to);
      if (from === null || to === null || from === to) return;
      void send(threadId, { origin: change.origin, from, to });
    },
  };
}
