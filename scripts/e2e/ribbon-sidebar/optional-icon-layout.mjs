import assert from "node:assert/strict";
import { chromium } from "playwright";
import { FEATURED_THREAD } from "../../screenshots/fixture.mjs";

const INDICATOR_THREAD = "Investigate webhook retries";
const ICONS_PLUGIN_ID = "icons";

export async function verifyOptionalIconLayout({ stack, fixture }) {
  const iconsEnabled = fixture
    .runJson(["plugin", "list"])
    .plugins.some(
      (plugin) => plugin.id === ICONS_PLUGIN_ID && plugin.enabled === true,
    );
  if (iconsEnabled) fixture.run(["plugin", "disable", ICONS_PLUGIN_ID]);

  const browser = await chromium.launch({ args: ["--mute-audio"] });
  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 2,
      reducedMotion: "reduce",
    });
    try {
      await context.addInitScript((sectionId) => {
        window.localStorage.setItem(
          "bb.plugin.ribbon-sidebar.preferences.v1",
          JSON.stringify({
            view: {
              scope: {
                kind: "group",
                group: {
                  groupingKey: "builtin:sections",
                  groupId: sectionId,
                },
              },
              groupingKey: null,
            },
            collapsed: [],
          }),
        );
        window.localStorage.setItem(
          "bb.sidebar.threadListProvider",
          JSON.stringify("ribbon-sidebar/ribbon-sidebar"),
        );
      }, fixture.section.id);

      const page = await context.newPage();
      await page.goto(stack.serverUrl, { waitUntil: "domcontentloaded" });
      await page
        .locator("[data-ribbon-sidebar-root][data-ribbon-sidebar-ready]")
        .waitFor({ timeout: 120_000 });

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
        Math.abs(gap - 8) < 0.5,
        `Without Icons, the title-to-indicator gap was ${gap}px instead of 8px (${JSON.stringify(geometry)})`,
      );

      const idleThread = fixture.threads.get(FEATURED_THREAD);
      const idleRow = page.locator("[data-ribbon-sidebar-root] li").filter({
        has: page.locator(`a[data-sidebar-thread-id="${idleThread.id}"]`),
      });
      assert.equal(await idleRow.locator("[data-sidebar-thread-trailing-indicator]").count(), 0);
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
        assert.ok(Math.abs(gap - 8) < 0.5, `The visible actions gap was ${gap}px instead of 8px`);
      }
      await idleRow.hover();
      await assertActionGap();
      const actions = idleRow.getByRole("button", { name: "Thread actions", exact: true });
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
    } finally {
      await context.close();
    }
  } finally {
    await browser.close();
    if (iconsEnabled) fixture.run(["plugin", "enable", ICONS_PLUGIN_ID]);
  }
}
