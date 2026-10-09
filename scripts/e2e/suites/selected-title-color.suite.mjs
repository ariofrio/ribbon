import { verifySelectedTitleColor } from "../thread-stages/selected-title-color.mjs";

export default {
  group: "ordering",
  order: 120,
  id: "selected-title-color",
  cases: ["chatgpt-theme"],
  plugins: ["bb-plugin-thread-stages", "bb-plugin-chatgpt-theme"],
  run: verifySelectedTitleColor,
};
