import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { startSidebarScrollSampling } from "./e2e/thread-stages/sidebar-scroll-samples.mjs";
const saved = new Map();
function global(name, value) {
  saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperty(globalThis, name, {
    value,
    writable: true,
    configurable: true,
  });
}
afterEach(() => {
  mock.restoreAll();
  for (const [name, descriptor] of saved) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete globalThis[name];
  }
  saved.clear();
});
function fixture() {
  const frames = [],
    timers = [];
  global("window", {});
  global("innerHeight", 800);
  global("requestAnimationFrame", (fn) => {
    frames.push(fn);
    return frames.length;
  });
  mock.method(globalThis, "setTimeout", (fn) => {
    timers.push(fn);
    return 0;
  });
  global(
    "PerformanceObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  const scroller = {
    scrollTop: 0,
    getBoundingClientRect: () => ({ top: 0, bottom: 800 }),
  };
  const row = {
    firstElementChild: { checkVisibility: () => true },
    getBoundingClientRect: () => ({ top: 20, bottom: 50, height: 30 }),
    hasAttribute: () => false,
    parentElement: { dataset: { sidebarWindowedCount: "1" } },
    closest: () => null,
    getAttribute: () => null,
  };
  const root = { closest: () => scroller, querySelectorAll: () => [row] };
  startSidebarScrollSampling(root);
  return { frames, timers, scroller, row, root };
}
test("checks the next frame after a jump instead of attributing a future offset to an earlier paint", () => {
  const f = fixture();
  f.frames.shift()(0);
  f.scroller.scrollTop = 5000;
  f.row.firstElementChild = null;
  f.timers.shift()();
  assert.equal(window.scrollSamples.blankFrames, 0);
  assert.equal(window.scrollSamples.unpaintedScrollChanges, 1);
  f.frames.shift()(16.7);
  assert.equal(window.scrollSamples.blankFrames, 1);
  assert.equal(window.scrollSamples.blankDetails[0].postPaint, false);
  f.timers.shift()();
  assert.equal(
    window.scrollSamples.blankFrames,
    1,
    "one frame is counted once even if both probes see its hole",
  );
});
test("measures frame cadence even when post-paint timers are delayed", () => {
  const f = fixture();
  f.frames.shift()(0);
  f.frames.shift()(250);
  assert.equal(window.scrollSamples.frames, 2);
  assert.equal(window.scrollSamples.longestGap, 250);
  assert.equal(f.timers.length, 2);
});
test("a stopped sampler cannot resume when another run starts", () => {
  const f = fixture();
  f.frames.shift()(0);
  window.scrollSamples.running = false;
  const staleFrame = f.frames.shift();
  startSidebarScrollSampling(f.root);
  staleFrame(100);
  assert.equal(window.scrollSamples.frames, 0);
  assert.equal(f.frames.length, 1);
  f.frames.shift()(110);
  assert.equal(window.scrollSamples.frames, 1);
});
