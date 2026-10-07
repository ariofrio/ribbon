import { verifyCompletedPlacement } from "../thread-stages/completed-placement.mjs";
import { waitForThreadStages } from "../thread-stages/new-thread-routing.mjs";

export default {
  order: 0,
  id: "completed-placement",
  cases: ["default-order"],
  plugins: ["bb-plugin-thread-stages"],
  async prepare({ bb, cliEnv }) {
    await waitForThreadStages({ bb, cliEnv });
  },
  run: verifyCompletedPlacement,
};
