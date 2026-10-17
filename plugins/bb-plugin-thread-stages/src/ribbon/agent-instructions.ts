import type { BbPluginApi } from "@get-bb/plugin-sdk";

export function registerStageInstructions(
  bb: BbPluginApi,
  automaticStageUpdates: () => boolean,
): void {
  bb.agents.configure(({ origin }) => {
    if (origin.kind === "fork" && origin.pluginId === "side-chat") {
      return { tools: [], skills: [] };
    }
    return {
      tools: [],
      skills: ["thread-stages"],
      instructions: automaticStageUpdates()
        ? "Read the thread-stages skill before selecting or changing a stage. Keep this thread's stage aligned with its overall workflow state; do not wait for a stage mention. Respect an explicit user instruction to retain a stage or manage it themselves. Otherwise, before resuming independent work or waiting for required user input, inspect the current stage again with the CLI and complete any needed stage change; use In progress while this thread can advance the work, even if a later step needs user review. Finish that stage change before tool calls that advance that independent work. Routine checks for whether a wait has resolved do not by themselves change the stage. Ending a turn or individual request does not by itself change the stage. Before marking Completed, check the full conversation for unresolved findings and follow-up responsibility; submission alone does not establish closure."
        : "Read the thread-stages skill before changing this thread's stage, and change it only when the user explicitly requests a stage change.",
    };
  });
}
