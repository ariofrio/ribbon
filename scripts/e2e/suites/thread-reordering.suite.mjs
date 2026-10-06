import { verifyThreadReordering } from "../thread-stages/thread-reordering.mjs";

export default {
  order: 20,
  id: "thread-reordering",
  cases: ["interaction", "from-automatic"],
  plugins: ["bb-plugin-thread-stages"],
  async run(input) {
    for (const testCase of input.cases) {
      await verifyThreadReordering({ ...input, initialSort: testCase === "from-automatic" ? "alpha" : "none" });
    }
  },
};
