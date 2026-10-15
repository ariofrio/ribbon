import { verifyDragRegressions } from "../thread-stages/drag-regressions.mjs";

export default {
  group: "ordering",
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
  plugins: ["bb-plugin-thread-stages"],
  run: verifyDragRegressions,
};
