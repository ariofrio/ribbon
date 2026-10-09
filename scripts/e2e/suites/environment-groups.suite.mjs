import { verifyEnvironmentGroups } from "../thread-stages/environment-groups.mjs";
import { waitForThreadStages } from "../thread-stages/new-thread-routing.mjs";

export default {
  id: "environment-groups",
  cases: ["stage-bands"],
  plugins: ["bb-plugin-thread-stages"],
  async prepare({ bb, cliEnv }) {
    await waitForThreadStages({ bb, cliEnv });
  },
  run: verifyEnvironmentGroups,
};
