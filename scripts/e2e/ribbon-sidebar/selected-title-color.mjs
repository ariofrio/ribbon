import assert from "node:assert/strict";
import { chromium } from "playwright";
import { FEATURED_PROJECT, FEATURED_THREAD } from "../../screenshots/fixture.mjs";

export async function verifySelectedTitleColor({ stack, fixture }) {
  fixture.run(["theme", "set", "plugin:chatgpt-theme:chatgpt"]);
  const thread = fixture.threads.get(FEATURED_THREAD);
  const project = fixture.projects.get(FEATURED_PROJECT);
  const browser = await chromium.launch({ args: ["--mute-audio"] });
  try {
    for (const theme of ["light", "dark"]) {
      const context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        colorScheme: theme,
      });
      try {
        await context.addInitScript((theme) => {
          localStorage.setItem("bb.theme", theme);
          localStorage.setItem("bb.sidebar.threadListProvider", JSON.stringify("ribbon-sidebar/ribbon-sidebar"));
        }, theme);
        const page = await context.newPage();
        await page.goto(new URL(`/projects/${project.id}/threads/${thread.id}`, stack.serverUrl).href);
        const sidebar = page.locator("[data-ribbon-sidebar-root][data-ribbon-sidebar-ready]");
        await sidebar.waitFor({ timeout: 120_000 });
        await page.waitForFunction(() =>
          getComputedStyle(document.documentElement).getPropertyValue("--chatgpt-panel-surface").trim() !== "",
        );
        const active = sidebar.locator(`a[data-sidebar-thread-id="${thread.id}"]`);
        const inactive = sidebar.locator('a[data-sidebar-thread-id]:not([aria-current="page"])').first();

        async function assertTitleColor(link, selected) {
          const colors = await link.evaluate(async (link, selected) => {
            const row = link.parentElement;
            await Promise.all(row.getAnimations({ subtree: true })
              .filter((animation) => animation.effect.getTiming().iterations !== Infinity)
              .map((animation) => animation.finished));
            const title = row.querySelector("[title] > span");
            const reference = document.createElement("span");
            reference.style.color = selected
              ? "var(--sidebar-foreground)"
              : "color-mix(in srgb, var(--sidebar-foreground) 85%, transparent)";
            row.append(reference);
            const colors = {
              actual: getComputedStyle(title).color,
              expected: getComputedStyle(reference).color,
            };
            reference.remove();
            return colors;
          }, selected);
          assert.equal(colors.actual, colors.expected, `${theme}: ${selected ? "selected" : "unselected"} thread title color`);
        }

        await assertTitleColor(active, true);
        await assertTitleColor(inactive, false);
        await active.hover();
        await assertTitleColor(active, true);
        await inactive.hover();
        await assertTitleColor(inactive, false);
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
}
