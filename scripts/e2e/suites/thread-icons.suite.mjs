import { waitForStageCatalog } from "../thread-stages/new-thread-routing.mjs";
import { verifyThreadIcons } from "../thread-stages/thread-icons.mjs";

export default {
  order: 60,
  id: "thread-icons",
  cases: ["groupings"],
  plugins: ["bb-plugin-thread-stages"],
  async prepare({ bb, cliEnv }) {
    await waitForStageCatalog({ bb, cliEnv });
  },
  run: verifyThreadIcons,
};
