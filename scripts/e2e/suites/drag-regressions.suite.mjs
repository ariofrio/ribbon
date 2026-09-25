import { verifyDragRegressions } from "../ribbon-sidebar/drag-regressions.mjs";

export default {
  order: 25,
  id: "drag-regressions",
  cases: [
    "preview-stability",
    "stage-boundary",
    "stage-placement",
    "stale-read",
    "rapid-reorder",
    "nested",
  ],
  plugins: ["bb-plugin-ribbon-sidebar"],
  run: verifyDragRegressions,
};
