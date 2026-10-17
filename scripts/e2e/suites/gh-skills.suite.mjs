import { prepareGhSkills, verifyGhSkills } from "../gh-skills.mjs";

export default {
  group: "features",
  id: "gh-skills",
  cases: ["server-skill-management"],
  plugins: ["bb-plugin-gh-skills"],
  prepareStack: prepareGhSkills,
  run: verifyGhSkills,
};
