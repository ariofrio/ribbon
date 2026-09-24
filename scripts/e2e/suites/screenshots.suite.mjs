import { verifyScreenshotAnimations } from "../screenshot-animations.mjs";

export default {
  order: 70,
  id: "screenshots",
  cases: ["animations"],
  plugins: [],
  run: verifyScreenshotAnimations,
};
