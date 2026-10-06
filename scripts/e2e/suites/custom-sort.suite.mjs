import { verifyCustomSort } from "../thread-stages/custom-sort.mjs";

export default {
  order: 19,
  id: "custom-sort",
  cases: ["desktop", "compact"],
  plugins: ["bb-plugin-thread-stages"],
  run: verifyCustomSort,
};
