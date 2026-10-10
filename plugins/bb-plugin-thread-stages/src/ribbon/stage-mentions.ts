import type { BbPluginApi } from "@get-bb/plugin-sdk";
import {
  WORKFLOW_STAGES,
  WORKFLOW_STAGE_LABELS,
  isBlockedStage,
  type WorkflowStage,
} from "./workflow/workflow-stage";

/**
 * Stage-change messages carry stage mentions as `stage:<stage in lowercase>`
 * under this plugin's id, so this provider owns their resolution and draws
 * them with this plugin's icon.
 */
const STAGE_MENTION_PROVIDER_ID = "stage";

const STAGE_MEANINGS: Record<WorkflowStage, string> = {
  Deferred: "intentionally set aside for later",
  Active: "work is available or progressing under this thread's coordination",
  Waiting: "standing by for an established condition, such as observation, a scheduled start, or recovery, with no current action or user decision due",
  BlockedOnUser:
    "the user owes input, a decision, approval, direction, or intended review, and no useful independent work remains here",
  BlockedOnOtherAgent:
    "another bb thread owns a required action or result, and no useful independent work remains here",
  BlockedOnThirdParty:
    "an independent external party owns a required action or response, and no useful independent work remains here; the party may be a person, agent, or organization",
  Completed: "the established objective has reached a durable result, with intended review and loose ends settled or delegated, so the thread can be put away",
};

const WAITING_ON_THE_USER =
  "User input, decisions, approval, direction, and intended review use Blocked on user when no useful independent work remains. Continue independent work in In progress first. Ending a turn does not by itself change the stage.";

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
  return `\`bb thread-stages stage ${stage} <thread>\``;
}

function stageContext(stage: WorkflowStage | "Blocked"): string {
  if (stage === "Blocked") {
    return [
      `@Blocked was a workflow stage that Thread stages has since split into ${WORKFLOW_STAGE_LABELS.BlockedOnOtherAgent}, where ${STAGE_MEANINGS.BlockedOnOtherAgent}, and ${WORKFLOW_STAGE_LABELS.BlockedOnThirdParty}, where ${STAGE_MEANINGS.BlockedOnThirdParty}. Use Waiting for standby on a condition instead of an action owned by another party. Read the thread-stages skill before selecting a stage.`,
      `When a message asks for a thread to be put in it, finish any work it asks for first, then run ${placement("BlockedOnOtherAgent")} or ${placement("BlockedOnThirdParty")}, whichever the thread is waiting on, with \`--self\` in place of <thread> for the current thread.`,
      WAITING_ON_THE_USER,
    ].join(" ");
  }
  const label = WORKFLOW_STAGE_LABELS[stage];
  return [
    `@${label} is the ${label} workflow stage that Thread stages gives bb threads: ${STAGE_MEANINGS[stage]}. Read the thread-stages skill before selecting or changing a stage.`,
    `When a message asks for a thread to be put in this stage, whether in a sentence such as "do this, then @${label}" or with the mention alone, finish any work it asks for first, then run ${placement(stage)}, with \`--self\` in place of <thread> for the current thread. A child thread has a stage of its own; place the child itself.`,
    ...(stage === "Active" || stage === "Waiting" || isBlockedStage(stage) ? [WAITING_ON_THE_USER] : []),
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
  bb.ui.registerMentionProvider({
    id: STAGE_MENTION_PROVIDER_ID,
    label: "Thread stages",
    search({ query }) {
      return matchingStages(WORKFLOW_STAGES, query).map((stage) => ({
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
