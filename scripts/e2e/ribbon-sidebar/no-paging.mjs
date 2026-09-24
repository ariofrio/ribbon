import assert from "node:assert/strict";
import { chromium } from "playwright";
import { FEATURED_PROJECT, FEATURED_THREAD, SECTION } from "../../screenshots/fixture.mjs";

export async function verifyNoPaging({ stack, fixture }) {
  const browser = await chromium.launch({ args: ["--mute-audio"] });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await context.addInitScript(projectId => {
      localStorage.setItem("bb.sidebar.threadListProvider", JSON.stringify("ribbon-sidebar/ribbon-sidebar"));
      localStorage.setItem("bb.plugin.ribbon-sidebar.preferences.v1", JSON.stringify({
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
    await context.close();
  } finally { await browser.close(); }
}
