import { verifyPrStatus } from "../thread-stages/pr-status.mjs";

export default {
  order: 55,
  id: "pr-status",
  cases: ["auto-merge", "attention-fallback"],
  plugins: ["bb-plugin-thread-stages"],
  run: verifyPrStatus,
};
