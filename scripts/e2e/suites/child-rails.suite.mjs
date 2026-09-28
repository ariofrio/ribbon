import { waitForStageCatalog } from "../ribbon-sidebar/new-thread-routing.mjs";
import { verifyChildRails } from "../ribbon-sidebar/child-rails.mjs";

export default {
  id: "child-rails",
  cases: ["bar", "tree"],
  plugins: [
    "bb-plugin-icons",
    "bb-plugin-ribbon-sidebar",
    "bb-plugin-thread-stages",
  ],
  async prepare({ bb, cliEnv }) {
    await waitForStageCatalog({ bb, cliEnv });
  },
  run: verifyChildRails,
};
