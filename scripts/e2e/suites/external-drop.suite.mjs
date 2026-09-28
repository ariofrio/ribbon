import { verifyExternalDrop } from "../ribbon-sidebar/external-drop.mjs";

export default {
  id: "external-drop",
  cases: ["main-view", "composer", "return", "race"],
  plugins: ["bb-plugin-ribbon-sidebar"],
  run: verifyExternalDrop,
};
