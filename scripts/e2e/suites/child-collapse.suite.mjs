import { verifyChildCollapse } from "../thread-stages/child-collapse.mjs";

export default {
  order: 45,
  id: "child-collapse",
  cases: ["reload"],
  plugins: ["bb-plugin-thread-stages"],
  run: verifyChildCollapse,
};
