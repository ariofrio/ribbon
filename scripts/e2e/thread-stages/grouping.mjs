import assert from "node:assert/strict";
import { FEATURED_PROJECT, FEATURED_THREAD, SECTION } from "../../screenshots/fixture.mjs";
import {
  carryTo, dragChip, dropMarker, heading, launch, link, openContext, pickUp,
  project, rowOrder, section, sidebar, STAGES, withPreferenceSaved,
} from "./sidebar.mjs";

/**
 * Sections fold and stay folded, the list regroups by project, and each
 * grouping keeps an order of its own.
 */
export async function verifyGrouping({ stack, fixture }) {
  const browser = await launch();
  let releaseSave = () => {};
  try {
    const context = await openContext(browser);
    const page = await context.newPage();
    await page.goto(stack.serverUrl);
    const list = sidebar(page);
    await list.waitFor({ timeout: 120_000 });
    const group = section(page, fixture.section.id);
    const featuredId = fixture.threads.get(FEATURED_THREAD).id;
    const otherId = fixture.threads.get("Investigate webhook retries").id;
    const featured = link(group, featuredId);
    const otherProject = link(group, otherId);
    await featured.waitFor();
    await otherProject.waitFor();
    const header = heading(group);
    await header.hover();
    await withPreferenceSaved(page, "collapsedThreadSections", () =>
      header.getByRole("button", { name: `Collapse ${SECTION.name} section`, exact: true }).click());
    await featured.waitFor({ state: "hidden" });
    await page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 });
    await list.waitFor({ timeout: 120_000 });
    await header.hover();
    await header.getByRole("button", { name: `Expand ${SECTION.name} section`, exact: true }).waitFor();
    assert.equal(await featured.count(), 0, "Section collapse survives reload");
    await header.getByRole("button", { name: `Expand ${SECTION.name} section`, exact: true }).click();
    await featured.waitFor();

    async function openHeadingActions(label) {
      const target = list.getByRole("button", { name: `${label} actions`, exact: true })
        .locator('xpath=ancestor::*[@data-sidebar="group-label"][1]');
      await target.hover();
      await target.getByRole("button", { name: `${label} actions`, exact: true }).click();
    }
    async function chooseOrganization(current, next) {
      await openHeadingActions(current);
      await page.getByRole("menuitem", { name: "Organize" }).hover();
      await withPreferenceSaved(page, "organizationMode", () =>
        page.getByRole("menuitemradio", { name: next, exact: true }).click());
      await page.keyboard.press("Escape");
    }
    const webProject = fixture.projects.get(FEATURED_PROJECT);
    const apiProject = fixture.projects.get("atlas-api");
    await chooseOrganization(`${SECTION.name} section`, "By project");
    const web = project(page, webProject.id);
    const api = project(page, apiProject.id);
    const webThread = link(web, featuredId);
    const apiThread = link(api, otherId);
    await webThread.waitFor();
    await apiThread.waitFor();
    assert.equal(await group.count(), 0, "Project grouping replaces section headings");
    assert.equal(await link(web, otherId).count(), 0);
    const webHeading = heading(web);
    await webHeading.hover();
    await withPreferenceSaved(page, "collapsedProjects", () =>
      webHeading.getByRole("button", { name: `Collapse ${webProject.name} section`, exact: true }).click());
    await webThread.waitFor({ state: "hidden" });
    await page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 });
    await list.waitFor({ timeout: 120_000 });
    await apiThread.waitFor();
    await webHeading.hover();
    await webHeading.getByRole("button", { name: `Expand ${webProject.name} section`, exact: true }).waitFor();
    assert.equal(await webThread.count(), 0, "Project collapse survives reload");
    await chooseOrganization(webProject.name, "Custom");
    await featured.waitFor();
    await otherProject.waitFor();
    await chooseOrganization(`${SECTION.name} section`, "By project");
    await apiThread.waitFor();
    await webHeading.hover();
    await webHeading.getByRole("button", { name: `Expand ${webProject.name} section`, exact: true }).click();
    await webThread.waitFor();
    const second = fixture.threads.get("Replace the legacy filter drawer").id;
    fixture.run(["sidebar", "place", second, "--to", `${STAGES}/Active`]);
    const secondRow = link(web, second);
    await web.locator(`[data-thread-id="${second}"]`).getByLabel("Active stage", { exact: true }).waitFor();
    const ids = new Set([second, featuredId]);
    const order = async (scope) => (await rowOrder(scope)).filter((id) => ids.has(id));
    const initialProjectOrder = await order(web);
    await chooseOrganization(webProject.name, "Custom");
    await featured.waitFor();
    const initialSectionOrder = await order(group);
    await chooseOrganization(`${SECTION.name} section`, "By project");
    await webThread.waitFor();

    const gate = new Promise((resolve) => { releaseSave = resolve; });
    await page.route("**/rpc/updatePlacementV1", async (route) => {
      assert.equal(route.request().postDataJSON().groupingKey, "builtin:projects");
      await gate;
      await route.continue();
    }, { times: 1 });
    const movedId = initialProjectOrder.at(-1);
    await pickUp(page, link(web, movedId));
    await carryTo(page, link(web, initialProjectOrder[0]), "before");
    await dropMarker(web).waitFor();
    await page.mouse.up();
    await dragChip(page).waitFor({ state: "hidden" });
    // Other suites leave other roots above these two; only their order matters.
    await page.waitForFunction(
      ({ projectId, movedId, otherId }) => {
        const ids = [...document.querySelectorAll(`[data-ribbon-sidebar-root] [data-sidebar-project-id="${projectId}"] [data-thread-id]`)]
          .map((node) => node.dataset.threadId);
        return ids.indexOf(movedId) >= 0 && ids.indexOf(movedId) < ids.indexOf(otherId);
      },
      { projectId: webProject.id, movedId, otherId: initialProjectOrder[0] },
    );
    assert.deepEqual(await order(web), [...initialProjectOrder].reverse(), "Project drop applies optimistically");
    await chooseOrganization(webProject.name, "Custom");
    await featured.waitFor();
    assert.deepEqual(await order(group), initialSectionOrder, "Pending project order must not leak into sections");
    const saved = page.waitForResponse((response) => response.url().endsWith("/rpc/updatePlacementV1"));
    releaseSave();
    assert.equal((await (await saved).json()).result.ok, true);
    await page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 });
    await featured.waitFor({ timeout: 120_000 });
    assert.deepEqual(await order(group), initialSectionOrder, "Project save leaves section order unchanged");
    await chooseOrganization(`${SECTION.name} section`, "By project");
    await webThread.waitFor();
    await secondRow.waitFor();
    assert.deepEqual(await order(web), [...initialProjectOrder].reverse(), "Project order survives switching and reload");
    await chooseOrganization(webProject.name, "Custom");
    fixture.run(["sidebar", "place", second, "--to", `${STAGES}/Deferred`]);
    await context.close();
  } finally {
    releaseSave();
    await browser.close();
  }
}
