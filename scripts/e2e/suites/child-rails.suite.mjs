import { waitForThreadStages } from "../thread-stages/new-thread-routing.mjs";
import { verifyChildRails } from "../thread-stages/child-rails.mjs";

export default {
  id: "child-rails",
  cases: ["bar", "tree", "stage-bands"],
  plugins: ["bb-plugin-thread-stages"],
  async prepare({ bb, cliEnv }) {
    await waitForThreadStages({ bb, cliEnv });
  },
  run: verifyChildRails,
};
