import assert from "node:assert/strict";
import { AGENT, FEATURED_PROJECT, FEATURED_THREAD } from "../../screenshots/fixture.mjs";
import { launch, openContext, row, sidebar, spawnChild } from "./sidebar.mjs";

export async function verifyThreadHoverResponse({ stack, fixture }) {
  const parent = fixture.threads.get(FEATURED_THREAD);
  const project = fixture.projects.get(FEATURED_PROJECT);
  const child = spawnChild(fixture, { parent, project, title: "Hover color child", AGENT });
  const browser = await launch();
  try {
    const context = await openContext(browser, { viewport: { width: 1280, height: 800 } });
    try {
      const page = await context.newPage();
      await page.goto(stack.serverUrl);
      const list = sidebar(page);
      await list.waitFor({ timeout: 120_000 });
      const links = list.locator("[data-thread-id]:not(.bb-sidebar-selected-row) a[data-sidebar-thread-id]");
      const count = Math.min(await links.count(), 5);
      assert.ok(count >= 3, "fixture needs at least three inactive thread rows");

      for (let index = 0; index < count; index += 1) {
        const target = links.nth(index);
        await target.scrollIntoViewIfNeeded();
        await page.mouse.move(1000, 400);
        const resting = await target.evaluate((node) => getComputedStyle(node.closest("[data-thread-id]")).backgroundColor);
        const box = await target.boundingBox();
        await page.mouse.move(box.x + 12, box.y + box.height / 2);
        const state = await target.evaluate(async (node) => {
          const rowNode = node.closest("[data-thread-id]");
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          const early = getComputedStyle(rowNode).backgroundColor;
          const hovered = rowNode.matches(":hover");
          for (const animation of rowNode.getAnimations()) {
            if (animation.effect.getTiming().iterations !== Infinity) animation.finish();
          }
          const settled = getComputedStyle(rowNode).backgroundColor;
          return { early, settled, hovered };
        });
        assert.ok(state.hovered, `pointer missed thread row ${index}`);
        assert.notEqual(state.settled, resting, `thread row ${index} should have a visible hover background`);
        assert.equal(state.early, state.settled, `thread row ${index} should show its hover background within two frames: ${JSON.stringify(state)}`);
      }

      const rowWithChildren = row(list, parent.id);
      const childToggle = rowWithChildren.getByRole("button", { name: `Collapse ${FEATURED_THREAD} threads` });
      const actions = rowWithChildren.getByRole("button", { name: "Thread actions" });
      for (const colorScheme of ["light", "dark"]) {
        await page.emulateMedia({ colorScheme });
        await rowWithChildren.hover();
        await childToggle.hover();
        const toggleColor = await childToggle.evaluate((button) => {
          for (const animation of button.getAnimations()) animation.finish();
          return getComputedStyle(button).color;
        });
        await actions.hover();
        const actionsColor = await actions.evaluate((button) => {
          for (const animation of button.getAnimations()) animation.finish();
          return getComputedStyle(button).color;
        });
        assert.equal(actionsColor, toggleColor, `Hovered thread-row buttons should use the same ${colorScheme} foreground color`);
      }
    } finally {
      await context.close();
    }
  } finally {
    await browser.close();
    fixture.run(["thread", "delete", child.id, "--yes"]);
  }
}
