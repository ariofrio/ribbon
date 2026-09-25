import { verifyChildCollapse } from "../ribbon-sidebar/child-collapse.mjs";

export default {
  order: 45,
  id: "child-collapse",
  cases: ["reload"],
  plugins: ["bb-plugin-ribbon-sidebar"],
  run: verifyChildCollapse,
};
