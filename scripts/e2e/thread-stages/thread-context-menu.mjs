import assert from "node:assert/strict";
import { FEATURED_THREAD } from "../../screenshots/fixture.mjs";
import { launch, link, openContext, sidebar } from "./sidebar.mjs";

export async function verifyThreadContextMenu({ stack, fixture }) {
  const thread = fixture.threads.get(FEATURED_THREAD);
  const browser = await launch();
  try {
    const context = await openContext(browser, { viewport: { width: 1280, height: 800 } });
    try {
      const page = await context.newPage();
      await page.goto(stack.serverUrl);
      const list = sidebar(page);
      await list.waitFor({ timeout: 120_000 });
      const row = link(list, thread.id);
      const menu = page.getByRole("menu", { name: "Thread actions" });
      await page.evaluate(() => {
        window.__selectedActions = [];
        document.addEventListener("pointerup", (event) => {
          const item = event.target?.closest?.('[role="menuitem"]');
          window.__pointerUpAction = item && !item.hasAttribute("aria-haspopup") && !item.hasAttribute("data-disabled")
            ? item.textContent
            : null;
        }, true);
        document.addEventListener("menu.itemSelect", (event) => {
          window.__selectedActions.push(event.target?.textContent ?? "");
        }, true);
      });
      let foundActionAtOpeningPoint = false;
      // Popper collision placement varies with viewport height and font metrics.
      for (const height of [550, 525, 575, 500, 600, 450, 400, 350]) {
        await page.setViewportSize({ width: 1280, height });
        await row.evaluate((node) => node.scrollIntoView({ block: "end" }));
        const box = await row.boundingBox();
        for (const offset of [12, 30, 60]) {
          const openingPoint = { x: box.x + offset, y: box.y + box.height / 2 };
          await page.evaluate(() => {
            window.__pointerUpAction = null;
            window.__selectedActions = [];
          });
          await page.mouse.move(openingPoint.x, openingPoint.y);
          await page.mouse.down({ button: "right" });
          await menu.waitFor();
          await page.mouse.up({ button: "right" });
          const pointerUpAction = await page.evaluate(() => window.__pointerUpAction);
          assert.deepEqual(await page.evaluate(() => window.__selectedActions), [],
            `releasing the opening right click should not select ${pointerUpAction ?? "an action"}`);
          assert.equal(await menu.isVisible(), true, "releasing the opening right click should leave the menu open");
          if (pointerUpAction) {
            foundActionAtOpeningPoint = true;
            break;
          }
          await page.keyboard.press("Escape");
          await menu.waitFor({ state: "hidden" });
        }
        if (foundActionAtOpeningPoint) break;
      }
      assert.ok(foundActionAtOpeningPoint, "the fixture should place a selectable action under a stationary right click");
      await menu.getByRole("menuitem", { name: "Rename" }).click();
      // bb renames in place: the row's title becomes a text field.
      await list.getByRole("textbox").first().waitFor();
    } finally {
      await context.close();
    }
  } finally {
    await browser.close();
  }
}
