import { verifyThreadTitlePan } from "../ribbon-sidebar/thread-title-pan.mjs";

export default {
  order: 35,
  id: "thread-title-pan",
  cases: ["hover"],
  plugins: ["bb-plugin-ribbon-sidebar"],
  run: verifyThreadTitlePan,
};
