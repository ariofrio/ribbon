import assert from "node:assert/strict";
import { FEATURED_PROJECT, FEATURED_THREAD } from "../../screenshots/fixture.mjs";
import { stageFor } from "./child-stages.mjs";
import { launch, openContext, row, sidebar } from "./sidebar.mjs";

export async function verifyMobileStageMenu({ stack, fixture, cases }) {
  const thread = fixture.threads.get(FEATURED_THREAD);
  const project = fixture.projects.get(FEATURED_PROJECT);
  const originalStage = stageFor(fixture, thread.id);
  const browser = await launch();
  try {
    for (const testCase of cases) {
      fixture.run(["thread-stages", "stage", "Active", thread.id]);
      const touch = testCase === "long-press";
      const context = await openContext(browser, {
        viewport: { width: 390, height: 844 }, hasTouch: touch, isMobile: touch,
      });
      try {
        const page = await context.newPage();
        const activate = (target) => touch ? target.tap() : target.click();
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.goto(new URL(`/projects/${project.id}/threads/${thread.id}`, stack.serverUrl).href);
        await activate(page.getByRole("button", { name: /^Toggle sidebar/ }));
        const list = sidebar(page);
        await list.waitFor({ timeout: 120_000 });
        const target = row(list, thread.id);
        const menu = page.getByRole("dialog", {
          name: testCase === "long-press" ? "Thread actions" : "Menu", exact: true,
        });
        const open = async () => {
          if (testCase === "long-press") {
            const box = await target.boundingBox();
            const input = await context.newCDPSession(page);
            await input.send("Input.dispatchTouchEvent", {
              type: "touchStart", touchPoints: [{ x: box.x + 48, y: box.y + box.height / 2 }],
            });
            await menu.waitFor();
            // Release the held touch once the drawer reaches its final position.
            await menu.evaluate(async (node) => {
              await Promise.all(node.getAnimations({ subtree: true }).map((animation) => animation.finished));
            });
            await input.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
            await input.detach();
          } else {
            await target.hover();
            await target.getByRole("button", { name: "Thread actions" }).click();
            await menu.waitFor();
          }
        };
        const move = menu.getByRole("menuitem", { name: /Move to stage/ });
        const back = menu.getByRole("menuitem", { name: "Back", exact: true });
        await open();
        assert.equal(await menu.getByRole("menuitemradio").count(), 0, "Stage choices are outside the main action page");
        const bounds = await move.boundingBox();
        assert.ok(bounds.width > 0 && bounds.height > 0, "Move to stage renders as a tappable action");
        await activate(move);
        await back.waitFor();
        assert.deepEqual(await menu.getByRole("menuitemradio").allTextContents(), [
          "Deferred", "In progress", "Waiting", "Blocked on user", "Blocked on another thread", "Blocked on external party", "Completed",
        ]);
        assert.equal(await menu.getByRole("menuitem", { name: "Rename", exact: true }).count(), 0);
        assert.equal(await menu.getByRole("menuitemradio", { name: "In progress", exact: true }).getAttribute("aria-checked"), "true");
        await activate(back);
        await move.waitFor();
        assert.equal(stageFor(fixture, thread.id), "Active", "Back keeps the stage unchanged");
        assert.equal(await menu.getByRole("menuitemradio").count(), 0);
        await activate(move);
        await back.waitFor();
        await page.keyboard.press("Escape");
        await menu.waitFor({ state: "hidden" });
        await open();
        await move.waitFor();
        assert.equal(await menu.getByRole("menuitemradio").count(), 0, "Reopening resets the drawer to its action page");
        await activate(move);
        await back.waitFor();
        await activate(menu.getByRole("menuitemradio", { name: "Waiting", exact: true }));
        await menu.waitFor({ state: "hidden" });
        await target.locator('[aria-label="Waiting stage"]').waitFor();
        assert.equal(stageFor(fixture, thread.id), "Waiting");
        await open();
        await activate(move);
        await back.waitFor();
        await activate(menu.getByRole("menuitemradio", { name: "Blocked on user", exact: true }));
        await menu.waitFor({ state: "hidden" });
        const userIcon = target.locator('[aria-label="Blocked on user stage"] svg');
        await userIcon.waitFor();
        const painted = await userIcon.evaluate((icon) => ({
          width: icon.getBoundingClientRect().width,
          height: icon.getBoundingClientRect().height,
          display: getComputedStyle(icon).display,
          opacity: getComputedStyle(icon.closest("[data-ribbon-sidebar-icon-slot]")).opacity,
        }));
        assert.deepEqual(painted, { width: 16, height: 16, display: "block", opacity: "1" });
        assert.equal(stageFor(fixture, thread.id), "BlockedOnUser");
        await open();
        await activate(move);
        await back.waitFor();
        await activate(menu.getByRole("menuitemradio", { name: "Blocked on external party", exact: true }));
        await menu.waitFor({ state: "hidden" });
        await target.locator('[aria-label="Blocked on external party stage"]').waitFor();
        assert.equal(stageFor(fixture, thread.id), "BlockedOnThirdParty");
        assert.deepEqual(errors, []);
        console.log(`Mobile stage menu (${testCase}): navigation, Back, reset, and stage selection passed`);
      } finally {
        await context.close();
      }
    }
  } finally {
    fixture.run(["thread-stages", "stage", originalStage, thread.id]);
    await browser.close();
  }
}
