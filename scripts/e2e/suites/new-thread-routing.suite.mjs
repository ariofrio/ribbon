import {
  verifyNewThreadRouting,
  waitForThreadStages,
} from "../thread-stages/new-thread-routing.mjs";

export default {
  group: "ordering",
  order: 100,
  id: "new-thread-routing",
  cases: ["stage"],
  plugins: ["bb-plugin-thread-stages"],
  async prepare({ bb, cliEnv }) {
    await waitForThreadStages({ bb, cliEnv });
  },
  run: verifyNewThreadRouting,
};
