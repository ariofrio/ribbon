import assert from "node:assert/strict";
import { chromium } from "playwright";
import {
  AGENT,
  FEATURED_PROJECT,
  FEATURED_THREAD,
  THREADS,
} from "../../screenshots/fixture.mjs";

export async function verifyDragRegressions({ stack, fixture, cases }) {
  const threads = [...fixture.threads.values()];
  for (const [index, thread] of threads.entries()) {
    fixture.run([
      "sidebar",
      "place",
      thread.id,
      "--to",
      `plugin:thread-stages:stages/${index < 6 ? "Idle" : index < 8 ? "Deferred" : "Completed"}`,
    ]);
  }
  const children = [];
  if (cases.includes("nested")) {
    const project = fixture.projects.get(FEATURED_PROJECT);
    for (const parent of [threads[5], threads[6]]) {
      const child = fixture.runJson([
        "thread",
        "spawn",
        "--project",
        project.id,
        "--machine",
        "screenshots",
        "--environment",
        project.root,
        "--parent-thread",
        parent.id,
        "--provider",
        `acp-${AGENT.id}`,
        "--model",
        AGENT.modelId,
        "--title",
        `Child of ${parent.title}`,
        "--permission-mode",
        "accept-edits",
        "--prompt",
        "Check nested drag behavior.",
      ]);
      fixture.run(["thread", "wait", child.id, "--status", "idle"]);
      children.push(child);
    }
  }
  const browser = await chromium.launch({ args: ["--mute-audio"] });
  let releaseRead = () => {};
  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 1000 },
    });
    await context.addInitScript(() =>
      localStorage.setItem(
        "bb.sidebar.threadListProvider",
        JSON.stringify("ribbon-sidebar/ribbon-sidebar"),
      ),
    );
    const page = await context.newPage();
    page.on("pageerror", (error) =>
      console.error("Browser error", error.message),
    );
    page.setDefaultTimeout(15_000);
    await page.goto(
      new URL(
        `/projects/${fixture.projects.get(FEATURED_PROJECT).id}/threads/${fixture.threads.get(FEATURED_THREAD).id}`,
        stack.serverUrl,
      ).href,
    );
    const sidebar = page.locator("[data-ribbon-sidebar-ready]");
    await sidebar.waitFor({ timeout: 120_000 }).catch(async (error) => {
      console.error(
        "Sidebar readiness",
        await page.locator("body").innerText(),
      );
      throw error;
    });
    const section = sidebar.getByRole("region", {
      name: "Atlas group",
      exact: true,
    });
    const row = (id) => section.locator(`a[data-sidebar-thread-id="${id}"]`);
    // The provider can mount before bb's thread subscription has hydrated.
    // Wait for the rows this scenario needs, not merely the sidebar shell.
    for (const thread of threads.slice(0, 8))
      await row(thread.id).waitFor({ timeout: 120_000 });
    const mainIds = new Set(threads.slice(0, 6).map((t) => t.id));
    const order = async () =>
      (
        await section
          .locator("li[data-thread-id]")
          .evaluateAll((nodes) => nodes.map((n) => n.dataset.threadId))
      ).filter((id) => mainIds.has(id));
    const chip = page.locator("[data-ribbon-thread-drag-overlay]");
    const preview = section.locator("[data-ribbon-thread-drop-preview]");
    async function responsive(action) {
      let timer;
      try {
        return await Promise.race([
          action,
          new Promise((_, reject) => {
            timer = setTimeout(
              () => reject(new Error("Drag must leave the browser responsive")),
              15_000,
            );
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
    }
    async function start(id) {
      const box = await row(id).boundingBox();
      await page.mouse.move(box.x + 80, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + 90, box.y + box.height / 2);
      await chip.waitFor();
    }
    if (cases.includes("preview-stability")) {
      const initial = await order();
      await start(initial.at(-1));
      const target = await row(initial[1]).boundingBox();
      const placements = [];
      for (let index = 0; index < 24; index++) {
        await responsive(
          page.mouse.move(target.x + 80 + (index % 2), target.y + 2),
        );
        await responsive(
          page.evaluate(
            () =>
              new Promise((resolve) =>
                requestAnimationFrame(() => requestAnimationFrame(resolve)),
              ),
          ),
        );
        const rect = await preview.boundingBox();
        placements.push(rect?.y ?? null);
      }
      assert.ok(
        placements.slice(4).every((y) => y !== null),
        "A valid drop must keep a visible preview",
      );
      assert.equal(
        new Set(placements.slice(4)).size,
        1,
        `A stationary pointer must not move the drop preview: ${JSON.stringify(placements)}`,
      );
      await page.keyboard.press("Escape");
      await page.mouse.up();
    }
    if (cases.includes("stage-boundary")) {
      const initial = await order();
      await start(initial[0]);
      const deferred = await row(threads[6].id).boundingBox();
      await page.mouse.move(deferred.x + 80, deferred.y + deferred.height / 2);
      await responsive(
        page.evaluate(
          () =>
            new Promise((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(resolve)),
            ),
        ),
      );
      assert.equal(
        await preview.count(),
        0,
        "A working thread must not advertise insertion into the Deferred list",
      );
      await page.keyboard.press("Escape");
      await page.mouse.up();
    }
    if (cases.includes("stage-placement")) {
      const initial = await order();
      await start(threads[7].id);
      const header = await section
        .locator('[data-sidebar="group-label"]')
        .boundingBox();
      await page.mouse.move(header.x + 80, header.y + header.height / 2);
      await preview.waitFor();
      const lastMain = await row(initial.at(-1)).boundingBox();
      const marker = await preview.boundingBox();
      assert.ok(
        marker.y >= lastMain.y + lastMain.height,
        "Dropping Deferred on a section heading previews the start of Deferred, below working threads",
      );
      await page.keyboard.press("Escape");
      await page.mouse.up();
      for (const thread of threads.slice(8))
        fixture.run([
          "sidebar",
          "place",
          thread.id,
          "--to",
          "plugin:thread-stages:stages/Deferred",
        ]);
      await section
        .getByRole("button", { name: /Show .* more deferred/ })
        .waitFor();
      await start(initial[0]);
      const group = await section
        .getByRole("button", { name: /Show .* more deferred/ })
        .boundingBox();
      await page.mouse.move(group.x + 80, group.y + group.height / 2);
      await preview.waitFor();
      const firstDeferredId = (
        await section
          .locator("li[data-thread-id]")
          .evaluateAll((nodes) => nodes.map((node) => node.dataset.threadId))
      ).find(
        (id) => !mainIds.has(id) && threads.some((thread) => thread.id === id),
      );
      const firstDeferred = await row(firstDeferredId).boundingBox();
      const endMarker = await preview.boundingBox();
      assert.ok(
        endMarker.y + endMarker.height <= firstDeferred.y,
        "A section-end drop of a working thread previews the end of working threads",
      );
      await page.keyboard.press("Escape");
      await page.mouse.up();
    }
    if (cases.includes("stage-placement")) {
      for (const thread of threads.slice(8))
        fixture.run([
          "sidebar",
          "place",
          thread.id,
          "--to",
          "plugin:thread-stages:stages/Completed",
        ]);
    }
    if (cases.includes("nested")) {
      await row(children[0].id).waitFor();
      await row(children[1].id).waitFor();
      const initial = await order();
      await start(threads[5].id);
      await row(children[0].id).waitFor({ state: "hidden" });
      const childBox = await row(children[1].id).boundingBox();
      await responsive(
        page.mouse.move(childBox.x + 80, childBox.y + childBox.height / 2),
      );
      await responsive(
        page.evaluate(
          () =>
            new Promise((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(resolve)),
            ),
        ),
      );
      assert.equal(
        await preview.count(),
        0,
        "Children of another stage must not become section-wide drop targets",
      );
      await page.keyboard.press("Escape");
      await page.mouse.up();
      await row(children[0].id).waitFor();
      assert.deepEqual(await order(), initial);
    }
    if (cases.includes("rapid-reorder")) {
      const initial = await order();
      const first = initial.at(-1);
      const second = initial.at(-2);
      const gate = new Promise((resolve) => {
        releaseRead = resolve;
      });
      await page.route(
        "**/rpc/updatePlacementV1",
        async (route) => {
          await gate;
          await route.continue();
        },
        { times: 1 },
      );
      const saves = [];
      page.on("response", (response) => {
        if (response.url().endsWith("/rpc/updatePlacementV1"))
          saves.push(response);
      });
      async function toTop(id) {
        await start(id);
        const box = await section
          .locator('[data-sidebar="group-label"]')
          .boundingBox();
        await page.mouse.move(box.x + 80, box.y + box.height / 2);
        await preview.waitFor();
        await page.mouse.up();
        await chip.waitFor({ state: "hidden" });
        await page.waitForFunction(
          (id) =>
            document.querySelector(
              '[data-ribbon-sidebar-root] section[aria-label="Atlas group"] li[data-thread-id]',
            )?.dataset.threadId === id,
          id,
        );
      }
      await toTop(first);
      await toTop(second);
      const expected = [
        second,
        first,
        ...initial.filter((id) => id !== first && id !== second),
      ];
      assert.deepEqual(
        await order(),
        expected,
        "Both drops apply immediately before the first save completes",
      );
      releaseRead();
      await page.waitForResponse(async (response) => {
        if (
          !response.url().endsWith("/rpc/listPlacementsV1") ||
          response.request().postDataJSON().groupingKey !==
            "builtin:sections" ||
          saves.length < 2
        )
          return false;
        const body = await response.json();
        return (
          body.result.value.items
            .filter((item) => mainIds.has(item.threadId))
            .map((item) => item.threadId)
            .join() === expected.join()
        );
      });
      for (const response of saves)
        assert.equal((await response.json()).result.ok, true);
      assert.deepEqual(await order(), expected);
      await page.reload();
      await sidebar.waitFor({ timeout: 120_000 });
      assert.deepEqual(
        await order(),
        expected,
        "Successive drops persist in gesture order",
      );
    }
    if (cases.includes("stale-read")) {
      const initial = await order();
      let captured;
      let capturedRevision = -1;
      const readCaptured = new Promise((resolve) => {
        captured = resolve;
      });
      const gate = new Promise((resolve) => {
        releaseRead = resolve;
      });
      let intercepted = false;
      await page.route("**/rpc/listPlacementsV1", async (route) => {
        if (
          intercepted ||
          route.request().postDataJSON().groupingKey !== "builtin:sections"
        ) {
          await route.continue();
          return;
        }
        intercepted = true;
        const response = await route.fetch();
        capturedRevision = (await response.json()).result.value.revision;
        captured();
        await gate;
        await route.fulfill({ response });
      });
      fixture.run([
        "sidebar",
        "place",
        initial[1],
        "--to",
        "plugin:thread-stages:stages/Blocked",
      ]);
      await Promise.race([
        readCaptured,
        new Promise((_, reject) => {
          const timer = setTimeout(
            () => reject(new Error("No pre-drop placement read captured")),
            15_000,
          );
          readCaptured.then(() => clearTimeout(timer));
        }),
      ]);
      const refreshed = page.waitForResponse(async (response) => {
        if (
          !response.url().endsWith("/rpc/listPlacementsV1") ||
          response.request().postDataJSON().groupingKey !== "builtin:sections"
        )
          return false;
        return (await response.json()).result.value.revision > capturedRevision;
      });
      await start(initial.at(-1));
      const header = await section
        .locator('[data-sidebar="group-label"]')
        .boundingBox();
      await page.mouse.move(header.x + 80, header.y + header.height / 2);
      await preview.waitFor();
      const saved = page.waitForResponse((response) =>
        response.url().endsWith("/rpc/updatePlacementV1"),
      );
      await page.mouse.up();
      assert.ok((await saved).ok());
      await page.waitForFunction(
        (id) =>
          document.querySelector(
            '[data-ribbon-sidebar-root] section[aria-label="Atlas group"] li[data-thread-id]',
          )?.dataset.threadId === id,
        initial.at(-1),
      );
      await refreshed;
      await responsive(
        page.evaluate(
          () =>
            new Promise((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(resolve)),
            ),
        ),
      );
      const expected = await order();
      const staleArrived = page.waitForResponse(
        (response) =>
          response.url().endsWith("/rpc/listPlacementsV1") &&
          response.request().postDataJSON().groupingKey === "builtin:sections",
      );
      releaseRead();
      await staleArrived;
      await responsive(
        page.evaluate(
          () =>
            new Promise((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(resolve)),
            ),
        ),
      );
      assert.deepEqual(
        await order(),
        expected,
        "A delayed pre-drop read must not undo the saved drop",
      );
      await page.reload();
      await sidebar.waitFor({ timeout: 120_000 });
      assert.deepEqual(
        await order(),
        expected,
        "The displayed order matches the saved order after reload",
      );
    }
    await context.close();
  } finally {
    releaseRead();
    await browser.close();
    for (const child of children) fixture.run(["thread", "archive", child.id]);
    for (const spec of THREADS)
      if (spec.stage)
        fixture.run([
          "sidebar",
          "place",
          fixture.threads.get(spec.title).id,
          "--to",
          `plugin:thread-stages:stages/${spec.stage}`,
        ]);
  }
}
