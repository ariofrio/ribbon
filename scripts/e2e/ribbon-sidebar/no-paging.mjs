import assert from "node:assert/strict";
import { chromium } from "playwright";
import { FEATURED_PROJECT, FEATURED_THREAD, SECTION } from "../../screenshots/fixture.mjs";

export async function verifyNoPaging({ stack, fixture }) {
  const browser = await chromium.launch({ args: ["--mute-audio"] });
  let releaseSave = () => {};
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await context.addInitScript(projectId => {
      localStorage.setItem("bb.sidebar.threadListProvider", JSON.stringify("ribbon-sidebar/ribbon-sidebar"));
      if (!localStorage.getItem("bb.plugin.ribbon-sidebar.preferences.v1")) localStorage.setItem("bb.plugin.ribbon-sidebar.preferences.v1", JSON.stringify({
        view: { scope: { kind: "group", group: { groupingKey: "builtin:projects", groupId: projectId } }, groupingKey: "plugin:thread-stages:stages" }, collapsed: [],
      }));
    }, fixture.projects.get(FEATURED_PROJECT).id);
    const page = await context.newPage();
    await page.goto(stack.serverUrl);
    const sidebar = page.locator("[data-ribbon-sidebar-root][data-ribbon-sidebar-ready]");
    await sidebar.waitFor({ timeout: 120_000 });
    const group = sidebar.getByRole("region", { name: `${SECTION.name} group`, exact: true });
    const featured = group.locator(`a[data-sidebar-thread-id="${fixture.threads.get(FEATURED_THREAD).id}"]`);
    const otherProject = group.locator(`a[data-sidebar-thread-id="${fixture.threads.get("Investigate webhook retries").id}"]`);
    await featured.waitFor();
    await otherProject.waitFor();
    assert.equal(await sidebar.getByRole("region", { name: /^(Idle|Active|Blocked|Deferred|Completed) group$/ }).count(), 0);
    const heading = group.locator('[data-sidebar="group-label"]');
    await heading.getByText(SECTION.name, { exact: true }).click();
    assert.ok(await featured.isVisible(), "Clicking the section name preserves bb's non-collapsing behavior");
    await heading.hover();
    await heading.getByRole("button", { name: `Collapse ${SECTION.name} section`, exact: true }).click();
    await featured.waitFor({ state: "hidden" });
    await heading.getByRole("button", { name: `Expand ${SECTION.name} section`, exact: true }).click();
    await featured.waitFor();
    const control = page.locator("[data-ribbon-sidebar-top-controls]");
    const navigation = page.getByRole("navigation", { name: "Sidebar navigation", exact: true });
    const [navigationBox, controlsBox, headingBox] = await Promise.all([
      navigation.boundingBox(), control.boundingBox(), heading.boundingBox(),
    ]);
    assert.ok(navigationBox && controlsBox && headingBox);
    assert.ok(controlsBox.y >= navigationBox.y + navigationBox.height,
      "Section controls belong below navigation");
    assert.ok(controlsBox.y + controlsBox.height <= headingBox.y,
      "Section controls precede the section list");
    await control.getByRole("button", { name: "New section", exact: true }).click();
    await page.getByRole("dialog", { name: "New section", exact: true }).waitFor();
    await page.keyboard.press("Escape");
    await control.hover();
    await control.getByRole("button", { name: "Sidebar display options" }).click();
    assert.equal(await page.getByRole("menuitem", { name: /^(Pages|Headings|Icons|Sort) / }).count(), 0);
    await page.keyboard.press("Escape");
    await page.reload();
    await sidebar.waitFor({ timeout: 120_000 });
    await featured.waitFor();
    await otherProject.waitFor();
    async function chooseGrouping(current, next) {
      await control.hover();
      await control.getByRole("button", { name: "Sidebar display options" }).click();
      await page.getByRole("menuitem", { name: `Group by ${current}`, exact: true }).hover();
      await page.getByRole("menuitemcheckbox", { name: next, exact: true }).click();
      await page.keyboard.press("Escape");
    }
    await chooseGrouping("Section", "Project");
    const web = sidebar.getByRole("region", { name: "atlas-web group", exact: true });
    const api = sidebar.getByRole("region", { name: "atlas-api group", exact: true });
    const webThread = web.locator(`a[data-sidebar-thread-id="${fixture.threads.get(FEATURED_THREAD).id}"]`);
    const apiThread = api.locator(`a[data-sidebar-thread-id="${fixture.threads.get("Investigate webhook retries").id}"]`);
    await webThread.waitFor();
    await apiThread.waitFor();
    assert.equal(await group.count(), 0, "Project grouping replaces section headings");
    assert.equal(await web.locator(`a[data-sidebar-thread-id="${fixture.threads.get("Investigate webhook retries").id}"]`).count(), 0);
    const webHeading = web.locator('[data-sidebar="group-label"]');
    await webHeading.hover();
    await webHeading.getByRole("button", { name: "Collapse atlas-web project", exact: true }).click();
    await webThread.waitFor({ state: "hidden" });
    await page.reload();
    await sidebar.waitFor({ timeout: 120_000 });
    await apiThread.waitFor();
    await webHeading.hover();
    await webHeading.getByRole("button", { name: "Expand atlas-web project", exact: true }).waitFor();
    assert.equal(await webThread.count(), 0, "Project collapse survives reload");
    await chooseGrouping("Project", "Section");
    await featured.waitFor();
    await otherProject.waitFor();
    await chooseGrouping("Section", "Project");
    await apiThread.waitFor();
    await webHeading.hover();
    await webHeading.getByRole("button", { name: "Expand atlas-web project", exact: true }).click();
    await webThread.waitFor();
    const second = fixture.threads.get("Replace the legacy filter drawer").id;
    fixture.run(["sidebar", "place", second, "--to", "plugin:thread-stages:stages/Idle"]);
    const secondRow = web.locator(`a[data-sidebar-thread-id="${second}"]`);
    await web.locator(`li[data-thread-id="${second}"]`).getByLabel("Idle stage", { exact: true }).waitFor();
    const ids = new Set([second, fixture.threads.get(FEATURED_THREAD).id]);
    const order = async (region) => (await region.locator("li[data-thread-id]")
      .evaluateAll(nodes => nodes.map(node => node.dataset.threadId))).filter(id => ids.has(id));
    const initialProjectOrder = await order(web);
    await chooseGrouping("Project", "Section");
    await featured.waitFor();
    const initialSectionOrder = await order(group);
    await chooseGrouping("Section", "Project");
    await webThread.waitFor();

    const gate = new Promise(resolve => { releaseSave = resolve; });
    await page.route("**/rpc/updatePlacementV1", async route => {
      assert.equal(route.request().postDataJSON().groupingKey, "builtin:projects");
      await gate;
      await route.continue();
    }, { times: 1 });
    const movedId = initialProjectOrder.at(-1);
    const moved = web.locator(`a[data-sidebar-thread-id="${movedId}"]`);
    const sourceBox = await moved.boundingBox();
    await page.mouse.move(sourceBox.x + 80, sourceBox.y + sourceBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(sourceBox.x + 90, sourceBox.y + sourceBox.height / 2);
    await page.locator("[data-ribbon-thread-drag-overlay]").waitFor();
    const targetBox = await webHeading.boundingBox();
    await page.mouse.move(targetBox.x + 80, targetBox.y + targetBox.height / 2);
    await web.locator("[data-ribbon-thread-drop-preview]").waitFor();
    await page.mouse.up();
    await page.locator("[data-ribbon-thread-drag-overlay]").waitFor({ state: "hidden" });
    assert.deepEqual(await order(web), [...initialProjectOrder].reverse(), "Project drop applies optimistically");
    await chooseGrouping("Project", "Section");
    await featured.waitFor();
    assert.deepEqual(await order(group), initialSectionOrder, "Pending project order must not leak into sections");
    const saved = page.waitForResponse(response => response.url().endsWith("/rpc/updatePlacementV1"));
    releaseSave();
    assert.equal((await (await saved).json()).result.ok, true);
    await page.reload();
    await featured.waitFor({ timeout: 120_000 });
    assert.deepEqual(await order(group), initialSectionOrder, "Project save leaves section order unchanged");
    await chooseGrouping("Section", "Project");
    await webThread.waitFor();
    await secondRow.waitFor();
    assert.deepEqual(await order(web), [...initialProjectOrder].reverse(), "Project order survives switching and reload");
    fixture.run(["sidebar", "place", second, "--to", "plugin:thread-stages:stages/Deferred"]);
    await context.close();
  } finally { releaseSave(); await browser.close(); }
}
