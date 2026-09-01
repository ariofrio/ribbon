import assert from "node:assert/strict";
import { chromium } from "playwright";

async function waitForActivePage(page, label) {
  await page.waitForFunction(
    (expected) =>
      document
        .querySelector(
          '[data-ribbon-sidebar-root] nav[aria-label="Sidebar pages"] [aria-current="page"]',
        )
        ?.getAttribute("aria-label") === expected,
    `Show ${label} page`,
  );
}

async function waitForPanelAtRest(page, panel) {
  const element = await panel.elementHandle();
  assert.ok(element, "The page panel did not render");
  await page.waitForFunction(
    (candidate) =>
      getComputedStyle(candidate).transform ===
        "matrix(1, 0, 0, 1, 0, 0)" &&
      candidate.style.transition === "none",
    element,
    { timeout: 120_000 },
  );
}

export async function verifyPageSwitching({ stack }) {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  await context.addInitScript(() => {
    window.localStorage.setItem(
      "bb.sidebar.threadListProvider",
      JSON.stringify("ribbon-sidebar/ribbon-sidebar"),
    );
  });
  const page = await context.newPage();
  try {
    await page.goto(stack.serverUrl, { waitUntil: "domcontentloaded" });
    const root = page.locator(
      "[data-ribbon-sidebar-root][data-ribbon-sidebar-ready]",
    );
    await root.waitFor({ timeout: 120_000 });
    const navigation = root.getByRole("navigation", {
      name: "Sidebar pages",
    });
    const panel = root.getByTestId("sidebar-page-panel");
    const viewport = root.getByTestId("sidebar-page-viewport");

    await navigation.getByRole("button", { name: "Show Atlas page" }).click();
    await waitForActivePage(page, "Atlas");
    assert.match(
      await root.getAttribute("data-ribbon-sidebar-scope-group-id"),
      /^sec_/u,
    );

    const navigationBox = await navigation.boundingBox();
    const parentBottom = await root.evaluate(
      (element) => element.parentElement.parentElement.getBoundingClientRect().bottom,
    );
    assert.ok(navigationBox, "The page navigation did not render a box");
    assert.equal(
      await navigation.evaluate((element) => getComputedStyle(element).position),
      "sticky",
    );
    assert.ok(
      parentBottom - (navigationBox.y + navigationBox.height) <= 12,
      "The page navigation did not stay at the bottom of the sidebar body",
    );

    const viewportBox = await viewport.boundingBox();
    assert.ok(viewportBox, "The page viewport did not render a box");
    await page.mouse.move(
      viewportBox.x + viewportBox.width / 2,
      viewportBox.y + viewportBox.height / 2,
    );

    await page.mouse.wheel(110, 0);
    await page.waitForFunction(
      (element) =>
        getComputedStyle(element).transform !==
        "matrix(1, 0, 0, 1, 0, 0)",
      await panel.elementHandle(),
    );
    await waitForPanelAtRest(page, panel);
    assert.equal(
      await navigation
        .locator('[aria-current="page"]')
        .getAttribute("aria-label"),
      "Show Atlas page",
      "A short horizontal gesture should return to the closest page",
    );

    await page.mouse.wheel(220, 0);
    await waitForActivePage(page, "Unorganized");
    assert.equal(
      await root.getAttribute("data-ribbon-sidebar-scope-group-id"),
      "unsectioned",
    );
    await root.getByText("No threads in this section", { exact: true }).waitFor();
    assert.equal(
      await panel.evaluate((element) => getComputedStyle(element).transform),
      "matrix(1, 0, 0, 1, 0, 0)",
    );

    await page.mouse.wheel(-220, 0);
    await waitForActivePage(page, "Atlas");
  } finally {
    await context.close();
    await browser.close();
  }
}
