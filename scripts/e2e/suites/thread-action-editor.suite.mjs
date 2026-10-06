import { verifyThreadActionEditor } from "../thread-stages/thread-action-editor.mjs";

export default {
  id: "thread-action-editor",
  cases: ["desktop", "compact"],
  plugins: ["bb-plugin-thread-stages"],
  run: verifyThreadActionEditor,
};
