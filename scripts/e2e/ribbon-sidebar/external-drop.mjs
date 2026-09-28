import assert from "node:assert/strict";
import { chromium } from "playwright";
import { FEATURED_PROJECT, FEATURED_THREAD } from "../../screenshots/fixture.mjs";

/**
 * A row dragged out of the sidebar is handed to bb's split gesture, which
 * drops it into a pane or the composer. Ribbon's own drag must end then too:
 * no overlay, no hidden source row, no grabbing cursor left behind.
 */
export async function verifyExternalDrop({ stack, fixture, cases }) {
  const browser = await chromium.launch({ args: ["--mute-audio"] });
  try {
    for (const target of cases) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      await context.addInitScript(() => {
        localStorage.setItem("bb.sidebar.threadListProvider", JSON.stringify("ribbon-sidebar/ribbon-sidebar"));
      });
      const page = await context.newPage();
      page.setDefaultTimeout(15_000);
      page.on("pageerror", (error) => console.error("Browser error:", error));
      const featured = fixture.threads.get(FEATURED_THREAD);
      const project = fixture.projects.get(FEATURED_PROJECT);
      await page.goto(new URL(`/projects/${project.id}/threads/${featured.id}`, stack.serverUrl).href);
      const sidebar = page.locator("[data-ribbon-sidebar-root][data-ribbon-sidebar-ready]");
      await sidebar.waitFor({ timeout: 120_000 });
      const source = sidebar
        .locator(`li[data-thread-id]:not([data-thread-id="${featured.id}"]) a[data-sidebar-thread-id]`)
        .first();
      const sourceId = await source.getAttribute("data-sidebar-thread-id");
      const box = await source.boundingBox();
      const destination = target === "composer"
        ? await page.locator("[data-app-composer] [data-promptbox]").first().boundingBox()
        : await page.locator("main").first().boundingBox();
      const drop = {
        x: destination.x + destination.width / 2,
        y: destination.y + destination.height / 2,
      };

      const state = () => page.evaluate((id) => {
        const row = document.querySelector(`[data-ribbon-sidebar-root] li[data-thread-id="${id}"]`);
        return {
          overlay: document.querySelector("[data-ribbon-thread-drag-overlay]") !== null,
          preview: document.querySelector("[data-ribbon-thread-drop-preview]") !== null,
          sidebarDragging: document.body.dataset.sidebarDragging ?? null,
          cursor: getComputedStyle(document.body).cursor,
          rowOpacity: row ? getComputedStyle(row).opacity : null,
        };
      }, sourceId);
      await page.mouse.move(box.x + 40, box.y + box.height / 2);
      await page.mouse.down();
      if (target === "race") {
        // A full sidebar takes hundreds of milliseconds to commit a drag it
        // started, long enough for a steady drag to cross into bb's gesture.
        // Playwright waits out that render between moves, so fire both moves
        // in one task: bb's Escape then cancels a drag dnd-kit has not recorded.
        await page.evaluate(({ start, end }) => {
          const move = (x, y) => {
            window.dispatchEvent(new PointerEvent("pointermove", { clientX: x, clientY: y, bubbles: true, pointerType: "mouse", buttons: 1 }));
            document.dispatchEvent(new MouseEvent("mousemove", { clientX: x, clientY: y, bubbles: true, buttons: 1 }));
          };
          move(start.x + 8, start.y);
          move(end.x, end.y);
        }, { start: { x: box.x + 40, y: box.y + box.height / 2 }, end: drop });
      } else {
        await page.mouse.move(box.x + 48, box.y + box.height / 2, { steps: 3 });
        await page.locator("[data-ribbon-thread-drag-overlay]").waitFor({ timeout: 5000 });
      }
      if (target !== "race") await page.mouse.move(drop.x, drop.y, { steps: 20 });
      if (target === "return" || target === "race") {
        await page.mouse.move(box.x + 40, box.y + box.height / 2, { steps: 20 });
      }
      await page.mouse.up();
      await page.mouse.move(box.x + 40, box.y + box.height + 40, { steps: 10 });
      try {
        await page.waitForFunction((id) => {
          const row = document.querySelector(`[data-ribbon-sidebar-root] li[data-thread-id="${id}"]`);
          return (
            document.querySelector("[data-ribbon-thread-drag-overlay]") === null &&
            document.body.dataset.sidebarDragging === undefined &&
            getComputedStyle(document.body).cursor !== "grabbing" &&
            row !== null && getComputedStyle(row).opacity === "1"
          );
        }, sourceId, { timeout: 5000 });
      } catch {
        assert.fail(`${target}: the sidebar drag did not end: ${JSON.stringify(await state())}`);
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }
}
