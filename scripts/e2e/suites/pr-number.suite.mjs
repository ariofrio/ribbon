import { verifyPrNumber } from "../thread-stages/pr-number.mjs";

export default {
  order: 50,
  id: "pr-number",
  cases: ["placement"],
  plugins: ["bb-plugin-thread-stages"],
  run: verifyPrNumber,
};
