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
        ? "Read thread-stages first. Automatic updates are on: inspect again with `bb thread-stages show --self --json` and finish needed changes before independent work (including task input/source reads) or waiting for user input. Stage assessment and routine readiness checks are exempt."
        : "Read thread-stages; change stage only on explicit user request.",
    };
  });
}
