import { verifyChildReordering } from "../thread-stages/child-reordering.mjs";

export default {
  id: "child-reordering",
  cases: ["drag"],
  plugins: ["bb-plugin-thread-stages"],
  run: verifyChildReordering,
};
