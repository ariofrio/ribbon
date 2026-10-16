import assert from "node:assert/strict";
import { join } from "node:path";
import { FEATURED_THREAD } from "../../screenshots/fixture.mjs";
import { launch, openContext, sidebar } from "./sidebar.mjs";
import {
  startSidebarScrollSampling,
  stopSidebarScrollSampling,
} from "./sidebar-scroll-samples.mjs";

export async function verifySidebarScroll({
  stack,
  fixture,
  cases = ["long-list"],
}) {
  const errors = [];
  for (const testCase of cases) {
    try {
      await verifyList({
        stack,
        fixture,
        nested: testCase === "nested-list",
        drag: testCase === "scrollbar-drag",
        size: testCase.includes("scalability") ? 9600 : 600,
        completed: testCase === "completed-scalability",
      });
    } catch (error) {
      errors.push(error);
      console.error(testCase, error.message);
    }
  }
  if (errors.length)
    throw new AggregateError(errors, "Scrolling regression failed");
}

async function verifyList({ stack, fixture, nested, drag, size, completed }) {
  const { default: Database } = await import("better-sqlite3");
  // Real rows, all in one group, without starting hundreds of agent turns.
  const db = new Database(join(stack.dataDir, "bb.db"));
  const template = db
    .prepare("SELECT * FROM threads WHERE id = ?")
    .get(fixture.threads.get(FEATURED_THREAD).id);
  const columns = Object.keys(template);
  const insert = db.prepare(
    `INSERT INTO threads (${columns.map((key) => `"${key}"`).join(",")}) VALUES (${columns.map(() => "?").join(",")})`,
  );
  db.transaction(() => {
    for (let index = 0; index < size; index++) {
      const thread = {
        ...template,
        id: `thr_scroll_${index}`,
        title: `Scroll test thread ${index}`,
        parent_thread_id:
          nested && index % 4 !== 0
            ? `thr_scroll_${index - (index % 4)}`
            : null,
      };
      insert.run(...columns.map((key) => thread[key]));
    }
  })();
  db.close();
  if (completed) {
    const placement = new Database(
      join(stack.dataDir, "plugins/thread-stages/data.db"),
    );
    placement.transaction(() => {
      const assign = placement.prepare(
        "INSERT OR REPLACE INTO group_assignment(grouping_key,thread_id,group_id,entered_at_ms,previous_group_id,origin) VALUES('plugin:thread-stages:stages',?,'Completed',?,NULL,'cli')",
      );
      for (let index = 0; index < size; index++)
        assign.run(`thr_scroll_${index}`, Date.now());
      placement
        .prepare(
          "UPDATE grouping_revision SET revision=revision+1 WHERE grouping_key='plugin:thread-stages:stages'",
        )
        .run();
    })();
    placement.close();
  }
  await stack.restartServer();
  const browser = await launch({ scrollbars: drag });
  try {
    const context = await openContext(browser, {
      viewport: { width: 1280, height: 800 },
    });
    try {
      const page = await context.newPage();
      page.setDefaultTimeout(120_000);
      page.on("pageerror", (error) => console.error(error.message));
      const cdp = await context.newCDPSession(page);
      await page.goto(
        `${stack.serverUrl}${template.project_id ? `/projects/${template.project_id}` : ""}/threads/${template.id}`,
      );
      const list = sidebar(page);
      await list.waitFor({ timeout: 300_000 });
      // BB loads other plugin frontends after the sidebar is ready. Their
      // late stylesheets restyle the whole page and are startup work.
      await page.waitForLoadState("networkidle", { timeout: 300_000 });
      const scroller = list.locator(
        'xpath=ancestor::*[@data-sidebar="content"]',
      );
      console.log(
        "sidebar fixture",
        await list.evaluate(
          (root, nested) => ({
            kind: nested ? "nested" : "flat",
            wrappers: root.querySelectorAll("[data-sidebar-windowed-item]")
              .length,
          }),
          nested,
        ),
      );
      if (completed) {
        const reveal = list.getByRole("button", {
          name: /Show \d+ more completed/,
        });
        await reveal.focus();
        await page.keyboard.press("Enter");
        await list
          .getByRole("button", { name: "Show fewer completed" })
          .waitFor();
        assert.ok(
          await list.evaluate(
            (root) =>
              root.contains(document.activeElement) &&
              document.activeElement.matches("a[data-sidebar-thread-id]"),
          ),
          "Keyboard expansion focuses a newly revealed row",
        );
      }
      // Parent slots can represent many children, so mounted wrapper counts
      // cannot establish that the long fixture is ready. Wait for its rendered
      // scroll extent, then check the actual visible content below.
      await page.waitForFunction((size) => {
        const root = document.querySelector("[data-ribbon-sidebar-root]");
        return (
          root.closest('[data-sidebar="content"]').scrollHeight >= size * 20
        );
      }, size);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForFunction(() => {
        const root = document.querySelector("[data-ribbon-sidebar-root]");
        const viewport = root
          .closest('[data-sidebar="content"]')
          .getBoundingClientRect();
        return ![
          ...root.querySelectorAll(
            "[data-sidebar-windowed-item]:empty, [data-sidebar-windowed-chunk-empty]",
          ),
        ].some((node) => {
          const box = node.getBoundingClientRect();
          return (
            box.height > 0 &&
            box.top < viewport.bottom &&
            box.bottom > viewport.top
          );
        });
      });
      if (drag) {
        await page.addStyleTag({
          content: `
          [data-sidebar="content"] { scrollbar-width: auto !important; scrollbar-gutter: stable !important; }
          [data-sidebar="content"]::-webkit-scrollbar { width: 12px !important; display: block !important; }
          [data-sidebar="content"]::-webkit-scrollbar-button { display: none !important; }
          [data-sidebar="content"]::-webkit-scrollbar-thumb { background: #888; }
        `,
        });
        await scroller.evaluate((node) => {
          node.style.setProperty("scrollbar-width", "auto", "important");
          node.style.setProperty("scrollbar-color", "auto", "important");
          node.style.setProperty("scrollbar-gutter", "stable", "important");
        });
        assert.ok(
          await scroller.evaluate(
            (node) =>
              parseFloat(getComputedStyle(node, "::-webkit-scrollbar").width) >=
                10 &&
              getComputedStyle(node, "::-webkit-scrollbar").display !== "none",
          ),
          "The native scrollbar must be visible for pointer dragging",
        );
      }
      const large = size > 600;
      const heap = async () => {
        await cdp.send("HeapProfiler.collectGarbage");
        return (await cdp.send("Runtime.getHeapUsage")).usedSize / 1048576;
      };
      const beforeHeap = large ? await heap() : undefined;
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: large ? 1 : 4 });
      await list.evaluate(startSidebarScrollSampling);
      const box = await scroller.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      for (const direction of [1, -1, 1, -1]) {
        for (let step = 0; step < 45; step++) {
          await page.mouse.wheel(0, direction * 600);
        }
      }
      if (drag) {
        await page.evaluate(() => (window.scrollSamples.phase = "scrollbar"));
        await scroller.evaluate((node) => {
          node.scrollTop = 0;
        });
        const height = await scroller.evaluate((node) => node.scrollHeight);
        const thumb = (box.height * box.height) / height;
        const gutter = await scroller.evaluate(
          (node) => node.offsetWidth - node.clientWidth,
        );
        // Classic scrollbars share the right edge with the sidebar's resize
        // handle. Overlay scrollbars have no gutter and a narrower hit area.
        const x = box.x + box.width - (gutter > 0 ? gutter * 0.75 : 6);
        console.log("scrollbar geometry", { gutter, x, thumb, box });
        await page.mouse.move(x, box.y + Math.min(8, thumb / 2));
        await page.mouse.down();
        await page.mouse.move(x, box.y + box.height - 1, { steps: 30 });
        await page.mouse.up();
        console.log(
          "scrollbar drag down",
          await scroller.evaluate((node) => ({
            scrollTop: node.scrollTop,
            maximum: node.scrollHeight - node.clientHeight,
            width: node.offsetWidth,
          })),
        );
        await page.waitForFunction(() => {
          const node = document
            .querySelector("[data-ribbon-sidebar-root]")
            .closest('[data-sidebar="content"]');
          return node.scrollHeight - node.clientHeight - node.scrollTop < 2;
        });
        const returnGrip = await scroller.evaluate((node) => {
          const height =
            (node.clientHeight * node.clientHeight) / node.scrollHeight;
          return (
            (node.scrollTop / (node.scrollHeight - node.clientHeight)) *
              (node.clientHeight - height) +
            height / 2
          );
        });
        await page.mouse.move(x, box.y + returnGrip);
        await page.mouse.down();
        await page.mouse.move(x, box.y + 1, { steps: 30 });
        await page.mouse.up();
        console.log(
          "scrollbar drag up",
          await scroller.evaluate((node) => ({
            scrollTop: node.scrollTop,
            maximum: node.scrollHeight - node.clientHeight,
          })),
        );
        await page.waitForFunction(
          () =>
            document
              .querySelector("[data-ribbon-sidebar-root]")
              .closest('[data-sidebar="content"]').scrollTop < 10,
        );
      }
      await page.evaluate(() => (window.scrollSamples.phase = "native"));
      const distance = await scroller.evaluate((node) => node.scrollHeight);
      for (const direction of [-1, 1, -1, 1]) {
        await cdp.send("Input.synthesizeScrollGesture", {
          x: box.x + box.width / 2,
          y: box.y + box.height / 2,
          yDistance: direction * distance,
          speed: Math.max(24_000, Math.ceil(distance / 2)),
          gestureSourceType: "mouse",
        });
      }
      await page.evaluate(() => (window.scrollSamples.phase = "jumps"));
      for (let pass = 0; pass < 4; pass++) {
        await scroller.evaluate((node) => {
          node.scrollTop = node.scrollHeight;
        });
        await page.evaluate(
          () => new Promise((resolve) => requestAnimationFrame(resolve)),
        );
        await scroller.evaluate((node) => {
          node.scrollTop = 0;
        });
        await page.evaluate(
          () => new Promise((resolve) => requestAnimationFrame(resolve)),
        );
      }
      await page.evaluate(
        () =>
          new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          ),
      );
      const samples = await page.evaluate(stopSidebarScrollSampling);
      console.log(
        `sidebar scroll (${completed ? "completed-9600" : large ? "flat-9600" : nested ? "nested" : drag ? "scrollbar" : "flat"}): ${JSON.stringify(samples)}`,
      );
      assert.ok(samples.frames >= 10, "Scrolling must sample actual frames");
      assert.ok(
        samples.longestGap <= 200,
        `Scrolling must deliver frames within 200ms: ${JSON.stringify(samples)}`,
      );
      assert.ok(
        samples.longestTask < 200,
        `Scrolling must not block the main thread for 200ms: ${samples.longestTask}ms`,
      );
      assert.equal(
        samples.blankFrames,
        0,
        `Visible rows must stay populated during scrolling: ${JSON.stringify(samples)}`,
      );
      if (large) {
        const afterHeap = await heap();
        const mounted = await list
          .locator("[data-sidebar-windowed-item]")
          .count();
        console.log("sidebar scalability", {
          size,
          completed,
          beforeHeap,
          afterHeap,
          mounted,
        });
        assert.ok(
          afterHeap < 160,
          `9,600 rows must fit in 160MiB JS heap: ${afterHeap}`,
        );
        assert.ok(
          afterHeap - beforeHeap < 32,
          `Traversal must retain less than 32MiB extra heap: ${afterHeap - beforeHeap}`,
        );
        assert.ok(
          mounted < 200,
          `Mounted row count must stay bounded: ${mounted}`,
        );
        // Sample ordinary updates too: scroll-only checks missed the mounted
        // renderer's global subscription work on every title change.
        await list.evaluate(startSidebarScrollSampling);
        try {
          const title = `${template.title} (scroll regression)`;
          fixture.run(["thread", "update", template.id, "--title", title]);
          await page.waitForFunction(
            ({ id, title }) =>
              document
                .querySelector(
                  `[data-ribbon-sidebar-root] [data-thread-id="${id}"]`,
                )
                ?.textContent.includes(title),
            { id: template.id, title },
          );
          await page.evaluate(
            () =>
              new Promise((resolve) =>
                requestAnimationFrame(() => requestAnimationFrame(resolve)),
              ),
          );
          const update = await page.evaluate(stopSidebarScrollSampling);
          console.log("sidebar large title update", {
            size,
            completed,
            ...update,
          });
          assert.ok(
            update.frames >= 2,
            "The title update must sample actual frames",
          );
          assert.equal(
            update.blankFrames,
            0,
            "Title updates must preserve visible rows",
          );
          assert.ok(
            update.longestTask < 200,
            `A title update must not block the client for 200ms: ${update.longestTask}`,
          );
        } finally {
          fixture.run([
            "thread",
            "update",
            template.id,
            "--title",
            template.title,
          ]);
        }
        // A fold used to disable windowing and mount the entire list mid-animation.
        await scroller.evaluate((node) => {
          node.scrollTop = 0;
        });
        const selected = list.locator(
          `a[data-sidebar-thread-id="${template.id}"]`,
        );
        const sectionId = await selected.evaluate(
          (node) =>
            node.closest("[data-sidebar-section-id]").dataset.sidebarSectionId,
        );
        const group = list.locator(`[data-sidebar-section-id="${sectionId}"]`);
        await group.evaluate((root) => {
          window.foldPeak = 0;
          window.foldObserver = new MutationObserver(() => {
            window.foldPeak = Math.max(
              window.foldPeak,
              root.querySelectorAll("[data-sidebar-windowed-item]").length,
            );
          });
          window.foldObserver.observe(root, { childList: true, subtree: true });
        });
        await group
          .getByRole("button", { name: /^Collapse .* section$/ })
          .click();
        await page.waitForFunction(
          (id) => {
            const root = document.querySelector(
              `[data-ribbon-sidebar-root] [data-sidebar-section-id="${id}"]`,
            );
            return (
              root.querySelectorAll("a[data-sidebar-thread-id]").length === 1 &&
              root
                .getAnimations({ subtree: true })
                .every(
                  (a) =>
                    a.effect.getTiming().iterations === Infinity ||
                    a.playState === "finished",
                )
            );
          },
          sectionId,
          { timeout: 10_000 },
        );
        const peak = await page.evaluate(() => {
          window.foldObserver.disconnect();
          return window.foldPeak;
        });
        console.log("sidebar large fold", { size, completed, peak });
        assert.ok(
          peak < 200,
          `Folding must preserve the bounded window: ${peak}`,
        );
        assert.equal(
          await selected.count(),
          1,
          "The selected row survives folding exactly once",
        );
        await group
          .getByRole("button", { name: /^Expand .* section$/ })
          .click();
        await selected.waitFor({ state: "visible" });
      }
    } finally {
      await context.close();
    }
  } finally {
    await browser.close();
    const cleanup = new Database(join(stack.dataDir, "bb.db"));
    cleanup.prepare("DELETE FROM threads WHERE id GLOB 'thr_scroll_*'").run();
    cleanup.close();
    if (completed) {
      const placement = new Database(
        join(stack.dataDir, "plugins/thread-stages/data.db"),
      );
      placement
        .prepare(
          "DELETE FROM group_assignment WHERE thread_id GLOB 'thr_scroll_*'",
        )
        .run();
      placement.close();
    }
    await stack.restartServer();
  }
}
