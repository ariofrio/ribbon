import { verifyStageShortcuts } from "../stage-shortcuts.mjs";
import { waitForThreadStages } from "../thread-stages/new-thread-routing.mjs";

export default {
  order: 130,
  id: "stage-shortcuts",
  cases: ["platforms"],
  plugins: ["bb-plugin-thread-stages"],
  async prepare({ bb, cliEnv }) {
    await waitForThreadStages({ bb, cliEnv });
  },
  run: verifyStageShortcuts,
};
