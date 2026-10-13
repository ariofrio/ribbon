import { verifyMobileStageMenu } from "../thread-stages/mobile-stage-menu.mjs";
import { waitForThreadStages } from "../thread-stages/new-thread-routing.mjs";

export default {
  id: "mobile-stage-menu",
  cases: ["dropdown", "long-press"],
  plugins: ["bb-plugin-thread-stages"],
  async prepare({ bb, cliEnv }) {
    await waitForThreadStages({ bb, cliEnv });
  },
  run: verifyMobileStageMenu,
};
