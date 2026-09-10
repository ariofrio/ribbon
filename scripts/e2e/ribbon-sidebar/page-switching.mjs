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
    ([candidate, index]) => {
      const firstPage = candidate.firstElementChild?.firstElementChild;
      return (
        firstPage instanceof HTMLElement &&
        Math.abs(
          candidate.getBoundingClientRect().left -
            firstPage.getBoundingClientRect().left -
            candidate.clientWidth * index,
        ) <= 1
      );
    },
    [element, pageIndex],
    { timeout: 120_000 },
  );
}

async function performTrackpadSwipe(page, viewport, packets) {
  await viewport.evaluate((element) => {
    window.__ribbonSwipeFrames = [];
    window.__ribbonSwipeWheels = [];
    window.__ribbonSwipeStop = false;
    element.addEventListener(
      "wheel",
      (event) => {
        window.__ribbonSwipeWheels.push({
          time: performance.now(),
          trusted: event.isTrusted,
        });
      },
      { capture: true },
    );
    requestAnimationFrame(function sample(time) {
      const firstPage = element.firstElementChild?.firstElementChild;
      if (!(firstPage instanceof HTMLElement)) return;
      window.__ribbonSwipeFrames.push({
        progress:
          element.getBoundingClientRect().left -
          firstPage.getBoundingClientRect().left,
        time,
      });
      if (!window.__ribbonSwipeStop) requestAnimationFrame(sample);
    });
  });

  const viewportBox = await viewport.boundingBox();
  assert.ok(viewportBox, "The page viewport did not render a box");
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.synthesizeScrollGesture", {
    gestureSourceType: "mouse",
    preventFling: false,
    speed: 2_400,
    x: viewportBox.x + viewportBox.width / 2,
    xDistance: -packets.reduce((sum, delta) => sum + delta, 0),
    y: viewportBox.y + viewportBox.height / 2,
    yDistance: 0,
  });
  await cdp.detach();

  await page.waitForFunction(() => {
    const wheels = window.__ribbonSwipeWheels;
    return wheels.length > 0 && performance.now() - wheels.at(-1).time > 250;
  });

  return viewport.evaluate((element) => {
    window.__ribbonSwipeStop = true;
    const wheels = window.__ribbonSwipeWheels;
    const firstWheelTime = wheels[0].time;
    const lastWheelTime = wheels.at(-1).time;
    const gestureFrames = window.__ribbonSwipeFrames.filter(
      ({ time }) => time >= firstWheelTime && time <= lastWheelTime,
    );
    const motionFrames = window.__ribbonSwipeFrames.filter(
      ({ time }) => time >= firstWheelTime,
    );
    const frameSteps = gestureFrames.slice(1).map(
      ({ progress }, index) => progress - gestureFrames[index].progress,
    );
    const finalProgress = element.clientWidth;
    const lastUnsettledFrame = motionFrames.findLastIndex(
      ({ progress }) => Math.abs(progress - finalProgress) > 1,
    );
    const unsettledSteps = motionFrames
      .slice(1, lastUnsettledFrame + 1)
      .map(({ progress }, index) => progress - motionFrames[index].progress);
    let stationaryRun = 0;
    let maximumUnsettledStationaryRun = 0;
    for (const step of unsettledSteps) {
      stationaryRun = Math.abs(step) < 0.25 ? stationaryRun + 1 : 0;
      maximumUnsettledStationaryRun = Math.max(
        maximumUnsettledStationaryRun,
        stationaryRun,
      );
    }
    return {
      maximumUnsettledStationaryRun,
      minimumFrameStep: Math.min(...frameSteps),
      maximumMotionProgress: Math.max(
        ...motionFrames.map(({ progress }) => progress),
      ),
      maxGestureProgress: Math.max(
        ...gestureFrames.map(({ progress }) => progress),
      ),
      trustedPackets: wheels.filter(({ trusted }) => trusted).length,
      wheelPackets: wheels.length,
      width: element.clientWidth,
    };
  });
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
          let frames = 0;
          const progressFrames = [];
          requestAnimationFrame(function sample() {
            frames += 1;
            const firstPage = element.firstElementChild?.firstElementChild;
            if (!(firstPage instanceof HTMLElement)) return;
            const progress =
              element.getBoundingClientRect().left -
              firstPage.getBoundingClientRect().left;
            progressFrames.push(progress);
            if (frames < 12) {
              requestAnimationFrame(sample);
              return;
            }
            window.__ribbonEdgeFrame = {
              defaultPrevented: event.defaultPrevented,
              progressFrames,
            };
          });
        },
        { once: true },
      );
    });
    const edgePackets = [-12, -24, -40, -60, -40, -24, -12];
    for (const deltaX of edgePackets) {
      await page.mouse.wheel(deltaX, 0);
      await page.evaluate(() => new Promise(requestAnimationFrame));
    }
    const edgeFrame = await page.waitForFunction(() => window.__ribbonEdgeFrame);
    const edgeMotion = await edgeFrame.jsonValue();
    assert.equal(edgeMotion.defaultPrevented, true);
    const furthestEdgeOffset = Math.min(...edgeMotion.progressFrames);
    assert.ok(
      furthestEdgeOffset < 0 &&
        Math.abs(furthestEdgeOffset) <
          Math.abs(edgePackets.reduce((sum, delta) => sum + delta, 0)),
      `An outward gesture should visibly move by a resisted distance: ${JSON.stringify(edgeMotion)}`,
    );
    await page.waitForFunction((element) => {
      const firstPage = element.firstElementChild?.firstElementChild;
      return (
        firstPage instanceof HTMLElement &&
        Math.abs(
          element.getBoundingClientRect().left -
            firstPage.getBoundingClientRect().left,
        ) < 1
      );
    }, await viewport.elementHandle());
    await waitForActivePage(page, "All groups");
    await waitForPageAtRest(page, viewport, 0);

    const swipePackets = [
      8, 14, 22, 34, 50, 68, 82, 88, 82, 70, 54, 40, 28, 18, 10, 6,
    ];
    const swipeMotion = await performTrackpadSwipe(
      page,
      viewport,
      swipePackets,
    );
    assert.ok(swipeMotion.wheelPackets > 1);
    assert.equal(swipeMotion.trustedPackets, swipeMotion.wheelPackets);
    assert.ok(
      swipeMotion.minimumFrameStep >= -2,
      "Swipe motion should not snap backward between input packets",
    );
    assert.ok(
      swipeMotion.maximumUnsettledStationaryRun <= 2,
      `Swipe motion paused for ${swipeMotion.maximumUnsettledStationaryRun} frames before reaching its snap point`,
    );
    assert.ok(
      swipeMotion.maxGestureProgress > swipeMotion.width * 0.25,
      "A strong swipe should visibly follow the input before settling",
    );
    assert.ok(
      swipeMotion.maximumMotionProgress <= swipeMotion.width + 1,
      `One swipe crossed beyond its adjacent page: ${JSON.stringify(swipeMotion)}`,
    );
    await waitForActivePage(page, "Atlas");
    await waitForPageAtRest(page, viewport, 1);
    assert.match(
      await root.getAttribute("data-ribbon-sidebar-scope-group-id"),
      /^sec_/u,
    );

    await page.mouse.wheel(110, 0);
    await page.waitForFunction((element) => {
      const firstPage = element.firstElementChild?.firstElementChild;
      return (
        firstPage instanceof HTMLElement &&
        element.getBoundingClientRect().left -
          firstPage.getBoundingClientRect().left >
          element.clientWidth + 20
      );
    }, await viewport.elementHandle());
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
      requestAnimationFrame(function sample() {
        if (window.__ribbonAdjacentFrame === null) {
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
            requestAnimationFrame(sample);
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
        }
      });
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
