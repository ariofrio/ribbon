import type { BbPluginApi } from "@get-bb/plugin-sdk";

export function registerStageInstructions(bb: BbPluginApi): void {
  bb.agents.configure(({ origin }) => {
    if (origin.kind === "fork" && origin.pluginId === "side-chat") {
      return { tools: [], skills: [] };
    }
    return {
      tools: [],
      skills: ["thread-stages"],
      instructions: [
        "When this thread's work must wait for another bb thread to finish or deliver a dependency, use the thread-stages skill and set this thread to Blocked on other agent before yielding; do not wait for an explicit stage mention.",
        "Discover the CLI with `bb thread-stages`; placement is `bb thread-stages place --self --to plugin:thread-stages:stages/BlockedOnOtherAgent`. A child thread has its own stage; place the child itself.",
        "When the dependency is satisfied, reassess the stage and set Active if work can proceed, using `bb thread-stages place --self --to plugin:thread-stages:stages/Active`. An idle agent does not by itself prove its background work or requested result is complete.",
        "Waiting on the user remains Active; asking a question or requesting approval is not a reason to set a Blocked stage.",
      ].join(" "),
    };
  });
}
