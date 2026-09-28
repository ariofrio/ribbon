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
      await row.scrollIntoViewIfNeeded();
      const box = await row.boundingBox();
      await page.mouse.move(box.x + 12, box.y + box.height / 2);
      await page.mouse.down({ button: "right" });
      const menu = page.getByRole("menu", { name: "Thread actions" });
      await menu.waitFor();
      const rename = menu.getByRole("menuitem", { name: "Rename" });
      const itemBox = await rename.boundingBox();
      await page.mouse.move(itemBox.x + itemBox.width / 2, itemBox.y + itemBox.height / 2);
      await page.mouse.up({ button: "right" });

      assert.equal(await menu.isVisible(), true,
        "releasing the opening right click over an item should leave the menu open");
      await rename.click();
      await page.getByRole("dialog").waitFor();
    } finally {
      await context.close();
    }
  } finally {
    await browser.close();
  }
}
