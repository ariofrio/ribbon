import assert from "node:assert/strict";
import { join } from "node:path";
import { FEATURED_THREAD } from "../../screenshots/fixture.mjs";
import { launch, openContext, sidebar } from "./sidebar.mjs";

export async function verifySidebarScroll({ stack, fixture, cases = ["long-list"] }) {
  for (const testCase of cases) {
    await verifyList({ stack, fixture, nested: testCase === "nested-list", drag: testCase === "scrollbar-drag" });
  }
}

async function verifyList({ stack, fixture, nested, drag }) {
  const { default: Database } = await import("better-sqlite3");
  // Real rows, all in one group, without starting hundreds of agent turns.
  const db = new Database(join(stack.dataDir, "bb.db"));
  const template = db.prepare("SELECT * FROM threads WHERE id = ?").get(fixture.threads.get(FEATURED_THREAD).id);
  const columns = Object.keys(template);
  const insert = db.prepare(`INSERT INTO threads (${columns.map((key) => `"${key}"`).join(",")}) VALUES (${columns.map(() => "?").join(",")})`);
  db.transaction(() => {
    for (let index = 0; index < 600; index++) {
      const thread = { ...template, id: `thr_scroll_${index}`, title: `Scroll test thread ${index}`, parent_thread_id: nested && index % 4 !== 0 ? `thr_scroll_${index - index % 4}` : null };
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
      page.setDefaultTimeout(120_000);
      page.on("pageerror", (error) => console.error(error.message));
      const cdp = await context.newCDPSession(page);
      await page.goto(`${stack.serverUrl}${template.project_id ? `/projects/${template.project_id}` : ""}/threads/${template.id}`);
      const list = sidebar(page);
      await list.waitFor({ timeout: 300_000 });
      // BB loads other plugin frontends after the sidebar is ready. Their
      // late stylesheets restyle the whole page and are startup work.
      await page.waitForLoadState("networkidle", { timeout: 300_000 });
      const scroller = list.locator('xpath=ancestor::*[@data-sidebar="content"]');
      console.log("sidebar fixture", await list.evaluate((root, nested) => ({
        kind: nested ? "nested" : "flat",
        wrappers: root.querySelectorAll("[data-sidebar-windowed-item]").length,
      }), nested));
      await page.waitForFunction((nested) =>
        document.querySelector('[data-ribbon-sidebar-root]')?.querySelectorAll('[data-sidebar-windowed-item]').length > (nested ? 140 : 500), nested);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForFunction(() => {
        const root = document.querySelector('[data-ribbon-sidebar-root]');
        const viewport = root.closest('[data-sidebar="content"]').getBoundingClientRect();
        return ![...root.querySelectorAll('[data-sidebar-windowed-item]:empty')].some((node) => {
          const box = node.getBoundingClientRect();
          return box.height > 0 && box.top < viewport.bottom && box.bottom > viewport.top;
        });
      });
      if (drag) {
        await page.addStyleTag({ content: `
          [data-sidebar="content"] { scrollbar-width: auto; scrollbar-gutter: stable; }
          [data-sidebar="content"]::-webkit-scrollbar { width: 12px; }
          [data-sidebar="content"]::-webkit-scrollbar-thumb { background: #888; }
        ` });
        assert.ok(await scroller.evaluate((node) => node.offsetWidth - node.clientWidth >= 10),
          "The native scrollbar must be visible for pointer dragging");
      }
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
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
        for (let step = 0; step < 45; step++) {
          await page.mouse.wheel(0, direction * 600);
        }
      }
      if (drag) {
        await scroller.evaluate((node) => { node.scrollTop = 0; });
        const height = await scroller.evaluate((node) => node.scrollHeight);
        const thumb = box.height * box.height / height;
        const x = box.x + box.width - 6;
        await page.mouse.move(x, box.y + thumb / 2);
        await page.mouse.down();
        await page.mouse.move(x, box.y + box.height - thumb / 2, { steps: 30 });
        await page.mouse.up();
        await page.waitForFunction(() => {
          const node = document.querySelector('[data-ribbon-sidebar-root]').closest('[data-sidebar="content"]');
          return node.scrollTop > (node.scrollHeight - node.clientHeight) * 0.9;
        });
        await page.mouse.down();
        await page.mouse.move(x, box.y + thumb / 2, { steps: 30 });
        await page.mouse.up();
        await page.waitForFunction(() =>
          document.querySelector('[data-ribbon-sidebar-root]').closest('[data-sidebar="content"]').scrollTop < 10);
      }
      const distance = await scroller.evaluate((node) => node.scrollHeight);
      for (const direction of [-1, 1, -1, 1]) {
        await cdp.send("Input.synthesizeScrollGesture", {
          x: box.x + box.width / 2,
          y: box.y + box.height / 2,
          yDistance: direction * distance,
          speed: 24_000,
          gestureSourceType: "mouse",
        });
      }
      for (let pass = 0; pass < 4; pass++) {
        await scroller.evaluate((node) => { node.scrollTop = node.scrollHeight; });
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
        await scroller.evaluate((node) => { node.scrollTop = 0; });
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
      }
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const samples = await page.evaluate(() => {
        window.scrollSamples.running = false;
        window.scrollSamples.longestTask = Math.max(0, ...window.scrollLongTasks);
        window.scrollTaskObserver.disconnect();
        return window.scrollSamples;
      });
      console.log(`sidebar scroll (${nested ? "nested" : drag ? "scrollbar" : "flat"}): ${JSON.stringify(samples)}`);
      assert.ok(samples.longestGap < 200, `Scrolling must deliver frames within 200ms: ${JSON.stringify(samples)}`);
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
