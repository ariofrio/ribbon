import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { join } from "node:path";
import { FEATURED_THREAD } from "../../screenshots/fixture.mjs";
import { launch, openContext, sidebar } from "./sidebar.mjs";

export async function verifySidebarScroll({ stack, fixture }) {
  // Real rows, all in one group, without starting hundreds of agent turns.
  const db = new Database(join(stack.dataDir, "bb.db"));
  const template = db.prepare("SELECT * FROM threads WHERE id = ?").get(fixture.threads.get(FEATURED_THREAD).id);
  const columns = Object.keys(template);
  const insert = db.prepare(`INSERT INTO threads (${columns.map((key) => `"${key}"`).join(",")}) VALUES (${columns.map(() => "?").join(",")})`);
  db.transaction(() => {
    for (let index = 0; index < 600; index++) {
      const thread = { ...template, id: `thr_scroll_${index}`, title: `Scroll test thread ${index}`, parent_thread_id: null };
      insert.run(...columns.map((key) => thread[key]));
    }
  })();
  db.close();
  await stack.restartServer();
  const browser = await launch();
  try {
    const context = await openContext(browser, { viewport: { width: 1280, height: 800 } });
    try {
      const page = await context.newPage();
      const cdp = await context.newCDPSession(page);
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
      await page.goto(stack.serverUrl);
      const list = sidebar(page);
      await list.waitFor({ timeout: 120_000 });
      // BB loads other plugin frontends after the sidebar is ready. Their
      // late stylesheets restyle the whole page and are startup work.
      await page.waitForLoadState("networkidle", { timeout: 120_000 });
      const scroller = list.locator('xpath=ancestor::*[@data-sidebar="content"]');
      await page.waitForFunction(() => document.querySelector('[data-ribbon-sidebar-root]')?.querySelectorAll('[data-sidebar-windowed-item]').length > 500);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForFunction(() => {
        const root = document.querySelector('[data-ribbon-sidebar-root]');
        const viewport = root.closest('[data-sidebar="content"]').getBoundingClientRect();
        return ![...root.querySelectorAll('[data-sidebar-windowed-item]:empty')].some((node) => {
          const box = node.getBoundingClientRect();
          return box.height > 0 && box.top < viewport.bottom && box.bottom > viewport.top;
        });
      });
      await list.evaluate((root) => {
        const scroller = root.closest('[data-sidebar="content"]');
        window.scrollSamples = { longestGap: 0, blankFrames: 0, frames: 0, running: true };
        window.scrollLongTasks = [];
        window.scrollTaskObserver = new PerformanceObserver((list) => {
          window.scrollLongTasks.push(...list.getEntries().map((entry) => entry.duration));
        });
        window.scrollTaskObserver.observe({ type: "longtask" });
        let previous;
        function sample(now) {
          if (!window.scrollSamples.running) return;
          if (previous !== undefined) window.scrollSamples.longestGap = Math.max(window.scrollSamples.longestGap, now - previous);
          previous = now;
          window.scrollSamples.frames++;
          const viewport = scroller.getBoundingClientRect();
          const blank = [...root.querySelectorAll('[data-sidebar-windowed-item]:empty')].some((node) => {
            const box = node.getBoundingClientRect();
            return box.height > 0 && box.top < viewport.bottom && box.bottom > viewport.top;
          });
          if (blank) window.scrollSamples.blankFrames++;
          requestAnimationFrame((now) => setTimeout(() => sample(now), 0));
        }
        requestAnimationFrame(sample);
      });
      const box = await scroller.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      for (const direction of [1, -1, 1, -1]) {
        for (let step = 0; step < 12; step++) {
          await page.mouse.wheel(0, direction * 600);
          await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        }
      }
      const samples = await page.evaluate(() => {
        window.scrollSamples.running = false;
        window.scrollSamples.longestTask = Math.max(0, ...window.scrollLongTasks);
        window.scrollTaskObserver.disconnect();
        return window.scrollSamples;
      });
      console.log(`sidebar scroll: ${JSON.stringify(samples)}`);
      assert.ok(samples.longestTask < 200, `Scrolling must not block the main thread for 200ms: ${samples.longestTask}ms`);
      assert.equal(samples.blankFrames, 0, `Visible rows must stay populated during scrolling: ${JSON.stringify(samples)}`);
    } finally {
      await context.close();
    }
  } finally {
    await browser.close();
    const cleanup = new Database(join(stack.dataDir, "bb.db"));
    cleanup.prepare("DELETE FROM threads WHERE id GLOB 'thr_scroll_*'").run();
    cleanup.close();
    await stack.restartServer();
  }
}
