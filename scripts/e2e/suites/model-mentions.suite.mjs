import {
  prepareLogoProvider,
  verifyModelMentions,
} from "../model-mentions.mjs";

export default {
  group: "ordering",
  id: "model-mentions",
  cases: ["composer"],
  plugins: ["bb-plugin-model-mentions"],
  prepare: prepareLogoProvider,
  run: verifyModelMentions,
};
