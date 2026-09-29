import assert from "node:assert/strict";
import { launch, openContext, sidebar } from "./sidebar.mjs";

const LONG_TITLE =
  "Investigate webhook retries when delivery repeatedly fails and the queue stops making progress";
const DEFAULT = "Fade and pan on hover";

// The text itself: the one span under the title with no children.
function findLabel(title) {
  return [...document.querySelectorAll("[data-ribbon-sidebar-root] .bb-thread-title span")]
    .find((node) => node.childElementCount === 0 && node.textContent === title);
}

// Every fade is a mask layer sitting 16px off its box at one end: -16px keeps
// the right fade on the box and the left fade off it, and 0px the reverse.
function titleState(title) {
  const label = findLabel(title);
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
  const context = await openContext(browser, { reducedMotion, viewport: { width: 1280, height: 800 } });
  await context.addInitScript(`window.findLabel = ${findLabel}`);
  const page = await context.newPage();
  await page.goto(stack.serverUrl, { waitUntil: "domcontentloaded", timeout: 120_000 });
  const list = sidebar(page);
  await list.waitFor({ timeout: 120_000 });
  const label = list.getByText(LONG_TITLE, { exact: true });
  await label.waitFor();
  await label.scrollIntoViewIfNeeded();
  // Rest the pointer outside the sidebar before measuring the resting title.
  await page.mouse.move(1000, 400);
  return { context, page, label };
}

function waitForOverflow(page) {
  return page.waitForFunction((title) => {
    const label = findLabel(title);
    return label.getBoundingClientRect().width > label.closest(".overflow-hidden").getBoundingClientRect().width;
  }, LONG_TITLE);
}

async function hover(page, label) {
  const box = await label.boundingBox();
  await page.mouse.move(box.x + 8, box.y + box.height / 2);
  await page.locator("[data-ribbon-sidebar-root] [data-thread-id]:hover").first().waitFor();
}

export async function verifyThreadTitlePan({ stack, fixture, cases }) {
  const thread = fixture.threads.get("Investigate webhook retries");
  fixture.run(["thread", "update", thread.id, "--title", LONG_TITLE]);
  const setLongTitles = (value) => fixture.run(["plugin", "config", "thread-stages", "set", "longTitles", value]);
  const browser = await launch();
  try {
    if (cases.includes("hover")) {
      const { context, page, label } = await openSidebar(browser, stack, { reducedMotion: "no-preference" });
      await waitForOverflow(page);
      const resting = await page.evaluate(titleState, LONG_TITLE);
      assert.equal(resting.translateX, 0, `A resting title is not panned: ${JSON.stringify(resting)}`);
      assert.deepEqual(resting.maskPositions, ["-16px 0px", "-16px 0px"], "A resting title fades only its trailing edge");

      await hover(page, label);
      // The pan is a transition; wait for it to start, then for it to settle.
      await page.waitForFunction((title) => findLabel(title).getAnimations().length > 0, LONG_TITLE, { timeout: 5_000 });
      // It eases to a stop: most of the distance is covered well before the end.
      const nearEnd = await page.evaluate((title) => {
        const label = findLabel(title);
        const [pan] = label.getAnimations();
        const { delay, duration } = pan.effect.getComputedTiming();
        pan.pause();
        pan.currentTime = delay + duration * 0.9;
        const overflow = label.offsetWidth - label.closest(".overflow-hidden").clientWidth;
        const translateX = new DOMMatrixReadOnly(getComputedStyle(label).transform).m41;
        pan.play();
        return -translateX / overflow;
      }, LONG_TITLE);
      assert.ok(nearEnd > 0.95, `A hovered title slows down as it reaches its end: ${nearEnd}`);
      await page.evaluate(async (title) => {
        await Promise.all(
          findLabel(title).closest(".overflow-hidden").getAnimations({ subtree: true }).map((animation) => animation.finished),
        );
      }, LONG_TITLE);
      const panned = await page.evaluate(titleState, LONG_TITLE);
      // The title stops at its end, and the right fade leaves as it arrives.
      assert.ok(panned.overflow > 0 && Math.abs(panned.translateX + panned.overflow) <= 1, `A hovered title pans to its end: ${JSON.stringify(panned)}`);
      assert.deepEqual(panned.maskPositions, ["0px 0px", "0px 0px"], `A panned title fades only its leading edge: ${JSON.stringify(panned)}`);

      await page.mouse.move(1000, 400);
      const left = await page.evaluate(titleState, LONG_TITLE);
      assert.ok(left.translateX === 0 && left.running === 0, `Leaving the row snaps the title back: ${JSON.stringify(left)}`);
      await context.close();
    }
    if (cases.includes("reduced-motion")) {
      const { context, page, label } = await openSidebar(browser, stack, { reducedMotion: "reduce" });
      await waitForOverflow(page);
      await hover(page, label);
      const reduced = await page.evaluate(titleState, LONG_TITLE);
      assert.ok(reduced.translateX === 0 && reduced.running === 0, `Reduced motion does not pan titles: ${JSON.stringify(reduced)}`);
      await context.close();
    }
    if (cases.includes("fade")) {
      setLongTitles("Fade");
      const { context, page, label } = await openSidebar(browser, stack, { reducedMotion: "no-preference" });
      await waitForOverflow(page);
      await hover(page, label);
      // Whatever the hover starts elsewhere in the row, the title itself sits still.
      await page.waitForFunction(() => document.querySelector("[data-ribbon-sidebar-root] [data-thread-id]:hover") !== null);
      const hovered = await page.evaluate(titleState, LONG_TITLE);
      assert.ok(hovered.overflow > 0, "The long title still outgrows its row");
      assert.ok(hovered.translateX === 0 && hovered.running === 0, `A faded title does not pan: ${JSON.stringify(hovered)}`);
      assert.deepEqual(hovered.maskPositions, ["-16px 0px", "-16px 0px"], `A faded title keeps its trailing fade under the pointer: ${JSON.stringify(hovered)}`);
      await context.close();
    }
    if (cases.includes("ellipsis")) {
      setLongTitles("Ellipsis");
      const { context, page, label } = await openSidebar(browser, stack, { reducedMotion: "no-preference" });
      await hover(page, label);
      const ellipsis = await page.evaluate((title) => {
        const label = findLabel(title);
        // The working row's shimmer masks its shine window; only a fade would
        // mask anything nearer the text.
        let masked = false;
        for (let node = label; node && !node.hasAttribute("data-ribbon-shine-window"); node = node.parentElement) {
          if (getComputedStyle(node).maskImage !== "none") masked = true;
        }
        const style = getComputedStyle(label);
        return { textOverflow: style.textOverflow, overflow: style.overflowX, masked, clipped: label.scrollWidth > label.clientWidth };
      }, LONG_TITLE);
      assert.equal(ellipsis.textOverflow, "ellipsis", `bb's ellipsis ends the title: ${JSON.stringify(ellipsis)}`);
      assert.equal(ellipsis.overflow, "hidden");
      assert.ok(ellipsis.clipped, "The long title is cut, not scrolled");
      assert.equal(ellipsis.masked, false, "No fade masks the title");
      await context.close();
    }
  } finally {
    await browser.close();
    setLongTitles(DEFAULT);
    fixture.run(["thread", "update", thread.id, "--title", thread.title]);
  }
}
