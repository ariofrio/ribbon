import { verifySidebarScroll } from "../thread-stages/sidebar-scroll.mjs";

export default {
  id: "sidebar-scroll",
  cases: [
    "native-long-list",
    "native-tall-list",
    "native-nested-list",
    "native-scrollbar-drag",
    "long-list",
    "tall-list",
    "nested-list",
    "scrollbar-drag",
    "scalability",
    "completed-scalability",
  ],
  plugins: ["bb-plugin-thread-stages"],
  run: verifySidebarScroll,
};
