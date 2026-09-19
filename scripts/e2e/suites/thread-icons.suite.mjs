import { waitForStageCatalog } from "../ribbon-sidebar/new-thread-routing.mjs";
import { verifyThreadIcons } from "../ribbon-sidebar/thread-icons.mjs";

export default {
  order: 60,
  id: "thread-icons",
  cases: ["groupings"],
  plugins: [
    "bb-plugin-icons",
    "bb-plugin-ribbon-sidebar",
    "bb-plugin-thread-stages",
  ],
  async prepare({ bb, cliEnv }) {
    await waitForStageCatalog({ bb, cliEnv });
  },
  run: verifyThreadIcons,
};
