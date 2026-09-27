import { verifyThreadHoverResponse } from "../ribbon-sidebar/thread-hover-response.mjs";

export default {
  id: "thread-hover-response",
  cases: ["sweep"],
  plugins: ["bb-plugin-ribbon-sidebar"],
  run: verifyThreadHoverResponse,
};
