import { verifyPluginUpgrade } from "../plugin-upgrade.mjs";
import { waitForStageCatalog } from "../ribbon-sidebar/new-thread-routing.mjs";

export default {
  order: 80,
  id: "plugin-upgrade",
  cases: ["public-api"],
  plugins: [
    "bb-plugin-icons",
    "bb-plugin-missing-keyboard-shortcuts",
    "bb-plugin-chatgpt-theme",
    "bb-plugin-ribbon-sidebar",
    "bb-plugin-thread-stages",
    "bb-plugin-breadcrumbs",
  ],
  async prepare({ bb, cliEnv }) {
    await waitForStageCatalog({ bb, cliEnv });
  },
  run: verifyPluginUpgrade,
};
