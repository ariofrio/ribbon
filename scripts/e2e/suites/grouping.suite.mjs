import { verifyGrouping } from "../thread-stages/grouping.mjs";

export default {
  order: 40,
  id: "grouping",
  cases: ["sections-and-projects"],
  plugins: ["bb-plugin-thread-stages"],
  run: verifyGrouping,
};
