import assert from "node:assert/strict";
import { FEATURED_PROJECT, FEATURED_THREAD, THREADS } from "../../screenshots/fixture.mjs";
import { launch, link, openContext, sidebar } from "./sidebar.mjs";

export async function verifySelectedTitleColor({ stack, fixture }) {
  fixture.run(["theme", "set", "plugin:chatgpt-theme:chatgpt"]);
  const thread = fixture.threads.get(FEATURED_THREAD);
  const inactiveThread = fixture.threads.get(THREADS.find((candidate) => candidate.stage === null).title);
  // Earlier suites can leave it Deferred or Completed, which mutes its title.
  fixture.run(["thread-stages", "stage", "Active", inactiveThread.id]);
  const project = fixture.projects.get(FEATURED_PROJECT);
  const browser = await launch();
  try {
    for (const theme of ["light", "dark"]) {
      const context = await openContext(browser, { viewport: { width: 1280, height: 800 }, colorScheme: theme });
      try {
        await context.addInitScript((theme) => localStorage.setItem("bb.theme", theme), theme);
        const page = await context.newPage();
        await page.goto(new URL(`/projects/${project.id}/threads/${thread.id}`, stack.serverUrl).href);
        const list = sidebar(page);
        await list.waitFor({ timeout: 120_000 });
        await page.waitForFunction(() =>
          getComputedStyle(document.documentElement).getPropertyValue("--chatgpt-panel-surface").trim() !== "");
        const active = link(list, thread.id);
        const inactive = link(list, inactiveThread.id);

        async function assertTitleColor(target, selected, title) {
          const colors = await target.evaluate(async (node, { selected, title }) => {
            const row = node.closest("[data-thread-id]");
            await Promise.all(row.getAnimations({ subtree: true })
              .filter((animation) => animation.effect.getTiming().iterations !== Infinity)
              .map((animation) => animation.finished));
            const label = [...row.querySelectorAll("span")]
              .find((span) => span.childElementCount === 0 && span.textContent === title);
            const reference = document.createElement("span");
            reference.style.color = selected
              ? "var(--sidebar-foreground)"
              : "var(--subtle-foreground)";
            row.append(reference);
            const actual = getComputedStyle(label).color;
            const canvas = document.createElement("canvas");
            canvas.width = canvas.height = 1;
            const context = canvas.getContext("2d");
            context.fillStyle = actual;
            context.fillRect(0, 0, 1, 1);
            const pixel = [...context.getImageData(0, 0, 1, 1).data];
            const expected = getComputedStyle(reference).color;
            let secondaryPixel = null;
            if (!selected) {
              reference.style.color = "var(--sidebar)";
              context.fillStyle = getComputedStyle(reference).color;
              context.fillRect(0, 0, 1, 1);
              reference.style.color = "color-mix(in srgb, var(--ink) 50%, transparent)";
              context.fillStyle = getComputedStyle(reference).color;
              context.fillRect(0, 0, 1, 1);
              secondaryPixel = [...context.getImageData(0, 0, 1, 1).data];
            }
            const colors = { actual, pixel, secondaryPixel, icon: getComputedStyle(row.querySelector("[data-ribbon-sidebar-icon-slot] svg")).color, expected };
            reference.remove();
            return colors;
          }, { selected, title });
          assert.equal(colors.icon, colors.actual, `${theme}: icon and title share their attention color`);
          assert.equal(colors.actual, colors.expected, `${theme}: ${selected ? "selected" : "unselected"} thread title color`);
          assert.equal(colors.pixel[3], 255, `${theme}: opaque title ink keeps glyph/strikethrough intersections uniform`);
          if (!selected) assert.ok(colors.pixel.every((value, index) => Math.abs(value - colors.secondaryPixel[index]) <= 1),
            `${theme}: opaque secondary ink preserves the original tone over the sidebar`);
        }

        await assertTitleColor(active, true, thread.title);
        await assertTitleColor(inactive, false, inactiveThread.title);
        await active.hover();
        await assertTitleColor(active, true, thread.title);
        await inactive.hover();
        await assertTitleColor(inactive, false, inactiveThread.title);
        for (const [stage, label] of [["BlockedOnUser", "Needs user"], ["BlockedOnOtherAgent", "Dependent"], ["BlockedOnThirdParty", "Blocked"], ["Completed", "Completed"]]) {
          fixture.run(["thread-stages", "stage", stage, thread.id]);
          await list.locator(`[data-thread-id="${thread.id}"]`).first().getByLabel(`${label} stage`, { exact: true }).waitFor();
          await assertTitleColor(active, true, thread.title);
          // The selected Completed row takes the one-row preview; return it
          // before checking a second Completed row in the same section.
          if (stage === "Completed") fixture.run(["thread-stages", "stage", "Active", thread.id]);
          fixture.run(["thread-stages", "stage", stage, inactiveThread.id]);
          await list.locator(`[data-thread-id="${inactiveThread.id}"]`).first().getByLabel(`${label} stage`, { exact: true }).waitFor();
          await assertTitleColor(inactive, stage === "BlockedOnUser", inactiveThread.title);
        }
        fixture.run(["thread-stages", "stage", "Active", inactiveThread.id]);
        fixture.run(["thread-stages", "stage", "Active", thread.id]);
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
}
