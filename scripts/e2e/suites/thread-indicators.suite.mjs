import { verifyThreadIndicators } from "../ribbon-sidebar/thread-indicators.mjs";

export default {
  order: -10,
  id: "thread-indicators",
  cases: ["parity"],
  plugins: ["bb-plugin-ribbon-sidebar"],
  run: verifyThreadIndicators,
};
