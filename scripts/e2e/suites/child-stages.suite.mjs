import { verifyChildStages } from "../thread-stages/child-stages.mjs";
import { waitForThreadStages } from "../thread-stages/new-thread-routing.mjs";

export default {
  order: 46,
  id: "child-stages",
  cases: ["independent"],
  plugins: ["bb-plugin-thread-stages"],
  async prepare({ bb, cliEnv }) {
    await waitForThreadStages({ bb, cliEnv });
  },
  run: verifyChildStages,
};
