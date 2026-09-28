import assert from "node:assert/strict";
import { chromium } from "playwright";
import { FEATURED_THREAD } from "../../screenshots/fixture.mjs";

export async function verifyThreadContextMenu({ stack, fixture }) {
  const thread = fixture.threads.get(FEATURED_THREAD);
  const browser = await chromium.launch({ args: ["--mute-audio"] });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    try {
      await context.addInitScript(() => {
        localStorage.setItem("bb.sidebar.threadListProvider", JSON.stringify("ribbon-sidebar/ribbon-sidebar"));
        localStorage.setItem("bb.plugin.ribbon-sidebar.preferences.v1", JSON.stringify({
          view: { scope: { kind: "all" }, groupingKey: null, filterGroupingKey: null },
          collapsed: [],
        }));
      });
      const page = await context.newPage();
      await page.goto(stack.serverUrl);
      const sidebar = page.locator("[data-ribbon-sidebar-root][data-ribbon-sidebar-ready]");
      await sidebar.waitFor({ timeout: 120_000 });
      const row = sidebar.locator(`a[data-sidebar-thread-id="${thread.id}"]`);
      const menu = page.getByRole("menu", { name: "Thread actions" });
      let reproducedAtBottom = false;
      for (const height of [450, 400, 350, 500, 550]) {
        await page.setViewportSize({ width: 1280, height });
        await row.evaluate((node) => node.scrollIntoView({ block: "end" }));
        const box = await row.boundingBox();
        const openingPoint = { x: box.x + 12, y: box.y + box.height / 2 };
        await page.mouse.move(openingPoint.x, openingPoint.y);
        await page.mouse.down({ button: "right" });
        await menu.waitFor();
        const itemAtOpeningPoint = await page.evaluate(({ x, y }) =>
          document.elementFromPoint(x, y)?.closest('[role="menuitem"]')?.textContent ?? null,
        openingPoint);
        await page.mouse.up({ button: "right" });
        assert.equal(await menu.isVisible(), true,
          "a stationary right click near the bottom should leave the menu open");
        if (itemAtOpeningPoint) {
          reproducedAtBottom = true;
          break;
        }
        await page.keyboard.press("Escape");
        await menu.waitFor({ state: "hidden" });
      }
      assert.ok(reproducedAtBottom,
        "the fixture should place a menu item at the stationary right-click point");
      const rename = menu.getByRole("menuitem", { name: "Rename" });
      await rename.click();
      await page.getByRole("dialog").waitFor();
    } finally {
      await context.close();
    }
  } finally {
    await browser.close();
  }
}
