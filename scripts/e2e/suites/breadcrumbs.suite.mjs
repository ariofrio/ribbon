import { verifyBreadcrumbChildBadge } from "../breadcrumbs/child-badge.mjs";

export default {
  order: 90,
  id: "breadcrumbs",
  cases: ["child-badge"],
  plugins: ["bb-plugin-breadcrumbs"],
  async run({ stack, fixture }) {
    await verifyBreadcrumbChildBadge({ stack, fixture });
  },
};
