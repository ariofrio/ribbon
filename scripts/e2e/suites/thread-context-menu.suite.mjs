import { verifyThreadContextMenu } from "../ribbon-sidebar/thread-context-menu.mjs";

export default {
  order: 31,
  id: "thread-context-menu",
  cases: ["right-click-release"],
  plugins: ["bb-plugin-ribbon-sidebar"],
  run: verifyThreadContextMenu,
};
