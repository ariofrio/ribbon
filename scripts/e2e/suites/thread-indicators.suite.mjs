import { verifyThreadIndicators } from "../thread-stages/thread-indicators.mjs";

export default {
  group: "ordering",
  order: -10,
  id: "thread-indicators",
  cases: ["parity"],
  plugins: ["bb-plugin-thread-stages"],
  run: verifyThreadIndicators,
};
