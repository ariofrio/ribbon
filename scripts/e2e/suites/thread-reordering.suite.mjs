import {
  verifyThreadReordering,
  verifyHeadingBoundary,
} from "../ribbon-sidebar/thread-reordering.mjs";

export default {
  order: 20,
  id: "thread-reordering",
  cases: ["interaction", "heading-boundary"],
  plugins: ["bb-plugin-ribbon-sidebar"],
  async run(args) {
    if (args.cases.includes("interaction")) await verifyThreadReordering(args);
    if (args.cases.includes("heading-boundary"))
      await verifyHeadingBoundary(args);
  },
};
