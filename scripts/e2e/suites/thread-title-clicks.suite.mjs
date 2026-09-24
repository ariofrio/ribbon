import { verifyThreadTitleClicks } from "../ribbon-sidebar/thread-title-clicks.mjs";

export default {
  order: 30,
  id: "thread-title-clicks",
  cases: ["navigation"],
  plugins: ["bb-plugin-ribbon-sidebar"],
  run: verifyThreadTitleClicks,
};
