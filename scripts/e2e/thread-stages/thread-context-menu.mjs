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
      await row.evaluate((node) => node.scrollIntoView({ block: "center" }));
      const box = await row.boundingBox();
      const openingPoint = { x: box.x + 30, y: box.y + box.height / 2 };
      await page.mouse.move(openingPoint.x, openingPoint.y);
      await page.mouse.down({ button: "right" });
      await menu.waitFor();
      await page.mouse.up({ button: "right" });
      assert.deepEqual(await page.evaluate(() => window.__selectedActions), [],
        "releasing a stationary opening right click should not select an action");
      assert.equal(await menu.isVisible(), true, "releasing the opening right click should leave the menu open");
      await page.keyboard.press("Escape");
      await menu.waitFor({ state: "hidden" });
      await page.mouse.move(openingPoint.x, openingPoint.y);
      await page.mouse.down({ button: "right" });
      await menu.waitFor();
      // Use an actual item so this covers the guard regardless of Popper placement.
      await menu.getByRole("menuitem", { name: "Rename", exact: true }).hover();
      await page.mouse.up({ button: "right" });
      assert.equal(await page.evaluate(() => window.__pointerUpAction), "Rename",
        "the opening right click is released over a selectable item");
      assert.deepEqual(await page.evaluate(() => window.__selectedActions), [],
        "releasing the opening right click over an item should not select it");
      assert.equal(await menu.isVisible(), true, "a right-click release over an item leaves the menu open");
      const groups = await menu.evaluate((node) => {
        const result = [[]];
        for (const child of node.children) {
          if (child.getAttribute("role") === "separator") result.push([]);
          else if (child.getAttribute("role") === "menuitem") result.at(-1).push(child.textContent.trim());
        }
        return result;
      });
      assert.deepEqual(groups.slice(-5), [
        ["Copy thread link", "Mark unread"],
        ["Pin", "Move to section", "Set stage"],
        ["Rename", "Edit thread actions"],
        ["Customize row actions"],
        ["Archive", "Delete"],
      ]);
      // Keyboard navigation must not compete with the stationary opening pointer.
      await page.mouse.move(0, 0);
      const edit = menu.getByRole("menuitem", { name: "Edit thread actions" });
      await edit.focus();
      await page.keyboard.press("ArrowRight");
      const editor = page.getByRole("menu", { name: "Edit thread actions", exact: true });
      await editor.waitFor();
      const label = editor.getByRole("textbox", { name: "Action 1 button label" });
      const prompt = editor.getByRole("textbox", { name: "Action 1 prompt" });
      const labelNode = await label.elementHandle();
      await page.waitForFunction((node) => document.activeElement === node, labelNode);
      assert.equal(await editor.getByRole("button", { name: "Add action" }).count(), 0);
      assert.equal(await editor.getByRole("button", { name: "Save actions" }).count(), 0);
      const labelBox = await label.boundingBox();
      const promptBox = await prompt.boundingBox();
      assert.ok(Math.abs(labelBox.y - promptBox.y) < 3 && promptBox.x >= labelBox.x + labelBox.width,
        "Labels and prompts share a compact table row");
      assert.equal(await label.evaluate((node) => document.activeElement === node), true);
      await page.keyboard.type("Review");
      await page.keyboard.press("ArrowLeft");
      await page.keyboard.type("!");
      assert.equal(await label.inputValue(), "Revie!w", "menu navigation does not swallow text editing keys");
      await page.keyboard.press("Tab");
      const failedSave = page.waitForResponse((response) => response.url().endsWith("/rpc/saveThreadActionsV1"));
      await page.route("**/rpc/saveThreadActionsV1", (route) => route.fulfill({
        status: 500,
        json: { error: { message: "Could not save thread actions" } },
      }), { times: 1 });
      await page.keyboard.insertText("Review this thread.");
      await failedSave;
      await editor.getByRole("alert").waitFor();
      assert.equal(await label.inputValue(), "Revie!w", "failed saves keep the draft editable");
      const retry = page.waitForResponse((response) => response.url().endsWith("/rpc/saveThreadActionsV1") && response.status() === 200);
      await page.keyboard.press("Tab");
      await retry;
      await editor.getByRole("alert").waitFor({ state: "hidden" });
      const removed = page.waitForResponse((response) => response.url().endsWith("/rpc/saveThreadActionsV1") && response.status() === 200);
      await page.keyboard.press("Enter");
      await removed;
      assert.equal(await editor.getByRole("textbox").count(), 2, "Removing an action leaves one blank row");
      await page.keyboard.press("Escape");
      await editor.waitFor({ state: "hidden" });
      assert.equal(await menu.isVisible(), true, "Escape returns from the editor to its parent menu");
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
