import { verifyThreadContextMenu } from "../thread-stages/thread-context-menu.mjs";

export default {
  group: "features",
  order: 31,
  id: "thread-context-menu",
  cases: ["right-click-release"],
  plugins: ["bb-plugin-thread-stages"],
  run: verifyThreadContextMenu,
};
