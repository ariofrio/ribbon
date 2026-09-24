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

function findLabel(title) {
  return [...document.querySelectorAll("[data-ribbon-sidebar-root] span")]
    .find((node) => node.childElementCount === 0 && node.textContent === title);
}

async function openSidebar(browser, stack, { reducedMotion, title = LONG_TITLE }) {
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
  await context.addInitScript(`window.findLabel = ${findLabel}`);
  const page = await context.newPage();
  await page.goto(stack.serverUrl);
  const sidebar = page.locator("[data-ribbon-sidebar-root][data-ribbon-sidebar-ready]");
  await sidebar.waitFor({ timeout: 120_000 });
  const label = sidebar.getByText(title, { exact: true });
  await label.waitFor();
  await label.scrollIntoViewIfNeeded();
  // Rest the pointer outside the sidebar before measuring the resting title.
  await page.mouse.move(1000, 400);
  return { context, page, label };
}

function clipWidth(page, title) {
  return page.evaluate(
    (title) => findLabel(title).closest(".overflow-hidden").getBoundingClientRect().width,
    title,
  );
}

function waitForOverflow(page, title) {
  return page.waitForFunction((title) => {
    const label = findLabel(title);
    return label.getBoundingClientRect().width >
      label.closest(".overflow-hidden").getBoundingClientRect().width;
  }, title);
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
      await waitForOverflow(page, LONG_TITLE);
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
      // Some rows make room for hover actions, so a title that fits at rest can
      // overflow only once its row is hovered.
      const { context, page } = await openSidebar(browser, stack, {
        reducedMotion: "no-preference",
      });
      const room = (id) => page.evaluate((id) => {
        const link = document.querySelector(`a[data-sidebar-thread-id="${id}"]`);
        const label = link.parentElement.querySelector(".overflow-hidden");
        return label.parentElement.getBoundingClientRect().width;
      }, id);
      const ids = await page.evaluate(() =>
        [...document.querySelectorAll("[data-ribbon-sidebar-root] a[data-sidebar-thread-id]")]
          .map((link) => link.dataset.sidebarThreadId));
      let narrowing = null;
      for (const id of ids) {
        const link = page.locator(`a[data-sidebar-thread-id="${id}"]`);
        if (!(await link.isVisible())) continue;
        await page.mouse.move(1000, 400);
        const resting = await room(id);
        const box = await link.boundingBox();
        await page.mouse.move(box.x + 8, box.y + box.height / 2);
        await page.locator("[data-ribbon-sidebar-root] li:hover").filter({ has: link }).first().waitFor();
        const hovered = await room(id);
        if (resting - hovered >= 12) {
          narrowing = { id, resting, hovered };
          break;
        }
      }
      if (narrowing === null) throw new Error("No row makes room for its hover actions");
      const title = await page.evaluate(([title, narrow, wide]) => {
        const context = document.createElement("canvas").getContext("2d");
        context.font = getComputedStyle(findLabel(title)).font;
        for (let length = title.length; length > 0; length -= 1) {
          const prefix = title.slice(0, length).trimEnd();
          const width = context.measureText(prefix).width;
          if (width > narrow + 4 && width < wide - 4) return prefix;
        }
        return null;
      }, [LONG_TITLE, narrowing.hovered, narrowing.resting]);
      await context.close();
      const target = [...fixture.threads.values()].find((candidate) => candidate.id === narrowing.id);

      fixture.run(["thread", "update", target.id, "--title", title]);
      const reopened = await openSidebar(browser, stack, {
        reducedMotion: "no-preference",
        title,
      });
      const resting = await reopened.page.evaluate(titleState, title);
      if (resting.overflow > 0) {
        throw new Error(`The title should fit its resting row: ${JSON.stringify(resting)}`);
      }
      await hover(reopened.page, reopened.label);
      await waitForOverflow(reopened.page, title);
      // The fades move into place as the title pans, never before.
      const fades = await reopened.page.evaluate((title) => {
        const label = findLabel(title);
        const clip = label.closest(".overflow-hidden");
        const fades = [];
        for (let node = label.parentElement; node !== clip.parentElement; node = node.parentElement) {
          if (getComputedStyle(node).maskImage === "none") continue;
          fades.push({
            position: getComputedStyle(node).maskPosition,
            moving: node.getAnimations().some((animation) => animation.transitionProperty === "mask-position"),
          });
        }
        return fades;
      }, title);
      if (fades.length !== 2 || !fades.every(({ position, moving }) => moving || position === "-16px 0px")) {
        throw new Error(`A title that overflows on hover should fade in as it pans: ${JSON.stringify(fades)}`);
      }
      await reopened.context.close();
      fixture.run(["thread", "update", target.id, "--title", target.title]);
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
