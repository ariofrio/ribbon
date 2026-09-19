import assert from "node:assert/strict";
import { chromium } from "playwright";
import {
  FEATURED_PROJECT,
  FEATURED_THREAD,
} from "../../screenshots/fixture.mjs";

export async function verifyThreadReordering({ stack, fixture }) {
  const browser = await chromium.launch({ args: ["--mute-audio"] });
  let releaseSave = () => {};
  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
    });
    await context.addInitScript(() => {
      localStorage.setItem(
        "bb.sidebar.threadListProvider",
        JSON.stringify("ribbon-sidebar/ribbon-sidebar"),
      );
      localStorage.setItem(
        "bb.plugin.ribbon-sidebar.preferences.v1",
        JSON.stringify({
          view: {
            scope: { kind: "all" },
            groupingKey: "builtin:projects",
            sort: "manual",
          },
          collapsed: [],
        }),
      );
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => console.error("Browser error:", error));
    const thread = fixture.threads.get(FEATURED_THREAD);
    const project = fixture.projects.get(FEATURED_PROJECT);
    await page.goto(
      new URL(`/projects/${project.id}/threads/${thread.id}`, stack.serverUrl)
        .href,
    );
    const sidebar = page.locator(
      "[data-ribbon-sidebar-root][data-ribbon-sidebar-ready]",
    );
    await sidebar.waitFor({ timeout: 120_000 });
    const group = sidebar.getByRole("region", {
      name: `${FEATURED_PROJECT} group`,
      exact: true,
    });
    const rows = group.locator("li[data-thread-id]");
    const original = await rows.evaluateAll((nodes) =>
      nodes.map((node) => node.dataset.threadId),
    );
    assert.ok(original.length >= 2);
    const source = group.locator(`a[data-sidebar-thread-id="${original[0]}"]`);
    const target = group.locator(`a[data-sidebar-thread-id="${original[1]}"]`);
    const sourceBox = await source.boundingBox();
    const targetBox = await target.boundingBox();
    const url = page.url();
    const saveGate = new Promise((resolve) => {
      releaseSave = resolve;
    });
    await page.route(
      "**/rpc/updatePlacementV1",
      async (route) => {
        await saveGate;
        await route.continue();
      },
      { times: 1 },
    );
    const saved = page.waitForResponse((response) =>
      response.url().endsWith("/rpc/updatePlacementV1"),
    );
    await page.mouse.move(sourceBox.x + 60, sourceBox.y + sourceBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      sourceBox.x + 66,
      sourceBox.y + sourceBox.height / 2,
      { steps: 3 },
    );
    const chip = page.locator("[data-ribbon-thread-drag-overlay]");
    await chip.waitFor({ timeout: 5000 });
    const preview = sidebar.locator("[data-ribbon-thread-drop-preview]");
    const expectOriginalPreview = async () => {
      await preview.waitFor();
      const box = await preview.boundingBox();
      assert.ok(
        box.height >= 24 && Math.abs(box.y - sourceBox.y) <= 1,
        "the placeholder occupies the source row's original position",
      );
    };
    await expectOriginalPreview();
    assert.ok(
      await chip.evaluate((node) => {
        const style = getComputedStyle(node);
        return (
          node.getBoundingClientRect().height >= 24 &&
          style.visibility === "visible" &&
          style.pointerEvents === "none"
        );
      }),
    );
    await page.mouse.move(
      targetBox.x + 60,
      targetBox.y + targetBox.height - 3,
      { steps: 10 },
    );
    await preview.waitFor();
    assert.ok(
      await preview.evaluate(
        (node) => node.getBoundingClientRect().height >= 24,
      ),
    );
    await page.mouse.move(sourceBox.x + 60, sourceBox.y + sourceBox.height / 2);
    await expectOriginalPreview();
    const movedTargetBox = await target.boundingBox();
    await page.mouse.move(
      movedTargetBox.x + 60,
      movedTargetBox.y + movedTargetBox.height - 3,
    );
    await preview.waitFor();
    await page.mouse.up();
    await page.waitForFunction(
      ({ first, second }) => {
        const nodes = [
          ...document.querySelectorAll(
            "[data-ribbon-sidebar-root] li[data-thread-id]",
          ),
        ];
        return (
          nodes.findIndex((n) => n.dataset.threadId === second) <
          nodes.findIndex((n) => n.dataset.threadId === first)
        );
      },
      { first: original[0], second: original[1] },
    );
    await source.waitFor();
    assert.equal(
      await source.evaluate(
        (node) => getComputedStyle(node.closest("li")).opacity,
      ),
      "1",
    );
    await preview.waitFor({ state: "hidden" });
    releaseSave();
    assert.ok((await saved).ok());
    assert.equal(page.url(), url, "dropping a thread must not open it");
    await page.reload();
    await sidebar.waitFor({ timeout: 120_000 });
    const reordered = await rows.evaluateAll((nodes) =>
      nodes.map((node) => node.dataset.threadId),
    );
    assert.ok(
      reordered.indexOf(original[1]) < reordered.indexOf(original[0]),
      "order survives reload",
    );

    // Escape restores the source and leaves the persisted order alone.
    const cancelBox = await target.boundingBox();
    await page.mouse.move(cancelBox.x + 60, cancelBox.y + cancelBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(cancelBox.x + 70, cancelBox.y + cancelBox.height / 2);
    await chip.waitFor();
    assert.equal(page.url(), url, "cancel drag start must not navigate");
    await page.keyboard.press("Escape");
    assert.equal(page.url(), url, "Escape must not navigate");
    await page.mouse.up();
    await chip.waitFor({ state: "hidden" });
    await group.locator(`a[data-sidebar-thread-id="${original[0]}"]`).waitFor();
    assert.deepEqual(
      await rows.evaluateAll((nodes) =>
        nodes.map((node) => node.dataset.threadId),
      ),
      reordered,
    );

    assert.equal(page.url(), url, "cancel must not navigate");

    // Keyboard users use the same row and preview, with no extra drag handle.
    await target.focus();
    await page.keyboard.press("Space");
    await chip.waitFor();
    assert.equal(page.url(), url, "keyboard start must not navigate");
    await page.keyboard.press("ArrowDown");
    await page.waitForFunction((threadId) => {
      const row = document.querySelector(
        `[data-ribbon-sidebar-root] li[data-thread-id="${threadId}"]`,
      );
      const marker = row
        ?.closest("section")
        ?.querySelector("[data-ribbon-thread-drop-preview]");
      return (
        row &&
        marker &&
        marker.getBoundingClientRect().top >= row.getBoundingClientRect().bottom
      );
    }, original[0]);
    assert.equal(page.url(), url, "keyboard move must not navigate");
    const keyboardSaved = page.waitForResponse((response) =>
      response.url().endsWith("/rpc/updatePlacementV1"),
    );
    await page.keyboard.press("Space");
    await chip.waitFor({ state: "hidden" });
    assert.ok((await keyboardSaved).ok());
    await page.waitForFunction(
      ({ first, second }) => {
        const nodes = [
          ...document.querySelectorAll(
            "[data-ribbon-sidebar-root] li[data-thread-id]",
          ),
        ];
        return (
          nodes.findIndex((n) => n.dataset.threadId === first) <
          nodes.findIndex((n) => n.dataset.threadId === second)
        );
      },
      { first: original[0], second: original[1] },
    );
    assert.equal(page.url(), url);

    // Long-press touch uses the same drop preview and persists the new position.
    await page.reload();
    await sidebar.waitFor({ timeout: 120_000 });
    const touchSource = await target.boundingBox();
    const touchTarget = await source.boundingBox();
    const cdp = await context.newCDPSession(page);
    await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [
        { x: touchSource.x + 60, y: touchSource.y + touchSource.height / 2 },
      ],
    });
    await chip.waitFor();
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: touchTarget.x + 60, y: touchTarget.y + 3 }],
    });
    await preview.waitFor();
    const touchSaved = page.waitForResponse((response) =>
      response.url().endsWith("/rpc/updatePlacementV1"),
    );
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    assert.ok((await touchSaved).ok());
    await chip.waitFor({ state: "hidden" });
    await page.reload();
    await sidebar.waitFor({ timeout: 120_000 });
    const touchOrder = await rows.evaluateAll((nodes) =>
      nodes.map((node) => node.dataset.threadId),
    );
    assert.ok(
      touchOrder.indexOf(original[1]) < touchOrder.indexOf(original[0]),
    );
    assert.equal(page.url(), url);
    await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: false });

    // A group title inserts first, including after moving down and back up.
    const header = group.locator('[data-sidebar="group-label"]');
    const headerSource = await source.boundingBox();
    await page.mouse.move(
      headerSource.x + 60,
      headerSource.y + headerSource.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      headerSource.x + 70,
      headerSource.y + headerSource.height / 2,
    );
    await chip.waitFor();
    const lastRow = await rows.last().boundingBox();
    await page.mouse.move(lastRow.x + 60, lastRow.y + lastRow.height - 3);
    await preview.waitFor();
    const headerBox = await header.boundingBox();
    await page.mouse.move(headerBox.x + 60, headerBox.y + headerBox.height + 2);
    const expectHeaderPreview = () =>
      page.waitForFunction((groupName) => {
        const section = document.querySelector(
          `[data-ribbon-sidebar-root] section[aria-label="${groupName}"]`,
        );
        const heading = section?.querySelector('[data-sidebar="group-label"]');
        const marker = section?.querySelector(
          "[data-ribbon-thread-drop-preview]",
        );
        const firstRow = [
          ...(section?.querySelectorAll("li[data-thread-id]") ?? []),
        ].find((node) => getComputedStyle(node).opacity !== "0");
        if (!heading || !marker || !firstRow) return false;
        const markerBox = marker.getBoundingClientRect();
        return (
          markerBox.height >= 24 &&
          markerBox.top >= heading.getBoundingClientRect().bottom &&
          markerBox.bottom <= firstRow.getBoundingClientRect().top
        );
      }, `${FEATURED_PROJECT} group`);
    await expectHeaderPreview();
    await page.mouse.move(headerBox.x + 60, headerBox.y + headerBox.height / 2);
    await expectHeaderPreview();
    // The space beneath the heading, including the preview itself, inserts first.
    const firstVisibleRow = await rows.evaluateAll(
      (nodes) =>
        nodes
          .find((node) => getComputedStyle(node).opacity !== "0")
          .getBoundingClientRect().top,
    );
    for (const y of [headerBox.y + headerBox.height + 2, firstVisibleRow - 2]) {
      await page.mouse.move(headerBox.x + 60, y);
      await expectHeaderPreview();
    }
    const headerSaved = page.waitForResponse((response) =>
      response.url().endsWith("/rpc/updatePlacementV1"),
    );
    await page.mouse.up();
    assert.ok((await headerSaved).ok());
    await page.reload();
    await sidebar.waitFor({ timeout: 120_000 });
    assert.equal(
      await rows.first().getAttribute("data-thread-id"),
      original[0],
      "dropping on the group title persists the first position",
    );

    // The margin between groups belongs to the end of the preceding group.
    const gapGroup = sidebar.locator("section");
    const gapSection = await gapGroup.evaluateAll((sections) => {
      const section = sections.find(
        (node) =>
          node.getAttribute("aria-label") !== "Pinned threads" &&
          node.nextElementSibling?.matches("section") &&
          node.querySelectorAll("li[data-thread-id]").length >= 2,
      );
      return section?.getAttribute("aria-label");
    });
    assert.ok(
      gapSection,
      "fixture contains adjacent groups with reorderable threads",
    );
    const preceding = sidebar.getByRole("region", {
      name: gapSection,
      exact: true,
    });
    const gapSource = preceding.locator("a[data-sidebar-thread-id]").first();
    await gapSource.scrollIntoViewIfNeeded();
    const gapSourceId = await gapSource.getAttribute("data-sidebar-thread-id");
    const gapSourceBox = await gapSource.boundingBox();
    await page.mouse.move(
      gapSourceBox.x + 60,
      gapSourceBox.y + gapSourceBox.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      gapSourceBox.x + 70,
      gapSourceBox.y + gapSourceBox.height / 2,
    );
    await chip.waitFor();
    const gap = await preceding.evaluate((node) => {
      const box = node.getBoundingClientRect();
      const next = node.nextElementSibling.getBoundingClientRect();
      return {
        x: box.x + 60,
        y: (box.bottom + next.top) / 2,
        size: next.top - box.bottom,
      };
    });
    assert.ok(gap.size > 0);
    await page.mouse.move(gap.x, gap.y);
    await preview.waitFor();
    assert.ok(
      await preceding
        .locator("[data-ribbon-thread-drop-preview]")
        .evaluate((node) => {
          const box = node.getBoundingClientRect();
          const rows = [
            ...node.closest("section").querySelectorAll("li[data-thread-id]"),
          ].filter((row) => getComputedStyle(row).opacity !== "0");
          return (
            box.height >= 24 &&
            box.top >= rows.at(-1).getBoundingClientRect().bottom
          );
        }),
      "gap drop preview follows the last thread",
    );
    const gapSaved = page.waitForResponse((response) =>
      response.url().endsWith("/rpc/updatePlacementV1"),
    );
    await page.mouse.up();
    assert.ok((await gapSaved).ok());
    await page.reload();
    await sidebar.waitFor({ timeout: 120_000 });
    assert.equal(
      await preceding
        .locator("li[data-thread-id]")
        .last()
        .getAttribute("data-thread-id"),
      gapSourceId,
    );
  } finally {
    releaseSave();
    await browser.close();
  }
}

