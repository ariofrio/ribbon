import assert from "node:assert/strict";
import { chromium } from "playwright";
import { applyPluginState, FEATURED_PROJECT, FEATURED_THREAD } from "../../screenshots/fixture.mjs";

export async function verifyThreadIcons({ stack, fixture }) {
  await applyPluginState({ stack, ...fixture });
  fixture.run([
    "plugin",
    "config",
    "ribbon-sidebar",
    "set",
    "showMessagePreviews",
    "false",
  ]);
  const browser = await chromium.launch({ args: ["--mute-audio"] });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await context.addInitScript(() => {
      localStorage.setItem("bb.sidebar.threadListProvider", JSON.stringify("ribbon-sidebar/ribbon-sidebar"));
    });
    const page = await context.newPage();
    const thread = fixture.threads.get(FEATURED_THREAD);
    const project = fixture.projects.get(FEATURED_PROJECT);
    await page.goto(new URL(`/projects/${project.id}/threads/${thread.id}`, stack.serverUrl).href);
    const sidebar = page.locator("[data-ribbon-sidebar-root][data-ribbon-sidebar-ready]");
    await sidebar.waitFor({ timeout: 120_000 });
    const row = sidebar.locator("li").filter({ has: page.locator(`a[data-sidebar-thread-id="${thread.id}"]`) });

    const controls = page.locator("[data-ribbon-sidebar-top-controls]");

    const alignment = await row.evaluate((rowNode, title) => {
      const icon = rowNode.querySelector("[data-ribbon-sidebar-icon-slot] > *");
      const titleNode = rowNode.querySelector(`[title="${CSS.escape(title)}"] > span`);
      if (!(icon instanceof HTMLElement) || !(titleNode instanceof HTMLElement)) {
        throw new Error("Could not find the thread icon and title");
      }
      const iconBox = icon.getBoundingClientRect();
      const titleBox = titleNode.getBoundingClientRect();
      return {
        centerDelta:
          iconBox.top + iconBox.height / 2 -
          (titleBox.top + titleBox.height / 2),
        horizontalGap: titleBox.left - iconBox.right,
      };
    }, thread.title);
    assert.ok(
      Math.abs(alignment.centerDelta) <= 0.5,
      `Without previews, the thread icon/title centers differed by ${alignment.centerDelta}px`,
    );
    assert.ok(
      Math.abs(alignment.horizontalGap - 8) <= 0.5,
      `Without previews, the thread icon/title gap was ${alignment.horizontalGap}px instead of 8px`,
    );

    async function chooseIcons(current, next) {
      await controls.hover();
      await controls.getByRole("button", { name: "Sidebar display options" }).click();
      await page.getByRole("menuitem", { name: `Icons ${current}`, exact: true }).hover();
      await page.getByRole("menuitemcheckbox", { name: next, exact: true }).click();
      await controls.getByRole("button", { name: "Sidebar display options" }).waitFor();
    }

    async function paintedIcon(selector, mask) {
      await page.waitForFunction(({ threadId, selector, mask }) => {
        const row = document.querySelector(`[data-ribbon-sidebar-root] a[data-sidebar-thread-id="${threadId}"]`)?.closest("li");
        const icon = row?.querySelector(selector);
        if (!icon) return false;
        const style = getComputedStyle(icon);
        const bounds = icon.getBoundingClientRect();
        return style.display !== "none" && bounds.width === 16 && bounds.height === 16 &&
          (!mask || style.maskImage !== "none");
      }, { threadId: thread.id, selector, mask });
    }

    await chooseIcons("Projects", "Stages");
    await paintedIcon('[aria-label="Idle group icon"] svg', false);
    await page.reload();
    await sidebar.waitFor({ timeout: 120_000 });
    await paintedIcon('[aria-label="Idle group icon"] svg', false);
    await chooseIcons("Stages", "Sections");
    await paintedIcon(`[data-ribbon-icons-section="${fixture.section.id}"]`, true);
    await chooseIcons("Sections", "No icons");
    assert.equal(await row.locator("[data-ribbon-sidebar-icon], [aria-label$='group icon']").count(), 0);
    await chooseIcons("None", "Projects");
    await paintedIcon(`[data-ribbon-icons-project="${project.id}"]`, true);
    const view = await page.evaluate(() => JSON.parse(localStorage.getItem("bb.plugin.ribbon-sidebar.preferences.v1")).view);
    assert.equal(view.iconGroupingKey, "builtin:projects");
    assert.equal(view.groupingKey, "plugin:thread-stages:stages");
    assert.equal(view.filterGroupingKey, "builtin:sections");
    await context.close();
  } finally {
    await browser.close();
  }
}
