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
        ? "Use the thread-stages skill to update this thread's stage when work starts, waits, resumes, or finishes; do not wait for a stage mention."
        : "Use the thread-stages skill to update this thread's stage only when the user explicitly requests a stage change.",
    };
  });
}
