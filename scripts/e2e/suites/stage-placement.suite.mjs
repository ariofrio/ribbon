import { verifyStagePlacement } from "../thread-stages/stage-placement.mjs";
import { waitForThreadStages } from "../thread-stages/new-thread-routing.mjs";

export default {
  order: 10,
  id: "stage-placement",
  cases: ["default-order"],
  plugins: ["bb-plugin-thread-stages"],
  async prepare({ bb, cliEnv }) {
    await waitForThreadStages({ bb, cliEnv });
  },
  run: verifyStagePlacement,
};
