import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { THREAD_STAGES_GROUPING_KEY } from "./catalog";
import {
  enabledWorkflowStages,
  parseWorkflowStage,
  type WorkflowStage,
  type WorkflowStageVisibilitySettings,
} from "./workflow-stage";

export const STAGE_MENTION_PROVIDER_ID = "stage";

type StageChangeOrigin = "ui" | "cli";

type PromptInput = Parameters<
  BbPluginApi["sdk"]["threads"]["send"]
>[0]["input"][number];
type PromptMention = Extract<PromptInput, { type: "text" }>["mentions"][number];

const STAGE_MEANINGS: Record<WorkflowStage, string> = {
  Deferred: "intentionally set aside for later",
  Idle: "available or waiting without a blocker",
  Blocked: "cannot progress until something external changes",
  Completed: "finished, and treated like archived work",
};

const ORIGIN_DESCRIPTIONS: Record<StageChangeOrigin, string> = {
  ui: "the user, in the Ribbon sidebar",
  cli: "someone using the bb CLI",
};

/** The mention's title, which bb also uses as its label and, after `@`, its text. */
function stageTitle(stage: WorkflowStage): string {
  return `stage:${stage.toLowerCase()}`;
}

function stageMention(
  pluginId: string,
  stage: WorkflowStage,
  start: number,
): PromptMention {
  const title = stageTitle(stage);
  return {
    start,
    end: start + 1 + title.length,
    resource: {
      kind: "plugin",
      pluginId,
      itemId: `${STAGE_MENTION_PROVIDER_ID}:${stage.toLowerCase()}`,
      label: title,
    },
  };
}

export function stageContext(stage: WorkflowStage): string {
  return [
    `@${stageTitle(stage)} is Ribbon's ${stage} workflow stage for root bb threads: ${STAGE_MEANINGS[stage]}.`,
    `When a message asks for a thread to be put in this stage, whether in a sentence such as "do this, then @${stageTitle(stage)}" or with the mention alone, finish any work it asks for first, then run \`bb sidebar place <thread> --to ${THREAD_STAGES_GROUPING_KEY}/${stage}\`, with \`--self\` in place of <thread> for the current thread. A child thread has no stage of its own; place its root instead.`,
  ].join(" ");
}

/**
 * "Thread stage updated: @stage:idle → @stage:blocked", with each stage a
 * mention exactly as the composer would insert it, plus an agent-only note
 * that the move has already happened.
 */
export function stageChangeInput(
  pluginId: string,
  change: { origin: StageChangeOrigin; from: WorkflowStage; to: WorkflowStage },
): PromptInput[] {
  const prefix = "Thread stage updated: ";
  const separator = " → ";
  const from = `@${stageTitle(change.from)}`;
  const toStart = prefix.length + from.length + separator.length;
  return [
    {
      type: "text",
      text: `${prefix}${from}${separator}@${stageTitle(change.to)}`,
      mentions: [
        stageMention(pluginId, change.from, prefix.length),
        stageMention(pluginId, change.to, toStart),
      ],
    },
    {
      type: "text",
      text: `Ribbon sent this notice because this thread's stage changed from ${change.from} to ${change.to}, made by ${ORIGIN_DESCRIPTIONS[change.origin]}. The move is already done, so do not place the thread again. No reply is needed unless the new stage changes what you should do.`,
      mentions: [],
      visibility: "agent-only",
    },
  ];
}

function matchingStages(
  stages: readonly WorkflowStage[],
  query: string,
): WorkflowStage[] {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return [];
  return stages.filter((stage) => {
    const name = stage.toLowerCase();
    return stageTitle(stage).startsWith(needle) || name.startsWith(needle);
  });
}

export function createStageMentions(
  bb: BbPluginApi,
  getSettings: () => Promise<
    WorkflowStageVisibilitySettings & { messageOnStageChange?: unknown }
  >,
) {
  bb.ui.registerMentionProvider({
    id: STAGE_MENTION_PROVIDER_ID,
    label: "Ribbon stages",
    async search({ query }) {
      const stages = enabledWorkflowStages(await getSettings());
      return matchingStages(stages, query).map((stage) => ({
        id: stage.toLowerCase(),
        title: stageTitle(stage),
        subtitle: `${stage}: ${STAGE_MEANINGS[stage]}`,
      }));
    },
    resolve(id) {
      const stage = parseWorkflowStage(id);
      if (stage === null) throw new Error(`Unknown stage: ${id}`);
      return { context: stageContext(stage) };
    },
  });

  async function send(
    threadId: string,
    change: { origin: StageChangeOrigin; from: WorkflowStage; to: WorkflowStage },
  ) {
    try {
      if ((await getSettings()).messageOnStageChange === false) return;
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
