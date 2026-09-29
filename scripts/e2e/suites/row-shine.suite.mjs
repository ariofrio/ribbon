import { verifyRowShine } from "../thread-stages/row-shine.mjs";

export default {
  id: "row-shine",
  cases: ["compositor"],
  plugins: ["bb-plugin-thread-stages"],
  run: verifyRowShine,
};
