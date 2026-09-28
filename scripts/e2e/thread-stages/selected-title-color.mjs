import assert from "node:assert/strict";
import { FEATURED_PROJECT, FEATURED_THREAD, THREADS } from "../../screenshots/fixture.mjs";
import { launch, link, openContext, sidebar, STAGES } from "./sidebar.mjs";

export async function verifySelectedTitleColor({ stack, fixture }) {
  fixture.run(["theme", "set", "plugin:chatgpt-theme:chatgpt"]);
  const thread = fixture.threads.get(FEATURED_THREAD);
  const inactiveThread = fixture.threads.get(THREADS.find((candidate) => candidate.stage === null).title);
  // Earlier suites can leave it Deferred or Completed, which mutes its title.
  fixture.run(["sidebar", "place", inactiveThread.id, "--to", `${STAGES}/Active`]);
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
              : "color-mix(in srgb, var(--sidebar-foreground) 85%, transparent)";
            row.append(reference);
            const colors = { actual: getComputedStyle(label).color, expected: getComputedStyle(reference).color };
            reference.remove();
            return colors;
          }, { selected, title });
          assert.equal(colors.actual, colors.expected, `${theme}: ${selected ? "selected" : "unselected"} thread title color`);
        }

        await assertTitleColor(active, true, thread.title);
        await assertTitleColor(inactive, false, inactiveThread.title);
        await active.hover();
        await assertTitleColor(active, true, thread.title);
        await inactive.hover();
        await assertTitleColor(inactive, false, inactiveThread.title);
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
}
