import { waitForStageCatalog } from "../thread-stages/new-thread-routing.mjs";
import { verifyDefaultSectionMenus } from "../thread-stages/default-sections.mjs";

export default {
  id: "default-section-menus",
  cases: ["headings"],
  plugins: ["bb-plugin-thread-stages", "bb-plugin-default-sections"],
  async prepare({ bb, cliEnv }) {
    await waitForStageCatalog({ bb, cliEnv });
  },
  run: verifyDefaultSectionMenus,
};
