import { verifyThreadTitleClicks } from "../thread-stages/thread-title-clicks.mjs";

export default {
  group: "features",
  order: 30,
  id: "thread-title-clicks",
  cases: ["navigation"],
  plugins: ["bb-plugin-thread-stages"],
  run: verifyThreadTitleClicks,
};
