import { verifyThreadActions } from "../ribbon-sidebar/thread-actions.mjs";

export default {
  order: 61,
  id: "thread-actions",
  cases: ["edit-and-run"],
  plugins: ["bb-plugin-icons", "bb-plugin-ribbon-sidebar"],
  run: verifyThreadActions,
};
