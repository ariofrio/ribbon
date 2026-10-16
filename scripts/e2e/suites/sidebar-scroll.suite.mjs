import { verifySidebarScroll } from "../thread-stages/sidebar-scroll.mjs";

export default {
  id: "sidebar-scroll",
  cases: [
    "long-list",
    "nested-list",
    "scrollbar-drag",
    "scalability",
    "completed-scalability",
  ],
  plugins: ["bb-plugin-thread-stages"],
  run: verifySidebarScroll,
};
