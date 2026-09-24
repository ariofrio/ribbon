import { verifyStageShortcuts } from "../stage-shortcuts.mjs";
import { waitForStageCatalog } from "../ribbon-sidebar/new-thread-routing.mjs";

export default {
  order: 130,
  id: "stage-shortcuts",
  cases: ["platforms"],
  plugins: ["bb-plugin-thread-stages", "bb-plugin-ribbon-sidebar"],
  async prepare({ bb, cliEnv }) {
    await waitForStageCatalog({ bb, cliEnv });
  },
  run: verifyStageShortcuts,
};
