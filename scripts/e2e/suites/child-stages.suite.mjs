import { verifyChildStages } from "../ribbon-sidebar/child-stages.mjs";
import { waitForStageCatalog } from "../ribbon-sidebar/new-thread-routing.mjs";

export default {
  order: 46,
  id: "child-stages",
  cases: ["independent"],
  plugins: ["bb-plugin-ribbon-sidebar"],
  async prepare({ bb, cliEnv }) {
    await waitForStageCatalog({ bb, cliEnv });
  },
  run: verifyChildStages,
};
