import { verifyNewThreads } from "../default-sections/new-threads.mjs";

export default {
  id: "default-sections",
  cases: ["new-threads"],
  plugins: ["bb-plugin-default-sections"],
  run: verifyNewThreads,
};
