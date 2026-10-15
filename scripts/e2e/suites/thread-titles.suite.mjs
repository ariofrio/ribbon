import { verifyDeletedThreadTitles, verifyThreadTitles } from "../thread-titles.mjs";

export default {
  group: "ordering",
  order: 10,
  id: "thread-titles",
  cases: ["once", "deleted"],
  plugins: ["bb-plugin-thread-titles"],
  async run(context) {
    if (context.cases.includes("once")) await verifyThreadTitles(context);
    if (context.cases.includes("deleted")) await verifyDeletedThreadTitles(context);
  },
};
