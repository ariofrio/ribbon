import { verifyThreadMenuDismissal } from "../thread-stages/thread-menu-dismissal.mjs";

export default {
  order: 32,
  id: "thread-menu-dismissal",
  cases: ["outside-focus-and-keyboard"],
  plugins: ["bb-plugin-thread-stages"],
  run: verifyThreadMenuDismissal,
};