export async function verifyHeadingBoundary({ stack, fixture }) {
  const browser = await chromium.launch({ args: ["--mute-audio"] });
  const movedThreads = [...fixture.threads.values()].slice(-7);
  let section;
  try {
    section = fixture.runJson(["thread", "section", "create", "Boundary"]);
    for (const thread of movedThreads) {
      fixture.run(["thread", "update", thread.id, "--section", section.id]);
    }
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
    });
    await context.addInitScript(() => {
      localStorage.setItem(
        "bb.sidebar.threadListProvider",
        JSON.stringify("ribbon-sidebar/ribbon-sidebar"),
      );
      localStorage.setItem(
        "bb.plugin.ribbon-sidebar.preferences.v1",
        JSON.stringify({
          view: {
            scope: { kind: "all" },
            groupingKey: "builtin:sections",
            sort: "manual",
          },
          collapsed: [],
        }),
      );
    });
    const page = await context.newPage();
    await page.goto(stack.serverUrl);
    const sidebar = page.locator(
      "[data-ribbon-sidebar-root][data-ribbon-sidebar-ready]",
    );
    await sidebar.waitFor({ timeout: 120_000 });
    const chip = page.locator("[data-ribbon-thread-drag-overlay]");
    // Re-test at a fixed height as the preview changes the group layout.
    const following = sidebar.getByRole("region", {
      name: "Boundary group",
      exact: true,
    });
    const preceding = following.locator("xpath=preceding-sibling::section[1]");
    for (const scenario of [
      "from-above",
      "from-below",
      "scrolled",
      "collapsed",
    ]) {
      if (scenario === "scrolled")
        await page.setViewportSize({ width: 1280, height: 400 });
      if (scenario === "collapsed") {
        await page.setViewportSize({ width: 1280, height: 900 });
        await page.reload();
        await sidebar.waitFor({ timeout: 120_000 });
        await following
          .getByRole("button", { name: "Collapse Boundary section" })
          .focus();
        await page.keyboard.press("Enter");
        await following
          .getByRole("button", { name: "Expand Boundary section" })
          .waitFor();
      }
      const boundarySource =
        scenario === "scrolled"
          ? following.locator("a[data-sidebar-thread-id]").last()
          : (scenario === "from-below" ? following : preceding)
              .locator("a[data-sidebar-thread-id]")
              .first();
      await boundarySource.hover();
      const boundaryBox = await boundarySource.boundingBox();
      await page.mouse.move(
        boundaryBox.x + 60,
        boundaryBox.y + boundaryBox.height / 2,
      );
      await page.mouse.down();
      await page.mouse.move(
        boundaryBox.x + 70,
        boundaryBox.y + boundaryBox.height / 2,
      );
      await chip.waitFor();
      const offsets = [
        ...Array.from({ length: 13 }, (_, index) => -20 + index * 2),
        ...Array.from({ length: 13 }, (_, index) => 4 - index * 2),
      ];
      for (const offset of offsets) {
        const liveHeader = await following
          .locator('[data-sidebar="group-label"]')
          .boundingBox();
        const pointerY = liveHeader.y + offset;
        if (pointerY < 0 || pointerY >= page.viewportSize().height) continue;
        await page.mouse.move(liveHeader.x + 60, liveHeader.y + offset);
        const placements = [];
        for (let sample = 0; sample < 16; sample++) {
          await page.mouse.move(
            liveHeader.x + 60 + (sample % 2),
            liveHeader.y + offset,
          );
          placements.push(
            await page.evaluate(() => {
              const preview = document.querySelector(
                "[data-ribbon-sidebar-root] [data-ribbon-thread-drop-preview]",
              );
              const group = preview?.closest("section");
              const rows = [
                ...(group?.querySelectorAll("li[data-thread-id]") ?? []),
              ].filter((row) => getComputedStyle(row).opacity !== "0");
              const before = rows.find(
                (row) =>
                  preview.compareDocumentPosition(row) &
                  Node.DOCUMENT_POSITION_FOLLOWING,
              );
              let scrollOffset = 0;
              for (
                let parent = document.querySelector(
                  "[data-ribbon-sidebar-root]",
                );
                parent;
                parent = parent.parentElement
              )
                scrollOffset += parent.scrollTop;
              return {
                scrollOffset,
                placement: preview
                  ? `${group.getAttribute("aria-label")}:${before?.dataset.threadId ?? "end"}:${Math.round(preview.getBoundingClientRect().top - group.getBoundingClientRect().top)}`
                  : "none",
              };
            }),
          );
        }
        const transitions = placements.filter(
          (value, index) =>
            index === 0 ||
            value.placement !== placements[index - 1].placement ||
            value.scrollOffset !== placements[index - 1].scrollOffset,
        );
        const oscillates = transitions.some(
          (value, index) =>
            index > 1 &&
            value.scrollOffset === transitions[index - 1].scrollOffset &&
            value.scrollOffset === transitions[index - 2].scrollOffset &&
            value.placement === transitions[index - 2].placement &&
            value.placement !== transitions[index - 1].placement,
        );
        assert.ok(
          !oscillates,
          `drop preview must not oscillate at a fixed pointer height (${scenario}, offset ${offset}, heading ${JSON.stringify(liveHeader)}): ${JSON.stringify(transitions)}`,
        );
      }
      await page.keyboard.press("Escape");
      await page.mouse.up();
      await chip.waitFor({ state: "hidden" });
    }
    await context.close();
  } finally {
    await browser.close();
    if (section) {
      for (const thread of movedThreads) {
        fixture.run([
          "thread",
          "update",
          thread.id,
          "--section",
          fixture.section.id,
        ]);
      }
      fixture.run(["thread", "section", "delete", section.id, "--yes"]);
    }
  }
}
