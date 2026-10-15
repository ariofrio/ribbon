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
        ? "Maintain this thread's stage using the thread-stages skill."
        : "Read the thread-stages skill; change stages only when the user explicitly requests it.",
    };
  });
}
