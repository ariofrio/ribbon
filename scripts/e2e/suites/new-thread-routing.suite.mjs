import {
  verifyNewThreadRouting,
  waitForStageCatalog,
} from "../thread-stages/new-thread-routing.mjs";

export default {
  order: 100,
  id: "new-thread-routing",
  cases: ["stage"],
  plugins: ["bb-plugin-thread-stages"],
  async prepare({ bb, cliEnv }) {
    await waitForStageCatalog({ bb, cliEnv });
  },
  run: verifyNewThreadRouting,
};
