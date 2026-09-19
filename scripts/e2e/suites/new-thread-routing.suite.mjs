import {
  verifyNewThreadRouting,
  waitForStageCatalog,
} from "../ribbon-sidebar/new-thread-routing.mjs";

export default {
  order: 100,
  id: "new-thread-routing",
  cases: ["project", "stage"],
  plugins: ["bb-plugin-ribbon-sidebar", "bb-plugin-thread-stages"],
  async prepare({ bb, cliEnv }) {
    await waitForStageCatalog({ bb, cliEnv });
  },
  async run({ stack, fixture, cases }) {
    await verifyNewThreadRouting({ stack, fixture, cases });
  },
};
