import { chromium } from "playwright";

const LONG_TITLE =
  "Investigate webhook retries when delivery repeatedly fails and the queue stops making progress";

// Every fade is a mask layer sitting 16px off its box at one end: -16px keeps
// the right fade on the box and the left fade off it, and 0px the reverse.
function titleState(title) {
  const label = [...document.querySelectorAll("[data-ribbon-sidebar-root] span")]
    .find((node) => node.childElementCount === 0 && node.textContent === title);
  const clip = label.closest(".overflow-hidden");
  const faded = [];
  for (let node = label.parentElement; node !== clip.parentElement; node = node.parentElement) {
    if (getComputedStyle(node).maskImage !== "none") faded.push(node);
  }
  return {
    overflow: label.offsetWidth - clip.clientWidth,
    translateX: new DOMMatrixReadOnly(getComputedStyle(label).transform).m41,
    maskPositions: faded.map((node) => getComputedStyle(node).maskPosition),
    running: [label, ...faded].reduce((count, node) => count + node.getAnimations().length, 0),
  };
}

async function openSidebar(browser, stack, { reducedMotion }) {
  const context = await browser.newContext({
    reducedMotion,
    viewport: { width: 1280, height: 800 },
  });
  await context.addInitScript(() => {
    localStorage.setItem("bb.sidebar.threadListProvider", JSON.stringify("ribbon-sidebar/ribbon-sidebar"));
    localStorage.setItem("bb.plugin.ribbon-sidebar.preferences.v1", JSON.stringify({
      view: { scope: { kind: "all" }, groupingKey: null, filterGroupingKey: null },
      collapsed: [],
    }));
  });
  const page = await context.newPage();
  await page.goto(stack.serverUrl);
  const sidebar = page.locator("[data-ribbon-sidebar-root][data-ribbon-sidebar-ready]");
  await sidebar.waitFor({ timeout: 120_000 });
  const label = sidebar.getByText(LONG_TITLE, { exact: true });
  await label.waitFor();
  await label.scrollIntoViewIfNeeded();
  // Rest the pointer outside the sidebar before measuring the resting title.
  await page.mouse.move(1000, 400);
  await page.waitForFunction(
    (title) => {
      const label = [...document.querySelectorAll("[data-ribbon-sidebar-root] span")]
        .find((node) => node.childElementCount === 0 && node.textContent === title);
      return label && getComputedStyle(label.parentElement).maskImage !== "none";
    },
    LONG_TITLE,
  );
  return { context, page, label };
}

async function hover(page, label) {
  const box = await label.boundingBox();
  await page.mouse.move(box.x + 8, box.y + box.height / 2);
}

export async function verifyThreadTitlePan({ stack, fixture }) {
  const thread = fixture.threads.get("Investigate webhook retries");
  fixture.run(["thread", "update", thread.id, "--title", LONG_TITLE]);
  const browser = await chromium.launch({ args: ["--mute-audio"] });
  try {
    {
      const { context, page, label } = await openSidebar(browser, stack, {
        reducedMotion: "no-preference",
      });
      const resting = await page.evaluate(titleState, LONG_TITLE);
      if (
        resting.translateX !== 0 ||
        resting.maskPositions.length !== 2 ||
        !resting.maskPositions.every((position) => position === "-16px 0px")
      ) {
        throw new Error(`A resting title should not be panned: ${JSON.stringify(resting)}`);
      }

      await hover(page, label);
      // The pan is a transition; wait for it to start, then for it to settle.
      await page.waitForFunction(
        (title) => {
          const label = [...document.querySelectorAll("[data-ribbon-sidebar-root] span")]
            .find((node) => node.childElementCount === 0 && node.textContent === title);
          return label.getAnimations().length > 0;
        },
        LONG_TITLE,
        { timeout: 5_000 },
      );
      // It eases to a stop: most of the distance is covered well before the end.
      const nearEnd = await page.evaluate((title) => {
        const label = [...document.querySelectorAll("[data-ribbon-sidebar-root] span")]
          .find((node) => node.childElementCount === 0 && node.textContent === title);
        const [pan] = label.getAnimations();
        const { delay, duration } = pan.effect.getComputedTiming();
        pan.pause();
        pan.currentTime = delay + duration * 0.9;
        const overflow = label.offsetWidth - label.closest(".overflow-hidden").clientWidth;
        const translateX = new DOMMatrixReadOnly(getComputedStyle(label).transform).m41;
        pan.play();
        return -translateX / overflow;
      }, LONG_TITLE);
      if (!(nearEnd > 0.95)) {
        throw new Error(`A hovered title should slow down as it reaches its end: ${nearEnd}`);
      }
      await page.evaluate(async (title) => {
        const label = [...document.querySelectorAll("[data-ribbon-sidebar-root] span")]
          .find((node) => node.childElementCount === 0 && node.textContent === title);
        await Promise.all(
          label.closest(".overflow-hidden").getAnimations({ subtree: true })
            .map((animation) => animation.finished),
        );
      }, LONG_TITLE);
      const panned = await page.evaluate(titleState, LONG_TITLE);
      // The title stops at its end, and the right fade leaves as it arrives.
      if (panned.overflow <= 0 || Math.abs(panned.translateX + panned.overflow) > 1) {
        throw new Error(`A hovered title should pan to its end: ${JSON.stringify(panned)}`);
      }
      if (!panned.maskPositions.every((position) => position === "0px 0px")) {
        throw new Error(`A panned title should fade only its leading edge: ${JSON.stringify(panned)}`);
      }

      await page.mouse.move(1000, 400);
      const left = await page.evaluate(titleState, LONG_TITLE);
      if (left.translateX !== 0 || left.running !== 0) {
        throw new Error(`Leaving the row should snap the title back: ${JSON.stringify(left)}`);
      }
      await context.close();
    }
    {
      const { context, page, label } = await openSidebar(browser, stack, {
        reducedMotion: "reduce",
      });
      await hover(page, label);
      await page.locator("[data-ribbon-sidebar-root] li:hover").first().waitFor();
      const reduced = await page.evaluate(titleState, LONG_TITLE);
      if (reduced.translateX !== 0 || reduced.running !== 0) {
        throw new Error(`Reduced motion should not pan titles: ${JSON.stringify(reduced)}`);
      }
      await context.close();
    }
  } finally {
    await browser.close();
    fixture.run(["thread", "update", thread.id, "--title", thread.title]);
  }
}
