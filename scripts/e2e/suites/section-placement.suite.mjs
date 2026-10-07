import { verifySectionPlacement } from "../thread-stages/section-placement.mjs";

export default {
  order: 11,
  id: "section-placement",
  cases: ["menu"],
  plugins: ["bb-plugin-thread-stages"],
  run: verifySectionPlacement,
};
