import { verifyThreadTitlePan } from "../thread-stages/thread-title-pan.mjs";

export default {
  order: 35,
  id: "thread-title-pan",
  cases: ["hover", "reduced-motion", "fade", "ellipsis"],
  plugins: ["bb-plugin-thread-stages"],
  run: verifyThreadTitlePan,
};
