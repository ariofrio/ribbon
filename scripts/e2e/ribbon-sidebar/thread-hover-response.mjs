import assert from "node:assert/strict";
import { chromium } from "playwright";

export async function verifyThreadHoverResponse({ stack }) {
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
      const links = sidebar.locator('a[data-sidebar-thread-id]:not([aria-current="page"])');
      const count = Math.min(await links.count(), 5);
      assert.ok(count >= 3, "fixture needs at least three inactive thread rows");

      for (let index = 0; index < count; index += 1) {
        const link = links.nth(index);
        await link.scrollIntoViewIfNeeded();
        await page.mouse.move(1000, 400);
        const resting = await link.evaluate((node) =>
          getComputedStyle(node.parentElement).backgroundColor);
        const box = await link.boundingBox();
        await page.mouse.move(box.x + 12, box.y + box.height / 2);
        const state = await link.evaluate(async (node) => {
          const row = node.parentElement;
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          const early = getComputedStyle(row).backgroundColor;
          const hovered = row.matches(":hover");
          for (const animation of row.getAnimations()) {
            if (animation.effect.getTiming().iterations !== Infinity) animation.finish();
          }
          const settled = getComputedStyle(row).backgroundColor;
          return { early, settled, hovered };
        });
        assert.ok(state.hovered, `pointer missed thread row ${index}`);
        assert.notEqual(state.settled, resting,
          `thread row ${index} should have a visible hover background`);
        assert.equal(state.early, state.settled,
          `thread row ${index} should show its hover background within two frames: ${JSON.stringify(state)}`);
      }
    } finally {
      await context.close();
    }
  } finally {
    await browser.close();
  }
}
