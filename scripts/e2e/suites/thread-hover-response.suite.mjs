import { verifyThreadHoverResponse } from "../thread-stages/thread-hover-response.mjs";

export default {
  id: "thread-hover-response",
  cases: ["sweep"],
  plugins: ["bb-plugin-thread-stages"],
  run: verifyThreadHoverResponse,
};
