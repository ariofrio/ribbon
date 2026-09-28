import { verifyStageChangeMessages } from "../ribbon-sidebar/stage-change-messages.mjs";

export default {
  // Last, because the notice gives its thread a new turn.
  order: 140,
  id: "stage-change-messages",
  cases: ["pill"],
  plugins: ["bb-plugin-ribbon-sidebar"],
  run: verifyStageChangeMessages,
};
