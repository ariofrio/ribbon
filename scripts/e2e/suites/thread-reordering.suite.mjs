import { verifyThreadReordering } from "../thread-stages/thread-reordering.mjs";

export default {
  order: 20,
  id: "thread-reordering",
  cases: ["interaction"],
  plugins: ["bb-plugin-thread-stages"],
  run: verifyThreadReordering,
};
