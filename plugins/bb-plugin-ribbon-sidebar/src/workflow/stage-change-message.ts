import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { parseWorkflowStage, type WorkflowStage } from "./workflow-stage";

export const STAGE_CHANGE_MENTION_PROVIDER_ID = "stage-change";

type StageChangeOrigin = "ui" | "cli";

interface StageChange {
  origin: StageChangeOrigin;
  from: WorkflowStage;
  to: WorkflowStage;
}

type PromptInput = Parameters<
  BbPluginApi["sdk"]["threads"]["send"]
>[0]["input"][number];

const ORIGIN_DESCRIPTIONS: Record<StageChangeOrigin, string> = {
  ui: "the user, in the Ribbon sidebar",
  cli: "someone using the bb CLI",
};

function itemId({ origin, from, to }: StageChange): string {
  return `${origin}.${from}.${to}`;
}

function parseItemId(id: string): StageChange | null {
  const [origin, from, to, ...rest] = id.split(".");
  const fromStage = parseWorkflowStage(from ?? "");
  const toStage = parseWorkflowStage(to ?? "");
  if (
    rest.length > 0 ||
    (origin !== "ui" && origin !== "cli") ||
    fromStage === null ||
    toStage === null
  ) {
    return null;
  }
  return { origin, from: fromStage, to: toStage };
}

/**
 * The visible message is a single Ribbon mention pill rather than prose, so
 * the timeline shows it as structured content; what the change means reaches
 * the agent through the pill's resolved, agent-only context.
 */
export function stageChangeInput(
  pluginId: string,
  change: StageChange,
): PromptInput[] {
  const label = `Stage: ${change.from} → ${change.to}`;
  return [
    {
      type: "text",
      text: label,
      mentions: [
        {
          start: 0,
          end: label.length,
          resource: {
            kind: "plugin",
            pluginId,
            itemId: `${STAGE_CHANGE_MENTION_PROVIDER_ID}:${itemId(change)}`,
            label,
          },
        },
      ],
    },
  ];
}

export function stageChangeContext({ origin, from, to }: StageChange): string {
  return [
    `This thread's workflow stage changed from ${from} to ${to}. The change was made by ${ORIGIN_DESCRIPTIONS[origin]}.`,
    "No reply is needed unless the new stage changes what you should do.",
  ].join(" ");
}

export function createStageChangeMessages(
  bb: BbPluginApi,
  enabled: () => Promise<boolean>,
) {
  bb.ui.registerMentionProvider({
    id: STAGE_CHANGE_MENTION_PROVIDER_ID,
    label: "Ribbon stage changes",
    search: () => [],
    resolve(id) {
      const change = parseItemId(id);
      if (change === null) throw new Error(`Unknown stage change: ${id}`);
      return { context: stageChangeContext(change) };
    },
  });

  async function send(threadId: string, change: StageChange) {
    try {
      if (!(await enabled())) return;
      await bb.sdk.threads.send({
        threadId,
        mode: "steer-if-active",
        input: stageChangeInput(bb.pluginId, change),
      });
    } catch (error) {
      bb.log.warn(
        `Could not message ${threadId} about its stage change: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return {
    /**
     * Message a root whose stage a person or agent changed. Automatic
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
