import type { BbPluginApi } from "@get-bb/plugin-sdk";
import {
  WORKFLOW_STAGES,
  enabledWorkflowStages,
  type WorkflowStage,
  type WorkflowStageVisibilitySettings,
} from "./workflow-stage";

/**
 * Ribbon sidebar builds stage mentions into its stage-change messages as
 * `stage:<stage in lowercase>` under this plugin's id, so this provider owns
 * their resolution and draws them with this plugin's icon.
 */
export const STAGE_MENTION_PROVIDER_ID = "stage";

const STAGE_MEANINGS: Record<WorkflowStage, string> = {
  Deferred: "intentionally set aside for later",
  Idle: "available or waiting without a blocker",
  Blocked: "cannot progress until something external changes",
  Completed: "finished, and treated like archived work",
};

function parseStage(id: string): WorkflowStage | null {
  return WORKFLOW_STAGES.find((stage) => stage.toLowerCase() === id) ?? null;
}

export function stageContext(stage: WorkflowStage): string {
  return [
    `@${stage} is the ${stage} workflow stage that Ribbon sidebar gives root bb threads: ${STAGE_MEANINGS[stage]}.`,
    `When a message asks for a thread to be put in this stage, whether in a sentence such as "do this, then @${stage}" or with the mention alone, finish any work it asks for first, then run \`bb sidebar place <thread> --to plugin:thread-stages:stages/${stage}\`, with \`--self\` in place of <thread> for the current thread. A child thread has no stage of its own; place its root instead.`,
  ].join(" ");
}

function matchingStages(
  stages: readonly WorkflowStage[],
  query: string,
): WorkflowStage[] {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return [];
  if ("stage".startsWith(needle) || needle.startsWith("stage")) {
    const rest = needle.slice("stage".length).trim();
    return stages.filter((stage) => stage.toLowerCase().startsWith(rest));
  }
  return stages.filter((stage) => stage.toLowerCase().startsWith(needle));
}

export function registerStageMentions(bb: BbPluginApi): void {
  async function enabledStages(): Promise<readonly WorkflowStage[]> {
    try {
      const { values } = await bb.sdk.plugins.getSettings({
        pluginId: "ribbon-sidebar",
      });
      return enabledWorkflowStages(values as WorkflowStageVisibilitySettings);
    } catch {
      return WORKFLOW_STAGES;
    }
  }

  bb.ui.registerMentionProvider({
    id: STAGE_MENTION_PROVIDER_ID,
    label: "Thread stages",
    async search({ query }) {
      return matchingStages(await enabledStages(), query).map((stage) => ({
        id: stage.toLowerCase(),
        title: stage,
        subtitle: `Stage · ${STAGE_MEANINGS[stage]}`,
      }));
    },
    resolve(id) {
      const stage = parseStage(id);
      if (stage === null) throw new Error(`Unknown stage: ${id}`);
      return { context: stageContext(stage) };
    },
  });
}
