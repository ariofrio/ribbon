import { verifyStageChangeMessages } from "../ribbon-sidebar/stage-change-messages.mjs";
import { waitForStageCatalog } from "../ribbon-sidebar/new-thread-routing.mjs";

export default {
  // Last, because the notice gives its thread a new turn.
  order: 140,
  id: "stage-change-messages",
  cases: ["mentions"],
  plugins: ["bb-plugin-ribbon-sidebar", "bb-plugin-thread-stages"],
  async prepare({ bb, cliEnv }) {
    await waitForStageCatalog({ bb, cliEnv });
  },
  run: verifyStageChangeMessages,
};
