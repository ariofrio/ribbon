import { verifyPrStatus } from "../thread-stages/pr-status.mjs";

export default {
  group: "ordering",
  order: 55,
  id: "pr-status",
  cases: ["auto-merge", "attention-fallback", "public-queue"],
  plugins: ["bb-plugin-thread-stages"],
  run: verifyPrStatus,
};
