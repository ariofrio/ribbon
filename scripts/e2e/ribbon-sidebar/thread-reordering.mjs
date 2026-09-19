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
    await preview.waitFor();
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
    await page.mouse.move(headerBox.x + 60, headerBox.y + headerBox.height / 2);
    await page.waitForFunction((groupName) => {
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
