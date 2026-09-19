import { verifyOptionalIconLayout } from "../ribbon-sidebar/optional-icon-layout.mjs";

export default {
  order: 110,
  id: "optional-icon-layout",
  cases: ["title-indicator-lane"],
  plugins: ["bb-plugin-ribbon-sidebar"],
  async run({ stack, fixture }) {
    await verifyOptionalIconLayout({ stack, fixture });
  },
};
