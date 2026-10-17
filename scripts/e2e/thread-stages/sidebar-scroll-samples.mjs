export function startSidebarScrollSampling(root) {
  const scroller = root.closest('[data-sidebar="content"]');
  const samples = (window.scrollSamples = {
    longestGap: 0,
    longestGapPhase: null,
    blankFrames: 0,
    blankDetails: [],
    phase: "wheel",
    unpaintedScrollChanges: 0,
    frames: 0,
    running: true,
  });
  const tasks = (window.scrollLongTasks = []);
  window.scrollTaskObserver = new PerformanceObserver((list) => {
    tasks.push(...list.getEntries().map((entry) => entry.duration));
  });
  window.scrollTaskObserver.observe({ type: "longtask" });
  let previous;
  function sampleBlankRows(frame, postPaint = false) {
    if (!samples.running) return;
    // A jump can change scrollTop between rAF and its timer. That timer
    // then observes a future scroll position, not the frame just painted.
    // Check every rAF too, and only compare its timer at the same offset.
    if (postPaint && scroller.scrollTop !== frame.scrollTop) {
      samples.unpaintedScrollChanges++;
      return;
    }
    const viewport = scroller.getBoundingClientRect();
    const top = Math.max(0, viewport.top);
    const bottom = Math.min(innerHeight, viewport.bottom);
    const wrappers = root.querySelectorAll(
      "[data-sidebar-windowed-item], [data-sidebar-windowed-chunk-empty]",
    );
    // Wrappers follow the list's vertical document order. Probe the
    // visible run instead of forcing layout for every offscreen row.
    let low = 0,
      high = wrappers.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (wrappers[middle].getBoundingClientRect().top < top) low = middle + 1;
      else high = middle;
    }
    let blank = false;
    for (let index = Math.max(0, low - 1); index < wrappers.length; index++) {
      const node = wrappers[index];
      const box = node.getBoundingClientRect();
      if (box.top >= bottom) break;
      if (box.height <= 0 || box.bottom <= top) continue;
      const child = node.firstElementChild;
      if (
        !child ||
        !child.checkVisibility({
          contentVisibilityAuto: true,
          visibilityProperty: true,
        })
      ) {
        blank = true;
        if (samples.blankDetails.length < 12)
          samples.blankDetails.push({
            phase: samples.phase,
            postPaint,
            scrollTop: scroller.scrollTop,
            top: box.top,
            bottom: box.bottom,
            height: box.height,
            gap: node.hasAttribute("data-sidebar-windowed-chunk-empty"),
            represented: node.parentElement.dataset.sidebarWindowedCount,
            parent: node
              .closest("[data-sidebar-parent-thread-id]")
              ?.getAttribute("data-sidebar-parent-thread-id"),
            navigation: node
              .getAttribute("data-sidebar-windowed-nav")
              ?.slice(0, 80),
          });
        break;
      }
    }
    if (blank && !frame.blank) {
      frame.blank = true;
      samples.blankFrames++;
    }
  }
  function sampleFrame(now) {
    if (!samples.running) return;
    if (previous !== undefined && now - previous > samples.longestGap) {
      samples.longestGap = now - previous;
      samples.longestGapPhase = samples.phase;
    }
    previous = now;
    samples.frames++;
    // A post-paint timer can be deprioritized during wheel input.
    // It must not gate the next animation frame's measurement.
    const frame = { scrollTop: scroller.scrollTop, blank: false };
    sampleBlankRows(frame);
    requestAnimationFrame(sampleFrame);
    setTimeout(() => sampleBlankRows(frame, true), 0);
  }
  requestAnimationFrame(sampleFrame);
}

export function stopSidebarScrollSampling() {
  window.scrollSamples.running = false;
  window.scrollLongTasks.push(...window.scrollTaskObserver.takeRecords().map(entry => entry.duration));
  window.scrollTaskObserver.disconnect();
  return {
    ...window.scrollSamples,
    longestTask: Math.max(0, ...window.scrollLongTasks),
  };
}
