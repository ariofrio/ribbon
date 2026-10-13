import assert from "node:assert/strict";
import { FEATURED_THREAD } from "../../screenshots/fixture.mjs";
import { launch, link, openContext, sidebar } from "./sidebar.mjs";

export async function verifyThreadMenuDismissal({ stack, fixture }) {
  const browser = await launch();
  try {
    const context = await openContext(browser);
    try {
      const page = await context.newPage();
      await page.goto(stack.serverUrl);
      const list = sidebar(page);
      await list.waitFor({ timeout: 120_000 });
      const row = link(list, fixture.threads.get(FEATURED_THREAD).id);
      const composer = page.locator('[data-app-composer-role="primary"] [contenteditable="true"]');
      await composer.waitFor();
      const menu = page.getByRole("menu", { name: "Thread actions" });
      await row.scrollIntoViewIfNeeded();
      const box = await row.boundingBox();
      await page.mouse.click(box.x + 30, box.y + box.height / 2, { button: "right" });
      await menu.waitFor();
      assert.equal(await composer.evaluate((node) => getComputedStyle(node).pointerEvents), "auto");
      await composer.click();
      await menu.waitFor({ state: "hidden" });
      assert.equal(await composer.evaluate((node) => document.activeElement === node), true);
      await page.keyboard.type("x");
      assert.equal(await composer.textContent(), "x");
      await page.keyboard.press("ControlOrMeta+a");
      await page.keyboard.press("Backspace");
      await row.focus();
      await page.mouse.click(box.x + 30, box.y + box.height / 2, { button: "right" });
      await menu.waitFor();
      await page.mouse.move(0, 0);
      await menu.getByRole("menuitem", { name: "Stage icon Move to stage", exact: true }).focus();
      await page.keyboard.press("ArrowRight");
      await page.getByRole("menuitemradio", { name: "Completed", exact: true }).waitFor();
      await page.keyboard.press("Escape");
      await page.keyboard.press("Escape");
      await menu.waitFor({ state: "hidden" });
      assert.equal(await row.evaluate((node) => document.activeElement === node), true);
    } finally {
      await context.close();
    }
  } finally {
    await browser.close();
  }
}
