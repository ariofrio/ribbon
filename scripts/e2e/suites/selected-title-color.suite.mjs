import { verifySelectedTitleColor } from "../ribbon-sidebar/selected-title-color.mjs";

export default {
  order: 120,
  id: "selected-title-color",
  cases: ["chatgpt-theme"],
  plugins: ["bb-plugin-ribbon-sidebar", "bb-plugin-chatgpt-theme"],
  run: verifySelectedTitleColor,
};
