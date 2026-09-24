import { verifyPrStatus } from "../ribbon-sidebar/pr-status.mjs";

export default {
  order: 55,
  id: "pr-status",
  cases: ["auto-merge", "attention-fallback"],
  plugins: ["bb-plugin-ribbon-sidebar"],
  run: verifyPrStatus,
};
