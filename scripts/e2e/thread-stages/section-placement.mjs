import assert from "node:assert/strict";
import { FEATURED_THREAD } from "../../screenshots/fixture.mjs";
import { launch, openContext, row, section, sidebar, STAGES } from "./sidebar.mjs";

export async function verifySectionPlacement({ stack, fixture }) {
  const moving = fixture.threads.get(FEATURED_THREAD);
  const resident = fixture.threads.get("Add keyboard navigation to filters");
  const savedPreferences = fixture.runJson(["thread-stages", "prefs", "list"]);
  const stage = (thread, value) => fixture.run(["thread-stages", "place", thread.id, "--to", `${STAGES}/${value}`]);
  const place = (destination, anchor = []) => fixture.run([
    "thread-stages", "place", moving.id, "--to", `builtin:sections/${destination}`, ...anchor,
  ]);
  const browser = await launch();
  let context;
  try {
    fixture.run(["thread-stages", "prefs", "set", "organizationMode", "chronological"]);
    fixture.run(["thread-stages", "prefs", "set", "chronologicalSort", "none"]);
    fixture.run(["thread-stages", "prefs", "set", "environmentGrouping", "false"]);
    context = await openContext(browser, { viewport: { width: 1280, height: 1200 } });
    const page = await context.newPage();
    await page.goto(stack.serverUrl);
    await sidebar(page).waitFor({ timeout: 120_000 });
    async function moveFromMenu(destination) {
      const movingRow = row(sidebar(page), moving.id);
      await movingRow.hover();
      await movingRow.getByRole("button", { name: "Thread actions", exact: true }).click();
      await page.getByRole("menuitem", { name: "Move to section", exact: true }).hover();
      const saved = Promise.all([
        "builtin:sections",
      ].map((groupingKey) => page.waitForResponse((response) =>
        response.url().endsWith("/rpc/updatePlacementV1") &&
        response.request().postDataJSON().groupingKey === groupingKey)));
      await page.getByRole("menuitem", { name: destination, exact: true }).click();
      for (const response of await saved) {
        assert.ok(response.ok());
        assert.ok((await response.json()).result.ok);
      }
    }
    for (const currentStage of ["Active", "Deferred", "Completed"]) {
      console.log(`Checking ${currentStage} section menu placement`);
      stage(moving, currentStage);
      stage(resident, currentStage);
      place(fixture.section.id, ["--after", resident.id]);
      const group = section(page, fixture.section.id);
      await row(group, resident.id).getByLabel(`${currentStage} stage`, { exact: true }).waitFor();
      async function expandPreview() {
        if (currentStage === "Active") return;
        const more = group.getByRole("button", { name: new RegExp(`^Show \\d+ more ${currentStage.toLowerCase()}$`) });
        if (await more.count()) await more.click();
      }
      await expandPreview();
      await row(section(page, fixture.section.id), moving.id).waitFor();
      await moveFromMenu("Threads");
      await row(sidebar(page), moving.id).waitFor();
      await page.waitForFunction(({ threadId, sectionId }) => {
        const group = document.querySelector(`[data-ribbon-sidebar-root] [data-sidebar-section-id="${sectionId}"]`);
        return group && !group.querySelector(`[data-thread-id="${threadId}"]`);
      }, { threadId: moving.id, sectionId: fixture.section.id });
      await moveFromMenu(fixture.section.name);
      await row(group, moving.id).waitFor();
      await expandPreview();
      const selector = `[data-ribbon-sidebar-root] [data-sidebar-section-id="${fixture.section.id}"]`;
      const assertFirst = () => page.waitForFunction(({ selector, moving, resident }) => {
        const group = document.querySelector(selector);
        const first = group?.querySelector(`[data-thread-id="${moving}"]`);
        const second = group?.querySelector(`[data-thread-id="${resident}"]`);
        return first && second && first.getBoundingClientRect().top < second.getBoundingClientRect().top;
      }, { selector, moving: moving.id, resident: resident.id });
      await assertFirst();
      await page.reload({ waitUntil: "domcontentloaded" });
      await sidebar(page).waitFor({ timeout: 120_000 });
      await row(group, moving.id).waitFor();
      await expandPreview();
      await assertFirst();
      assert.equal(fixture.runJson(["thread", "get", moving.id]).thread.sectionId, fixture.section.id);
    }
  } finally {
    await context?.close();
    await browser.close();
    place(fixture.section.id);
    stage(moving, "Active");
    stage(resident, "Active");
    for (const key of ["organizationMode", "chronologicalSort", "environmentGrouping"]) {
      fixture.run(["thread-stages", "prefs", "set", key, String(savedPreferences[key])]);
    }
  }
}
