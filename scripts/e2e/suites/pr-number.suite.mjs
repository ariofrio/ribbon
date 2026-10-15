import { verifyPrNumber } from "../thread-stages/pr-number.mjs";

export default {
  group: "placement",
  order: 50,
  id: "pr-number",
  cases: ["placement"],
  plugins: ["bb-plugin-thread-stages"],
  run: verifyPrNumber,
};
