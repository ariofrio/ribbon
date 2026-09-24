import assert from "node:assert/strict";
import { chromium } from "playwright";
import { applyPluginState, FEATURED_PROJECT, FEATURED_THREAD } from "../../screenshots/fixture.mjs";

export async function verifyThreadIcons({ stack, fixture }) {
  const thread = fixture.threads.get(FEATURED_THREAD);
  // Earlier filing and placement cases can move this shared thread out of Idle.
  fixture.run(["sidebar", "place", thread.id, "--to", "plugin:thread-stages:stages/Idle"]);
  await applyPluginState({ stack, ...fixture });
  fixture.run([
    "plugin",
    "config",
    "ribbon-sidebar",
    "set",
    "showMessagePreviews",
    "false",
  ]);
  const browser = await chromium.launch({ args: ["--mute-audio"] });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await context.addInitScript(() => {
      localStorage.setItem("bb.sidebar.threadListProvider", JSON.stringify("ribbon-sidebar/ribbon-sidebar"));
    });
    const page = await context.newPage();
    const project = fixture.projects.get(FEATURED_PROJECT);
    await page.goto(new URL(`/projects/${project.id}/threads/${thread.id}`, stack.serverUrl).href);
    const sidebar = page.locator("[data-ribbon-sidebar-root][data-ribbon-sidebar-ready]");
    await sidebar.waitFor({ timeout: 120_000 });
    const row = sidebar.locator("li").filter({ has: page.locator(`a[data-sidebar-thread-id="${thread.id}"]`) });

    const alignment = await row.evaluate((rowNode, title) => {
      const icon = rowNode.querySelector("[data-ribbon-sidebar-icon-slot] > *");
      const titleNode = rowNode.querySelector(`[title="${CSS.escape(title)}"] > span`);
      if (!(icon instanceof HTMLElement) || !(titleNode instanceof HTMLElement)) {
        throw new Error("Could not find the thread icon and title");
      }
      const iconBox = icon.getBoundingClientRect();
      const titleBox = titleNode.getBoundingClientRect();
      return {
        centerDelta:
          iconBox.top + iconBox.height / 2 -
          (titleBox.top + titleBox.height / 2),
        horizontalGap: titleBox.left - iconBox.right,
      };
    }, thread.title);
    assert.ok(
      Math.abs(alignment.centerDelta) <= 0.5,
      `Without previews, the thread icon/title centers differed by ${alignment.centerDelta}px`,
    );
    assert.ok(
      Math.abs(alignment.horizontalGap - 8) <= 0.5,
      `Without previews, the thread icon/title gap was ${alignment.horizontalGap}px instead of 8px`,
    );

    async function paintedIcon(selector, mask) {
      await page.waitForFunction(({ threadId, selector, mask }) => {
        const row = document.querySelector(`[data-ribbon-sidebar-root] a[data-sidebar-thread-id="${threadId}"]`)?.closest("li");
        const icon = row?.querySelector(selector);
        if (!icon) return false;
        const style = getComputedStyle(icon);
        const bounds = icon.getBoundingClientRect();
        return style.display !== "none" && bounds.width === 16 && bounds.height === 16 &&
          (!mask || style.maskImage !== "none");
      }, { threadId: thread.id, selector, mask });
    }

    await paintedIcon('[aria-label="Idle stage"] svg', false);
    await page.reload();
    await sidebar.waitFor({ timeout: 120_000 });
    await paintedIcon('[aria-label="Idle stage"] svg', false);
    const workingThread = fixture.threads.get("Investigate webhook retries");
    const workingRow = sidebar.locator("li").filter({
      has: page.locator(`a[data-sidebar-thread-id="${workingThread.id}"]`),
    });
    const indicatorGap = await workingRow.evaluate((node) => {
      const space = node.querySelector("[data-ribbon-sidebar-icon-indicator-space]");
      const title = space.previousElementSibling;
      return space.getBoundingClientRect().left - title.getBoundingClientRect().right;
    });
    assert.ok(
      Math.abs(indicatorGap - 4) < 0.5,
      `With stage icons, the title-to-indicator gap was ${indicatorGap}px instead of 4px`,
    );
    const view = await page.evaluate(() => JSON.parse(localStorage.getItem("bb.plugin.ribbon-sidebar.preferences.v1")).view);
    assert.equal(view.iconGroupingKey, "plugin:thread-stages:stages");
    assert.equal(view.groupingKey, "builtin:sections");
    assert.equal(view.filterGroupingKey, null);

    let prState = "open";
    await page.route("**/api/v1/environments/*/pull-request", (route) => route.fulfill({
      json: {
        outcome: "available",
        pullRequest: prState === null ? null : {
          number: 123, title: "Sidebar pull request", state: prState,
          url: "https://github.com/example/project/pull/123",
          baseRefName: "main", headRefName: "feature", updatedAt: "2026-09-18T00:00:00Z",
          checks: { state: "no_checks", totalCount: 0, passedCount: 0, failedCount: 0, pendingCount: 0 },
          review: { state: "none", reviewRequestCount: 0 },
          mergeability: { state: "mergeable", mergeStateStatus: null, mergeable: null },
          attention: "none",
        },
      },
    }));
    for (const state of ["open", "draft", "merged", "closed"]) {
      prState = state;
      await page.reload();
      await sidebar.waitFor({ timeout: 120_000 });
      await row.getByText("#123", { exact: true }).waitFor();
      await page.waitForFunction(({ threadId, state }) => {
        const row = document.querySelector(`[data-ribbon-sidebar-root] a[data-sidebar-thread-id="${threadId}"]`)?.closest("li");
        const badge = row?.querySelector('[title="Sidebar pull request"]');
        const icon = badge?.querySelector("svg");
        const statusTitle = `${state[0].toUpperCase()}${state.slice(1)} Pull Request`;
        const reference = [...document.querySelectorAll(`[title="${statusTitle}"] svg`)]
          .find((svg) => !svg.closest("[data-ribbon-sidebar-root]"));
        if (!icon || !reference) return false;
        const range = document.createRange();
        range.setStartAfter(icon);
        range.setEnd(badge, badge.childNodes.length);
        const iconBounds = icon.getBoundingClientRect();
        const numberBounds = range.getBoundingClientRect();
        return iconBounds.width === 16 && iconBounds.height === 16 &&
          iconBounds.right <= numberBounds.left && numberBounds.left - iconBounds.right <= 5 &&
          Math.abs(iconBounds.y + 8 - (numberBounds.y + numberBounds.height / 2)) <= 2 &&
          getComputedStyle(icon).color === getComputedStyle(reference).color &&
          icon.innerHTML === reference.innerHTML;
      }, { threadId: thread.id, state }, { timeout: 15_000 });
    }
    prState = null;
    await page.reload();
    await sidebar.waitFor({ timeout: 120_000 });
    assert.equal(await row.getByText("#123", { exact: true }).count(), 0);
    await context.close();
  } finally {
    await browser.close();
  }
}
