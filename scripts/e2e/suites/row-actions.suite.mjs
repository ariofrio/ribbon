import { verifyRowActions } from "../thread-stages/row-actions.mjs";

export default {
  order: 56,
  id: "row-actions",
  cases: ["configured"],
  plugins: ["bb-plugin-thread-stages"],
  run: verifyRowActions,
};
