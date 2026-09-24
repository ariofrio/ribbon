import { verifyNoPaging } from "../ribbon-sidebar/no-paging.mjs";

export default {
  order: 40,
  id: "no-paging",
  cases: ["display-options"],
  plugins: ["bb-plugin-ribbon-sidebar"],
  run: verifyNoPaging,
};
