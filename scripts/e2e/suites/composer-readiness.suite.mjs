import { verifyComposerReadiness } from "../composer-readiness.mjs";

export default {
  group: "placement",
  order: -20,
  id: "composer-readiness",
  cases: ["delayed-visibility"],
  plugins: ["bb-plugin-missing-keyboard-shortcuts"],
  run: verifyComposerReadiness,
};
