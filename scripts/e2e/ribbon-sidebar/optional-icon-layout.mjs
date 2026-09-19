import assert from "node:assert/strict";
import { chromium } from "playwright";

const INDICATOR_THREAD = "Investigate webhook retries";
const ICONS_PLUGIN_ID = "icons";

export async function verifyOptionalIconLayout({ stack, fixture }) {
  const iconsEnabled = fixture
    .runJson(["plugin", "list"])
    .plugins.some(
      (plugin) => plugin.id === ICONS_PLUGIN_ID && plugin.enabled === true,
    );
  if (iconsEnabled) fixture.run(["plugin", "disable", ICONS_PLUGIN_ID]);

  const browser = await chromium.launch();
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
    } finally {
      await context.close();
    }
  } finally {
    await browser.close();
    if (iconsEnabled) fixture.run(["plugin", "enable", ICONS_PLUGIN_ID]);
  }
}
