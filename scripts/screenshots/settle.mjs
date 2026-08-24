// Waiting out bb's one-shot animations instead of guessing how long they take.
//
// A menu opening, a dialog, the side chat sliding in: each runs once and then
// stops, so its own `finished` promise is the condition a capture wants. The
// looping ones — a running thread's spinner — are left alone here and frozen
// later, in capture.mjs, because they never finish at all.

/**
 * Settles the page: every one-shot animation has ended, webfonts have loaded,
 * and a frame has been painted since the last of it.
 *
 * One animation can start as another ends, so this runs in passes and stops on
 * the first pass that finds nothing running. `passes` bounds a page that never
 * settles; it is not a duration, and a still page costs a single pass.
 */
export async function settleAnimations(page, { passes = 10 } = {}) {
  for (let pass = 0; pass < passes; pass += 1) {
    const running = await page.evaluate(async () => {
      const pending = document
        .getAnimations()
        .filter(
          (animation) =>
            animation.effect?.getTiming().iterations !== Infinity &&
            animation.playState === "running",
        );
      // A cancelled animation rejects, and only its ending matters here.
      await Promise.all(
        pending.map((animation) => animation.finished.catch(() => {})),
      );
      return pending.length;
    });
    if (running === 0) break;
  }
  // The font set resolves to itself, which does not cross the bridge.
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  // One frame for the last style change to land, one to paint it.
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
}
