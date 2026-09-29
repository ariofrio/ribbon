import { verifyTitleLane } from "../thread-stages/title-lane.mjs";

export default {
  id: "title-lane",
  cases: ["rest-and-hover"],
  plugins: ["bb-plugin-thread-stages"],
  run: verifyTitleLane,
};
