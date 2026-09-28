import type { BbPluginApi } from "@get-bb/plugin-sdk";
import {
  WORKFLOW_STAGES,
  WORKFLOW_STAGE_LABELS,
  enabledWorkflowStages,
  isBlockedStage,
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
  Active: "available, or waiting on the user",
  BlockedOnOtherAgent:
    "waiting for another agent's thread to finish or deliver something",
  BlockedOnThirdParty:
    "waiting for someone or something outside bb, such as a reviewer, CI, or a vendor",
  Completed: "finished, and treated like archived work",
};

const WAITING_ON_THE_USER =
  "Waiting on the user is Active, not a Blocked stage: ending a turn already waits on the user, so do not move a thread because you asked the user something.";

/** Mentions sent before a rename keep resolving. */
const RENAMED_STAGES: Record<string, WorkflowStage> = { idle: "Active" };

function parseStage(id: string): WorkflowStage | "Blocked" | null {
  if (id === "blocked") return "Blocked";
  return (
    RENAMED_STAGES[id] ??
    WORKFLOW_STAGES.find((stage) => stage.toLowerCase() === id) ??
    null
  );
}

function placement(stage: WorkflowStage): string {
  return `\`bb sidebar place <thread> --to plugin:thread-stages:stages/${stage}\``;
}

export function stageContext(stage: WorkflowStage | "Blocked"): string {
  if (stage === "Blocked") {
    return [
      `@Blocked was a workflow stage that Ribbon sidebar has since split into Blocked on other agent, ${STAGE_MEANINGS.BlockedOnOtherAgent}, and Blocked on third party, ${STAGE_MEANINGS.BlockedOnThirdParty}.`,
      `When a message asks for a thread to be put in it, finish any work it asks for first, then run ${placement("BlockedOnOtherAgent")} or ${placement("BlockedOnThirdParty")}, whichever the thread is waiting on, with \`--self\` in place of <thread> for the current thread. A child thread has no stage of its own; place its root instead.`,
      WAITING_ON_THE_USER,
    ].join(" ");
  }
  const label = WORKFLOW_STAGE_LABELS[stage];
  return [
    `@${label} is the ${label} workflow stage that Ribbon sidebar gives root bb threads: ${STAGE_MEANINGS[stage]}.`,
    `When a message asks for a thread to be put in this stage, whether in a sentence such as "do this, then @${label}" or with the mention alone, finish any work it asks for first, then run ${placement(stage)}, with \`--self\` in place of <thread> for the current thread. A child thread has no stage of its own; place its root instead.`,
    ...(stage === "Active" || isBlockedStage(stage) ? [WAITING_ON_THE_USER] : []),
  ].join(" ");
}

function labelMatches(label: string, needle: string): boolean {
  return label
    .toLowerCase()
    .split(" ")
    .some((_, index, words) => words.slice(index).join(" ").startsWith(needle));
}

function matchingStages(
  stages: readonly WorkflowStage[],
  query: string,
): WorkflowStage[] {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return [];
  if ("stage".startsWith(needle) || needle.startsWith("stage")) {
    const rest = needle.slice("stage".length).trim();
    return stages.filter((stage) =>
      WORKFLOW_STAGE_LABELS[stage].toLowerCase().startsWith(rest),
    );
  }
  return stages.filter((stage) =>
    labelMatches(WORKFLOW_STAGE_LABELS[stage], needle),
  );
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
        title: WORKFLOW_STAGE_LABELS[stage],
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
