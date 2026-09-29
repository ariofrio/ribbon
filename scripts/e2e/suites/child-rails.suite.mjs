import { waitForStageCatalog } from "../thread-stages/new-thread-routing.mjs";
import { verifyChildRails } from "../thread-stages/child-rails.mjs";

export default {
  id: "child-rails",
  cases: ["bar", "tree"],
  plugins: ["bb-plugin-thread-stages"],
  async prepare({ bb, cliEnv }) {
    await waitForStageCatalog({ bb, cliEnv });
  },
  run: verifyChildRails,
};
