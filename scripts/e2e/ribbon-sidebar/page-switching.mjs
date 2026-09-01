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

async function waitForPageAtRest(page, viewport, pageIndex) {
  const element = await viewport.elementHandle();
  assert.ok(element, "The page viewport did not render");
  await page.waitForFunction(
    ([candidate, index]) =>
      Math.abs(candidate.scrollLeft - candidate.clientWidth * index) <= 1,
    [element, pageIndex],
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
    const viewport = root.getByTestId("sidebar-page-viewport");

    await waitForActivePage(page, "All groups");
    await waitForPageAtRest(page, viewport, 0);

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

    await viewport.evaluate((element) => {
      window.__ribbonEdgeFrame = null;
      element.addEventListener(
        "wheel",
        (event) => {
          requestAnimationFrame(() => {
            const transform = getComputedStyle(element).transform;
            const horizontalOffset =
              transform === "none" ? 0 : new DOMMatrix(transform).m41;
            window.__ribbonEdgeFrame = {
              defaultPrevented: event.defaultPrevented,
              horizontalOffset,
            };
          });
        },
        { once: true },
      );
    });
    await page.mouse.wheel(-260, 0);
    const edgeFrame = await page.waitForFunction(() => window.__ribbonEdgeFrame);
    const edgeMotion = await edgeFrame.jsonValue();
    assert.equal(edgeMotion.defaultPrevented, true);
    assert.ok(
      edgeMotion.horizontalOffset > 0 && edgeMotion.horizontalOffset < 260,
      "An outward gesture should visibly move by a resisted distance",
    );
    await page.waitForFunction((element) => {
      const transform = getComputedStyle(element).transform;
      return transform === "none" || Math.abs(new DOMMatrix(transform).m41) < 1;
    }, await viewport.elementHandle());
    await waitForActivePage(page, "All groups");
    await waitForPageAtRest(page, viewport, 0);

    await page.mouse.wheel(1_800, 0);
    await waitForActivePage(page, "Atlas");
    await waitForPageAtRest(page, viewport, 1);
    assert.match(
      await root.getAttribute("data-ribbon-sidebar-scope-group-id"),
      /^sec_/u,
    );

    await page.mouse.wheel(110, 0);
    await page.waitForFunction(
      (element) => element.scrollLeft > element.clientWidth + 20,
      await viewport.elementHandle(),
    );
    await waitForPageAtRest(page, viewport, 1);
    assert.equal(
      await navigation
        .locator('[aria-current="page"]')
        .getAttribute("aria-label"),
      "Show Atlas page",
      "A short horizontal gesture should return to the closest page",
    );

    await viewport.evaluate((element) => {
      window.__ribbonAdjacentFrame = null;
      element.addEventListener(
        "scroll",
        () => {
          requestAnimationFrame(() => {
            const adjacentContent = [...element.querySelectorAll("*")].find(
              (candidate) =>
                candidate.textContent?.trim() === "No threads in this section",
            );
            const viewportBox = element.getBoundingClientRect();
            const adjacentBox = adjacentContent?.getBoundingClientRect();
            if (
              adjacentBox === undefined ||
              adjacentBox.left >= viewportBox.right
            ) {
              return;
            }
            window.__ribbonAdjacentFrame = {
              activeLabel: document
                .querySelector(
                  '[data-ribbon-sidebar-root] nav[aria-label="Sidebar pages"] [aria-current="page"]',
                )
                ?.getAttribute("aria-label"),
              adjacentRendered: true,
              adjacentEntered: true,
            };
          });
        },
      );
    });
    await page.mouse.wheel(220, 0);
    const adjacentFrame = await page.waitForFunction(
      () => window.__ribbonAdjacentFrame,
    );
    assert.deepEqual(await adjacentFrame.jsonValue(), {
      activeLabel: "Show Atlas page",
      adjacentRendered: true,
      adjacentEntered: true,
    });
    await waitForActivePage(page, "Unorganized");
    assert.equal(
      await root.getAttribute("data-ribbon-sidebar-scope-group-id"),
      "unsectioned",
    );
    await root.getByText("No threads in this section", { exact: true }).waitFor();
    await waitForPageAtRest(page, viewport, 2);

    await page.mouse.wheel(-220, 0);
    await waitForActivePage(page, "Atlas");
    await waitForPageAtRest(page, viewport, 1);
  } finally {
    await context.close();
    await browser.close();
  }
}
