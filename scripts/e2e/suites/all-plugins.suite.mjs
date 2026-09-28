import { verifyAllPlugins } from "../thread-stages/all-plugins.mjs";
import { waitForStageCatalog } from "../thread-stages/new-thread-routing.mjs";

export default {
  order: 80,
  id: "all-plugins",
  cases: ["public-api"],
  plugins: [
    "bb-plugin-missing-keyboard-shortcuts",
    "bb-plugin-chatgpt-theme",
    "bb-plugin-thread-stages",
  ],
  async prepare({ bb, cliEnv }) {
    await waitForStageCatalog({ bb, cliEnv });
  },
  run: verifyAllPlugins,
};
