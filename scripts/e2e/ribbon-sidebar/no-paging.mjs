import assert from "node:assert/strict";
import { chromium } from "playwright";
import { FEATURED_PROJECT, FEATURED_THREAD } from "../../screenshots/fixture.mjs";

export async function verifyNoPaging({ stack, fixture }) {
  const browser = await chromium.launch({ args: ["--mute-audio"] });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const project = fixture.projects.get(FEATURED_PROJECT);
    await context.addInitScript((projectId) => {
      localStorage.setItem("bb.sidebar.threadListProvider", JSON.stringify("ribbon-sidebar/ribbon-sidebar"));
      const key = "bb.plugin.ribbon-sidebar.preferences.v1";
      if (localStorage.getItem(key) === null) {
        localStorage.setItem(key, JSON.stringify({
          view: {
            scope: { kind: "group", group: { groupingKey: "builtin:projects", groupId: projectId } },
            groupingKey: "builtin:sections",
            filterGroupingKey: "builtin:projects",
            iconGroupingKey: "builtin:projects",
          },
          collapsed: [],
        }));
      }
    }, project.id);
    const page = await context.newPage();
    await page.goto(stack.serverUrl);
    const sidebar = page.locator("[data-ribbon-sidebar-root][data-ribbon-sidebar-ready]");
    const controls = page.locator("[data-ribbon-sidebar-top-controls]");
    const featured = sidebar.locator(`a[data-sidebar-thread-id="${fixture.threads.get(FEATURED_THREAD).id}"]`);
    const otherProject = sidebar.locator(`a[data-sidebar-thread-id="${fixture.threads.get("Investigate webhook retries").id}"]`);
    await sidebar.waitFor({ timeout: 120_000 });
    await featured.waitFor();
    assert.equal(await otherProject.count(), 0, "The selected project initially filters out other projects");

    async function openPages(current) {
      await controls.hover();
      await controls.getByRole("button", { name: "Sidebar display options" }).click();
      const submenu = page.getByRole("menuitem", { name: `Pages ${current}`, exact: true });
      await submenu.focus();
      await page.keyboard.press("ArrowRight");
    }

    async function assertUnpaged() {
      await featured.waitFor();
      await otherProject.waitFor();
      assert.equal(await controls.getByRole("button", { name: /Pages by|filtered/ }).count(), 0);
      const label = controls.getByText("All groups", { exact: true });
      await label.waitFor();
      assert.ok(await label.evaluate((node) => {
        const box = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        return box.width > 0 && box.height > 0 && style.visibility === "visible";
      }), "All groups remains visibly labeled when paging is disabled");
    }

    await openPages("Projects");
    await page.getByRole("menuitemcheckbox", { name: "No paging", exact: true }).click();
    await assertUnpaged();
    await page.reload();
    await sidebar.waitFor({ timeout: 120_000 });
    await assertUnpaged();
    await openPages("None");
    assert.equal(await page.getByRole("menuitemcheckbox", { name: "No paging" }).getAttribute("aria-checked"), "true");
    await page.keyboard.press("Escape");
    await page.getByRole("menuitem", { name: "Headings Sections", exact: true }).waitFor();
    await page.getByRole("menuitem", { name: "Icons Projects", exact: true }).waitFor();
    await page.keyboard.press("Escape");

    await openPages("None");
    await page.getByRole("menuitemcheckbox", { name: "Projects", exact: true }).focus();
    await page.keyboard.press("Enter");
    await controls.getByRole("button", { name: "All groups, Pages by Project", exact: true }).waitFor();
    await page.reload();
    await sidebar.waitFor({ timeout: 120_000 });
    await controls.getByRole("button", { name: "All groups, Pages by Project", exact: true }).waitFor();
    await otherProject.waitFor();
    await context.close();
  } finally {
    await browser.close();
  }
}
