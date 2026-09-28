import { verifyChildReordering } from "../ribbon-sidebar/child-reordering.mjs";

export default {
  id: "child-reordering",
  cases: ["drag"],
  plugins: ["bb-plugin-ribbon-sidebar"],
  run: verifyChildReordering,
};
