import assert from "node:assert/strict";
import { chromium } from "playwright";
import {
  AGENT,
  FEATURED_PROJECT,
  FEATURED_THREAD,
} from "../../screenshots/fixture.mjs";

export async function verifyThreadHoverResponse({ stack, fixture }) {
  const parent = fixture.threads.get(FEATURED_THREAD);
  const project = fixture.projects.get(FEATURED_PROJECT);
  const child = fixture.runJson([
    "thread", "spawn", "--project", project.id,
    "--machine", "screenshots", "--environment", project.root,
    "--parent-thread", parent.id, "--provider", `acp-${AGENT.id}`,
    "--model", AGENT.modelId, "--title", "Hover color child",
    "--permission-mode", "accept-edits", "--prompt", "Check hover colors.",
  ]);
  fixture.run(["thread", "wait", child.id, "--status", "idle"]);
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

      const rowWithChildren = sidebar
        .locator(`a[data-sidebar-thread-id="${parent.id}"]`)
        .locator("..");
      const childToggle = rowWithChildren.getByRole("button", {
        name: `Collapse ${FEATURED_THREAD} threads`,
      });
      const actions = rowWithChildren.getByRole("button", {
        name: "Thread actions",
      });
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
        assert.equal(actionsColor, toggleColor,
          `Hovered thread-row buttons should use the same ${colorScheme} foreground color`);
      }
    } finally {
      await context.close();
    }
  } finally {
    await browser.close();
    fixture.run(["thread", "delete", child.id, "--yes"]);
  }
}
