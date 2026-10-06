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
      const groups = await menu.evaluate((node) => {
        const result = [[]];
        for (const child of node.children) {
          if (child.getAttribute("role") === "separator") result.push([]);
          else if (child.getAttribute("role") === "menuitem") result.at(-1).push(child.textContent.trim());
        }
        return result;
      });
      assert.deepEqual(groups.slice(-4), [
        ["Copy thread link", "Mark unread"],
        ["Pin", "Move to section", "Set stage"],
        ["Rename", "Edit actions"],
        ["Archive", "Delete"],
      ]);
      // Keyboard navigation must not compete with the stationary opening pointer.
      await page.mouse.move(0, 0);
      const edit = menu.getByRole("menuitem", { name: "Edit actions" });
      await edit.focus();
      await page.keyboard.press("ArrowRight");
      const editor = page.getByRole("menu", { name: "Edit actions", exact: true });
      await editor.waitFor();
      const addAction = await editor.getByRole("button", { name: "Add action" }).elementHandle();
      await page.waitForFunction((node) => document.activeElement === node, addAction).catch(async (cause) => {
        throw new Error(`Keyboard entry must focus Add action; focused ${await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 500))}`, { cause });
      });
      await page.keyboard.press("Enter");
      const label = editor.getByRole("textbox", { name: "Action 1 button label" });
      await page.keyboard.press("Shift+Tab");
      await page.keyboard.press("Shift+Tab");
      assert.equal(await label.evaluate((node) => document.activeElement === node), true);
      await page.keyboard.type("Review");
      await page.keyboard.press("ArrowLeft");
      await page.keyboard.type("!");
      assert.equal(await label.inputValue(), "Revie!w", "menu navigation does not swallow text editing keys");
      await page.keyboard.press("Tab");
      await page.keyboard.type("Review this thread.");
      const failedSave = page.waitForResponse((response) => response.url().endsWith("/rpc/saveThreadActionsV1"));
      await page.route("**/rpc/saveThreadActionsV1", (route) => route.fulfill({
        status: 500,
        json: { error: { message: "Could not save thread actions" } },
      }), { times: 1 });
      await page.keyboard.press("Tab");
      await page.keyboard.press("Tab");
      await page.keyboard.press("Enter");
      await failedSave;
      await editor.getByRole("alert").waitFor();
      assert.equal(await label.inputValue(), "Revie!w", "failed saves keep the draft editable");
      await editor.getByRole("button", { name: "Remove", exact: true }).focus();
      await page.keyboard.press("Enter");
      assert.equal(await editor.getByRole("textbox").count(), 0);
      await page.keyboard.press("Escape");
      await menu.waitFor({ state: "hidden" });
      await row.click({ button: "right" });
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
