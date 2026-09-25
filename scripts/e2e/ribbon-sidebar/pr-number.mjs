import assert from "node:assert/strict";
import { chromium } from "playwright";
import { FEATURED_PROJECT, FEATURED_THREAD } from "../../screenshots/fixture.mjs";

export async function verifyPrNumber({ stack, fixture }) {
  const browser = await chromium.launch({ args: ["--mute-audio"] });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await context.addInitScript(() => {
      localStorage.setItem("bb.sidebar.threadListProvider", JSON.stringify("ribbon-sidebar/ribbon-sidebar"));
    });
    const page = await context.newPage();
    const thread = fixture.threads.get(FEATURED_THREAD);
    const project = fixture.projects.get(FEATURED_PROJECT);
    // Supply GitHub's response at the host API boundary; exercise the real SDK hook.
    await page.route("**/api/v1/environments/*/pull-request*", (route) => route.fulfill({
      json: {
        outcome: "available",
        pullRequest: {
          number: 12345,
          title: "Sidebar placement fixture",
          url: "https://github.com/example/project/pull/12345",
          state: "merged",
          attention: "merged",
          baseRefName: "main",
          headRefName: "feature",
          updatedAt: "2026-09-18T00:00:00Z",
          checks: { failedCount: 0, passedCount: 1, pendingCount: 0, totalCount: 1, state: "passing" },
          mergeability: { mergeStateStatus: "CLEAN", mergeable: "MERGEABLE", state: "mergeable" },
          review: { reviewRequestCount: 0, state: "approved" },
        },
      },
    }));
    await page.goto(new URL(`/projects/${project.id}/threads/${thread.id}`, stack.serverUrl).href);
    const sidebar = page.locator("[data-ribbon-sidebar-root][data-ribbon-sidebar-ready]");
    await sidebar.waitFor({ timeout: 120_000 });
    const row = sidebar.locator("li").filter({ has: page.locator(`a[data-sidebar-thread-id="${thread.id}"]`) });
    const heading = sidebar.getByRole("region", { name: "Atlas group", exact: true }).locator('[data-sidebar="group-label"]');

    async function placement(position) {
      await page.waitForFunction(({ threadId, title, position }) => {
        const row = document.querySelector(`[data-ribbon-sidebar-root] a[data-sidebar-thread-id="${threadId}"]`)?.closest("li");
        if (!row) return false;
        const number = [...row.querySelectorAll("span")].find((node) => node.textContent === "#12345");
        if (position === "hidden") return !number;
        const label = [...row.querySelectorAll("span")].find((node) => node.textContent === title);
        if (!number || !label) return false;
        const numberBox = number.getBoundingClientRect();
        const titleBox = label.getBoundingClientRect();
        const style = getComputedStyle(number);
        return numberBox.width > 0 && numberBox.height > 0 && titleBox.width > 0 &&
          style.display !== "none" && style.visibility === "visible" && Number(style.opacity) > 0 &&
          Math.abs(numberBox.y - titleBox.y) < 1 &&
          (position === "left"
            ? numberBox.right < titleBox.left
            // A right-hand number sits at the end of the title's lane, not
            // beside a title shorter than the lane.
            : numberBox.left > titleBox.right &&
              Math.abs(numberBox.right - number.parentElement.getBoundingClientRect().right) < 1);
      }, { threadId: thread.id, title: FEATURED_THREAD, position });
    }

    async function choose(current, next, keyboard = false) {
      await heading.hover();
      await heading.getByRole("button", { name: "Atlas options" }).click();
      const submenu = page.getByRole("menuitem", { name: `PR number ${current}`, exact: true });
      if (keyboard) {
        await submenu.focus();
        await page.keyboard.press("ArrowRight");
        await page.getByRole("menuitemcheckbox", { name: next, exact: true }).focus();
        await page.keyboard.press("Enter");
      } else {
        await submenu.hover();
        await page.getByRole("menuitemcheckbox", { name: next, exact: true }).click();
      }
    }

    await placement("right");
    // A right-aligned number keeps the indicator lane free at rest, so it
    // lines up with rows that draw an indicator and does not move on hover.
    await page.mouse.move(1000, 700);
    const rightEdges = await page.evaluate((threadId) => {
      const rows = [...document.querySelectorAll("[data-ribbon-sidebar-root] a[data-sidebar-thread-id]")]
        .map((link) => link.closest("li"));
      const edge = (row) => [...row.querySelectorAll("span")]
        .find((node) => node.textContent === "#12345")?.getBoundingClientRect().right;
      const withIndicator = rows.find((row) =>
        row.querySelector("[data-sidebar-thread-trailing-indicator]") && edge(row) !== undefined);
      const featured = rows.find((row) =>
        row.querySelector(`a[data-sidebar-thread-id="${threadId}"]`));
      return {
        indicatorless: featured.querySelector("[data-sidebar-thread-trailing-indicator]") ? null : edge(featured),
        withIndicator: withIndicator && edge(withIndicator),
      };
    }, thread.id);
    assert.equal(rightEdges.indicatorless !== null && rightEdges.withIndicator !== undefined, true,
      "fixture has a right-aligned number both with and without an indicator");
    assert.equal(rightEdges.indicatorless, rightEdges.withIndicator,
      "right-aligned numbers share one edge whether or not the row has an indicator");
    await row.hover();
    const hoveredEdge = await row.evaluate((node) => [...node.querySelectorAll("span")]
      .find((span) => span.textContent === "#12345").getBoundingClientRect().right);
    assert.equal(hoveredEdge, rightEdges.indicatorless, "hovering does not move the number");
    await choose("Right", "Left");
    await placement("left");
    await page.reload();
    await sidebar.waitFor({ timeout: 120_000 });
    await placement("left");
    await choose("Left", "Hidden", true);
    await placement("hidden");
    await page.reload();
    await sidebar.waitFor({ timeout: 120_000 });
    await placement("hidden");
    const hiddenLabel = await row.getByRole("link").getAttribute("aria-label");
    assert.ok(hiddenLabel.startsWith(`Open ${FEATURED_THREAD}`));
    assert.doesNotMatch(hiddenLabel, /PR #12345/);
    await choose("Hidden", "Right");
    await placement("right");
    await page.reload();
    await sidebar.waitFor({ timeout: 120_000 });
    await placement("right");
    await context.close();
  } finally {
    await browser.close();
  }
}
