import { prepareInstructionsProvider, verifyGlobalInstructions } from "../global-instructions.mjs";

export default {
  group: "features",
  id: "global-instructions",
  cases: ["editor"],
  plugins: ["bb-plugin-global-instructions"],
  prepare: prepareInstructionsProvider,
  run: verifyGlobalInstructions,
};
