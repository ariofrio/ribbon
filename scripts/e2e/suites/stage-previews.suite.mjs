import { verifyStagePreviews } from "../thread-stages/stage-previews.mjs";

export default {
  group: "ordering",
  id: "stage-previews",
  cases: ["pinned", "pinned-project", "pinned-machine", "children", "environment", "pinned-environment"],
  plugins: ["bb-plugin-thread-stages"],
  run: verifyStagePreviews,
};
