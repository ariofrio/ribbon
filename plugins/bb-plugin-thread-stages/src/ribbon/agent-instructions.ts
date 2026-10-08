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
        ? "Read the thread-stages skill before selecting or changing a stage. Keep this thread's stage aligned with its overall workflow state; do not wait for a stage mention. Inspect the current stage and change it only when it no longer fits. Ending a turn or individual request does not by itself change the stage."
        : "Read the thread-stages skill before changing this thread's stage, and change it only when the user explicitly requests a stage change.",
    };
  });
}
