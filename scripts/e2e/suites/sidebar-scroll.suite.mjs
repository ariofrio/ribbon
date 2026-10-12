import { verifySidebarScroll } from "../thread-stages/sidebar-scroll.mjs";

export default {
  id: "sidebar-scroll",
  cases: ["long-list"],
  plugins: ["bb-plugin-thread-stages"],
  run: verifySidebarScroll,
};
