import { verifyStageChangeMessages } from "../thread-stages/stage-change-messages.mjs";
import { waitForStageCatalog } from "../thread-stages/new-thread-routing.mjs";

export default {
  // Last, because the notice gives its thread a new turn.
  order: 140,
  id: "stage-change-messages",
  cases: ["mentions"],
  plugins: ["bb-plugin-thread-stages"],
  async prepare({ bb, cliEnv }) {
    await waitForStageCatalog({ bb, cliEnv });
  },
  run: verifyStageChangeMessages,
};
