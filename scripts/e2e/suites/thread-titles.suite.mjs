import { verifyThreadTitles } from "../thread-titles.mjs";

export default {
  order: 10,
  id: "thread-titles",
  cases: ["once"],
  plugins: ["bb-plugin-thread-titles"],
  run: verifyThreadTitles,
};
