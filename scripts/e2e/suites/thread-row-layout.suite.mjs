import { verifyThreadRowLayout } from "../thread-stages/thread-row-layout.mjs";

export default {
  id: "thread-row-layout",
  cases: ["desktop", "desktop-light", "compact"],
  plugins: ["bb-plugin-thread-stages"],
  run: verifyThreadRowLayout,
};
