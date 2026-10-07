import { verifyTerminalShortcut } from "../terminal-shortcut.mjs";

export default {
  order: -10,
  id: "terminal-shortcut",
  cases: ["focus-and-toggle"],
  plugins: ["bb-plugin-missing-keyboard-shortcuts"],
  run: verifyTerminalShortcut,
};
