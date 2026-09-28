import { verifyThreadActions } from "../thread-stages/thread-actions.mjs";

export default {
  order: 61,
  id: "thread-actions",
  cases: ["edit-and-run"],
  plugins: ["bb-plugin-thread-stages"],
  run: verifyThreadActions,
};
