import assert from "node:assert/strict";
import { chromium } from "playwright";
import { AGENT, FEATURED_PROJECT } from "../../screenshots/fixture.mjs";

const INDICATOR_THREAD = "Investigate webhook retries";
const ICONS_PLUGIN_ID = "icons";

export async function verifyOptionalIconLayout({ stack, fixture }) {
  const iconsEnabled = fixture
    .runJson(["plugin", "list"])
    .plugins.some(
      (plugin) => plugin.id === ICONS_PLUGIN_ID && plugin.enabled === true,
    );
  if (iconsEnabled) fixture.run(["plugin", "disable", ICONS_PLUGIN_ID]);

  // Other suites mutate the shared featured thread, so own the idle row's state.
  const project = fixture.projects.get(FEATURED_PROJECT);
  const idleThread = fixture.runJson([
    "thread", "spawn",
    "--project", project.id,
    "--machine", "screenshots",
    "--environment", project.root,
    "--provider", `acp-${AGENT.id}`,
    "--model", AGENT.modelId,
    "--permission-mode", "accept-edits",
    "--title", "Verify long sidebar titles shorten only while hover actions are visible",
    "--prompt", "Confirm the sidebar hover layout fixture is ready.",
  ]);
  let childThread;
  const browser = await chromium.launch({ args: ["--mute-audio"] });
  try {
    fixture.run(["thread", "wait", idleThread.id, "--status", "idle"]);
    fixture.run(["thread", "update", idleThread.id, "--section", fixture.section.id]);
    fixture.run(["thread", "read", idleThread.id]);
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 2,
      reducedMotion: "reduce",
    });
    try {
      await context.addInitScript(() => {
        window.localStorage.setItem(
          "bb.plugin.ribbon-sidebar.preferences.v1",
          JSON.stringify({
            view: {
              scope: { kind: "all" },
              groupingKey: "builtin:sections",
            },
            collapsed: [],
          }),
        );
        window.localStorage.setItem(
          "bb.sidebar.threadListProvider",
          JSON.stringify("ribbon-sidebar/ribbon-sidebar"),
        );
      });

      const page = await context.newPage();
      await page.goto(stack.serverUrl, { waitUntil: "domcontentloaded" });
      await page
        .locator("[data-ribbon-sidebar-root][data-ribbon-sidebar-ready]")
        .waitFor({ timeout: 120_000 });

      const sidebar = page.locator("[data-ribbon-sidebar-root]");
      const topControls = page.locator("[data-ribbon-sidebar-top-controls]");
      for (const name of ["Sidebar display options", "Atlas options", "Collapse Atlas section"]) {
        const button = (name === "Sidebar display options" ? topControls : sidebar)
          .getByRole("button", { name, exact: true });
        await (name === "Sidebar display options"
          ? topControls
          : button.locator('xpath=ancestor::*[@data-sidebar-sticky-tier="label"][1]')).hover();
        await button.hover();
        const box = await button.boundingBox();
        assert.equal(box.width, 20, `${name} should be 20px wide`);
        assert.equal(box.height, 20, `${name} should be 20px tall`);
        if (name === "Collapse Atlas section") {
          const spacing = await button.evaluate((node) => ({
            left: node.getBoundingClientRect().left - node.previousElementSibling.getBoundingClientRect().right,
            right: parseFloat(getComputedStyle(node).marginRight),
          }));
          assert.equal(spacing.left, 8, "The grouping toggle should have 8px to its left");
          assert.equal(spacing.right, 8, "The grouping toggle should have 8px to its right");
        }
        await button.evaluate(async (node) => {
          await Promise.all(node.getAnimations().map((animation) => animation.finished));
          const background = getComputedStyle(node).backgroundColor;
          if (background === "rgba(0, 0, 0, 0)" || background === "transparent") {
            throw new Error(`${node.ariaLabel} has no hover background`);
          }
        });
      }
      await page.mouse.move(1200, 750);

      assert.equal(
        await page.locator("html").getAttribute("data-ribbon-icons-ready"),
        null,
        "The optional-icon E2E unexpectedly loaded the Icons plugin",
      );

      const title = page.getByText(INDICATOR_THREAD, { exact: true });
      const row = title.locator("xpath=ancestor::*[@data-thread-id][1]");
      const indicator = row.locator("[data-sidebar-thread-trailing-indicator]");
      await indicator.waitFor({ timeout: 120_000 });

      const geometry = await row.evaluate(
        (rowNode) => {
          const indicatorNode = rowNode.querySelector(
            "[data-sidebar-thread-trailing-indicator]",
          );
          const indicatorLane = indicatorNode?.parentElement?.parentElement;
          assertElement(indicatorLane, "indicator lane");
          const indicatorSpace = rowNode.querySelector(
            "[data-ribbon-sidebar-icon-indicator-space]",
          );
          assertElement(indicatorSpace, "indicator space");
          const titleLane = indicatorSpace.previousElementSibling;
          assertElement(titleLane, "title lane");
          const layout = indicatorSpace.parentElement;
          assertElement(layout, "icon layout");
          const titleBox = titleLane.getBoundingClientRect();
          const indicatorBox = indicatorLane.getBoundingClientRect();
          const layoutStyle = getComputedStyle(layout);
          return {
            titleRight: titleBox.right,
            indicatorLeft: indicatorBox.left,
            gridTemplateColumns: layoutStyle.gridTemplateColumns,
            columnGap: layoutStyle.columnGap,
            indicatorSpaceMarginLeft:
              getComputedStyle(indicatorSpace).marginLeft,
          };

          function assertElement(value, label) {
            if (!(value instanceof HTMLElement)) {
              throw new Error(`Could not find the ${label}`);
            }
          }
        },
      );

      const gap = geometry.indicatorLeft - geometry.titleRight;
      assert.ok(
        Math.abs(gap - 4) < 0.5,
        `Without Icons, the title-to-indicator gap was ${gap}px instead of 4px (${JSON.stringify(geometry)})`,
      );

      fixture.run(["plugin", "config", "ribbon-sidebar", "set", "threadAdornmentAlignment", "Entire item"]);
      await page.waitForFunction((threadId) => {
        const row = document.querySelector(`[data-ribbon-sidebar-root] li[data-thread-id="${threadId}"]`);
        const lane = row?.querySelector("[data-sidebar-thread-trailing-indicator]")?.parentElement?.parentElement;
        return lane && getComputedStyle(lane).position === "relative";
      }, await row.getAttribute("data-thread-id"));
      const entireItemGap = await row.evaluate((node) => {
        const lane = node.querySelector("[data-sidebar-thread-trailing-indicator]").parentElement.parentElement;
        return lane.getBoundingClientRect().left - lane.previousElementSibling.getBoundingClientRect().right;
      });
      assert.equal(entireItemGap, 4, "Entire-item alignment should also leave a 4px gap");
      fixture.run(["plugin", "config", "ribbon-sidebar", "set", "threadAdornmentAlignment", "Title row"]);

      const idleRow = page.locator("[data-ribbon-sidebar-root] li").filter({
        has: page.locator(`a[data-sidebar-thread-id="${idleThread.id}"]`),
      });
      assert.equal(
        await idleRow.locator("[data-sidebar-thread-trailing-indicator]").count(),
        0,
        "The fresh, read thread should have no trailing indicator",
      );
      async function assertRestingInset() {
        const inset = await idleRow.evaluate((node) => {
          const title = node.querySelector("[title] > span").parentElement;
          return node.getBoundingClientRect().right - title.getBoundingClientRect().right;
        });
        assert.ok(Math.abs(inset - 8) < 0.5, `At rest, the title inset was ${inset}px instead of 8px`);
      }
      await assertRestingInset();
      async function assertActionGap() {
        const gap = await idleRow.evaluate((node) => {
          const title = node.querySelector("[title] > span").parentElement;
          const lane = node.querySelector('button[aria-label="Thread actions"]').parentElement;
          return lane.getBoundingClientRect().left - title.getBoundingClientRect().right;
        });
        assert.ok(Math.abs(gap - 4) < 0.5, `The visible actions gap was ${gap}px instead of 4px`);
      }
      await idleRow.hover();
      await assertActionGap();
      const actions = idleRow.getByRole("button", { name: "Thread actions", exact: true });
      await actions.hover();
      await page.waitForFunction((threadId) => {
        const row = document.querySelector(`[data-ribbon-sidebar-root] a[data-sidebar-thread-id="${threadId}"]`)?.closest("li");
        const button = row?.querySelector('button[aria-label="Thread actions"]');
        if (!button) return false;
        const background = getComputedStyle(button).backgroundColor;
        return background !== "rgba(0, 0, 0, 0)" && background !== "transparent";
      }, idleThread.id);
      const buttonBox = await actions.boundingBox();
      assert.equal(buttonBox.width, 20, "Thread actions should be 20px wide");
      assert.equal(buttonBox.height, 20, "Thread actions should be 20px tall");
      const laneBox = await actions.locator("..").boundingBox();
      assert.equal(buttonBox.x - laneBox.x, 4, "The lane should have 4px of inner padding");
      assert.equal(laneBox.x + laneBox.width - buttonBox.x - buttonBox.width, 4);
      await actions.click();
      await page.getByRole("menu").waitFor();
      await page.mouse.move(1200, 750);
      await assertActionGap();
      await page.keyboard.press("Escape");
      await page.waitForFunction((threadId) => {
        const row = document.querySelector(`[data-ribbon-sidebar-root] a[data-sidebar-thread-id="${threadId}"]`)?.closest("li");
        return document.activeElement === row?.querySelector('button[aria-label="Thread actions"]');
      }, idleThread.id);
      await page.keyboard.press("Shift+Tab");
      await assertActionGap();
      await page.mouse.click(1200, 750);
      await assertRestingInset();

      childThread = fixture.runJson([
        "thread", "spawn",
        "--project", project.id,
        "--machine", "screenshots",
        "--environment", project.root,
        "--parent-thread", idleThread.id,
        "--provider", `acp-${AGENT.id}`,
        "--model", AGENT.modelId,
        "--permission-mode", "accept-edits",
        "--title", "Verify child toggle spacing",
        "--prompt", "Confirm the child toggle fixture is ready.",
      ]);
      fixture.run(["thread", "wait", childThread.id, "--status", "idle"]);
      fixture.run(["thread", "read", childThread.id]);
      const toggle = idleRow.getByRole("button", { name: /^Collapse .* threads$/ });
      await toggle.waitFor({ state: "attached", timeout: 120_000 });
      await assertRestingInset();
      await idleRow.hover();
      await toggle.hover();
      const toggleBox = await toggle.boundingBox();
      assert.equal(toggleBox.width, 20);
      assert.equal(toggleBox.height, 20);
      const toggleGap = await toggle.evaluate((node) =>
        node.getBoundingClientRect().left - node.previousElementSibling.getBoundingClientRect().right,
      );
      assert.equal(toggleGap, 8, "The visible child toggle should have 8px to its left");
      const actionBox = await actions.boundingBox();
      assert.equal(actionBox.x - toggleBox.x - toggleBox.width, 4,
        "The visible child toggle should have 4px before the ellipsis button");
      await toggle.click();
      const expand = idleRow.getByRole("button", { name: /^Expand .* threads$/ });
      await expand.waitFor();
      await page.mouse.click(1200, 750);
      const collapsedRest = await expand.boundingBox();
      assert.equal(collapsedRest.width, 20, "Collapsed parents should keep their expand button visible at rest");
      assert.equal(await expand.evaluate((node) => getComputedStyle(node).opacity), "1");
      const restingTitleWidth = await idleRow.locator("[title] > span").first().locator("..").evaluate(
        (node) => node.getBoundingClientRect().width,
      );
      await idleRow.hover();
      assert.deepEqual(await expand.boundingBox(), collapsedRest,
        "A collapsed parent's expand button should not move on hover");
      const collapsedActions = await actions.boundingBox();
      assert.equal(collapsedActions.x - collapsedRest.x - collapsedRest.width, 4);
      assert.equal(await idleRow.locator("[title] > span").first().locator("..").evaluate(
        (node) => node.getBoundingClientRect().width,
      ), restingTitleWidth, "Collapsed parents should reserve their ellipsis space at rest");
      await page.mouse.click(1200, 750);
      const link = idleRow.locator(`a[data-sidebar-thread-id="${idleThread.id}"]`);
      await link.focus();
      await page.keyboard.press("Tab");
      assert.equal(await expand.evaluate((node) => document.activeElement === node), true);
      assert.equal((await expand.boundingBox()).width, 20, "Keyboard focus should reveal the toggle");
      await page.keyboard.press("Enter");
      await toggle.waitFor();
      await page.mouse.click(1200, 750);
      await assertRestingInset();
    } finally {
      await context.close();
    }
  } finally {
    await browser.close();
    try {
      if (childThread) fixture.run(["thread", "delete", childThread.id, "--yes"]);
      fixture.run(["thread", "delete", idleThread.id, "--yes"]);
    } finally {
      if (iconsEnabled) fixture.run(["plugin", "enable", ICONS_PLUGIN_ID]);
    }
  }
}
