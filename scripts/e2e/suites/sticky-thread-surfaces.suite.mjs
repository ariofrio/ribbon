import { verifyStickyThreadSurfaces } from "../thread-stages/sticky-thread-surfaces.mjs";

export default {
  id: "sticky-thread-surfaces",
  cases: ["hover-dark", "hover-light", "selected-dark", "selected-light"],
  plugins: ["bb-plugin-thread-stages"],
  run: verifyStickyThreadSurfaces,
};
