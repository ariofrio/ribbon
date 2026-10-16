import { verifyMissingShortcuts } from "../missing-shortcuts.mjs";

export default {
  group: "features",
  order: -15,
  id: "missing-shortcuts",
  cases: ["navigation", "thread-creation", "composer-focus", "side-chat"],
  plugins: ["bb-plugin-missing-keyboard-shortcuts"],
  run: verifyMissingShortcuts,
};
