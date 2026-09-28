import { verifyRowShine } from "../ribbon-sidebar/row-shine.mjs";

export default {
  id: "row-shine",
  cases: ["compositor"],
  plugins: ["bb-plugin-ribbon-sidebar"],
  run: verifyRowShine,
};
