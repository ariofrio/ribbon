import { verifyCollapsedPreview } from "../thread-stages/collapsed-preview.mjs";

export default {
  id: "collapsed-preview",
  cases: ["section", "project"],
  plugins: ["bb-plugin-thread-stages"],
  run: verifyCollapsedPreview,
};
