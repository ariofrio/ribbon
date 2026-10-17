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
            reference.style.maskImage = "linear-gradient(currentColor, currentColor)";
            reference.style.maskMode = "alpha";
            row.append(reference);
            const canvas = document.createElement("canvas");
            canvas.width = canvas.height = 1;
            const context = canvas.getContext("2d");
            const pixel = (color) => {
              context.clearRect(0, 0, 1, 1);
              context.fillStyle = color;
              context.fillRect(0, 0, 1, 1);
              return [...context.getImageData(0, 0, 1, 1).data];
            };
            const actual = getComputedStyle(label).color;
            const expected = getComputedStyle(reference).color;
            const expectedMask = getComputedStyle(reference).maskImage;
            reference.style.color = `rgb(from ${expected} r g b / 1)`;
            const titleStyle = getComputedStyle(row.querySelector(".bb-thread-title"));
            const colors = {
              completed: !!row.querySelector('[aria-label="Completed stage"]'),
              actual, expected,
              pixel: pixel(actual), solidPixel: pixel(getComputedStyle(reference).color),
              mask: titleStyle.maskImage, maskMode: titleStyle.maskMode, expectedMask,
              icon: getComputedStyle(row.querySelector("[data-ribbon-sidebar-icon-slot] svg")).color,
            };
            reference.remove();
            return colors;
          }, { selected, title });
          assert.equal(colors.icon, colors.expected, `${theme}: the icon keeps the theme's attention color`);
          if (colors.completed) {
            assert.deepEqual(colors.pixel, colors.solidPixel, `${theme}: completed text and strike paint in solid theme ink`);
            assert.equal(colors.mask, colors.expectedMask, `${theme}: apply the theme's actual alpha once to the whole title`);
            assert.equal(colors.maskMode, "alpha");
          } else {
            assert.equal(colors.actual, colors.expected, `${theme}: ${selected ? "selected" : "unselected"} thread title color`);
            assert.equal(colors.mask, "none", "Other stages need no alpha mask");
          }
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
        // Change theme tokens live, including colored ink, different alpha
        // values for selected rows, and fully transparent/opaque ink.
        try {
          for (const [secondary, primary] of [
            ["rgb(30 110 240 / .2)", "rgb(220 80 130 / .35)"],
            ["rgb(170 90 40 / .7)", "rgb(40 180 120 / .85)"],
            ["rgb(60 130 200 / 0)", "rgb(240 220 180 / 1)"],
            ["rgb(60 130 200 / 1)", "rgb(240 220 180 / 0)"],
          ]) {
            await page.evaluate(([secondary, primary]) => {
              document.documentElement.style.setProperty("--subtle-foreground", secondary);
              document.documentElement.style.setProperty("--sidebar-foreground", primary);
            }, [secondary, primary]);
            await page.mouse.move(1200, 780);
            await assertTitleColor(inactive, false, inactiveThread.title);
            const idleBackground = await inactive.evaluate((node) => getComputedStyle(node.closest("[data-thread-id]")).backgroundColor);
            await inactive.hover();
            await assertTitleColor(inactive, false, inactiveThread.title);
            assert.notEqual(await inactive.evaluate((node) => getComputedStyle(node.closest("[data-thread-id]")).backgroundColor),
              idleBackground, "Exercise a different hover background with the same theme ink");
            fixture.run(["thread-stages", "stage", "Completed", thread.id]);
            await list.locator(`[data-thread-id="${thread.id}"]`).first().getByLabel("Completed stage", { exact: true }).waitFor();
            await assertTitleColor(active, true, thread.title);
            fixture.run(["thread-stages", "stage", "Active", thread.id]);
            await list.locator(`[data-thread-id="${thread.id}"]`).first().getByLabel("In progress stage", { exact: true }).waitFor();
          }
        } finally {
          await page.evaluate(() => {
            document.documentElement.style.removeProperty("--subtle-foreground");
            document.documentElement.style.removeProperty("--sidebar-foreground");
          });
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
