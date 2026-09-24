import { verifyPrNumber } from "../ribbon-sidebar/pr-number.mjs";

export default {
  order: 50,
  id: "pr-number",
  cases: ["placement"],
  plugins: ["bb-plugin-ribbon-sidebar"],
  run: verifyPrNumber,
};
