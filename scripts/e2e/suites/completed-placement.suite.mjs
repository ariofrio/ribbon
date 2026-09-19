import { verifyCompletedPlacement } from "../ribbon-sidebar/completed-placement.mjs";
import { waitForStageCatalog } from "../ribbon-sidebar/new-thread-routing.mjs";

export default {
  order: 0,
  id: "completed-placement",
  cases: ["default-order"],
  plugins: ["bb-plugin-ribbon-sidebar", "bb-plugin-thread-stages"],
  async prepare({ bb, cliEnv }) {
    await waitForStageCatalog({ bb, cliEnv });
  },
  run: verifyCompletedPlacement,
};
