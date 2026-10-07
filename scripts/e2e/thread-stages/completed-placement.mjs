import assert from "node:assert/strict";
import { FEATURED_THREAD } from "../../screenshots/fixture.mjs";
import { carryTo, dropMarker, launch, link, openContext, pickUp, row, section, sidebar, STAGES } from "./sidebar.mjs";

export async function verifyCompletedPlacement({ stack, fixture }) {
  const returning = fixture.threads.get("Add keyboard navigation to filters");
  const shortcut = fixture.threads.get(FEATURED_THREAD);
  const place = (thread, stage) => fixture.run(["thread-stages", "place", thread.id, "--to", `${STAGES}/${stage}`]);
  const browser = await launch();
  let releaseSave = () => {};
  try {
    const context = await openContext(browser, { viewport: { width: 1280, height: 1000 } });
    context.setDefaultTimeout(20_000);
    context.setDefaultNavigationTimeout(20_000);
    let page = await context.newPage();
    await page.goto(stack.serverUrl);
    const list = sidebar(page);
    await list.waitFor({ timeout: 120_000 });
    let group = section(page, fixture.section.id);
    const completed = group.locator("[data-thread-id]").filter({ has: page.getByLabel("Completed stage", { exact: true }) });
    await group.getByRole("button", { name: "Show 4 more completed", exact: true }).waitFor();
    assert.equal(await completed.count(), 1);
    const gaps = await group.locator("[data-thread-id]").evaluateAll((nodes) =>
      nodes.slice(1).map((node, index) => node.getBoundingClientRect().top - nodes[index].getBoundingClientRect().bottom));
    assert.ok(gaps.every((gap) => Math.abs(gap - gaps[0]) < 0.01), `Stage boundaries must preserve the row spacing: ${gaps}`);
    const more = group.getByRole("button", { name: "Show 4 more completed", exact: true });
    await more.focus();
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => document.activeElement?.matches("a[data-sidebar-thread-id]"));
    const revealed = await page.evaluate(() => document.activeElement.dataset.sidebarThreadId);
    assert.equal(await completed.count(), 5);
    await page.keyboard.press("Enter");
    await page.waitForURL(`**/threads/${revealed}`);
    const fewer = group.getByRole("button", { name: "Show fewer completed", exact: true });
    await fewer.click();
    await group.getByRole("button", { name: "Show 4 more completed", exact: true }).waitFor();
    assert.equal(await completed.count(), 1, "The selected completion replaces a preview row");
    assert.ok(await row(group, revealed).isVisible(), "The selected completion stays visible");
    assert.equal(await page.evaluate(() => document.activeElement?.textContent), "Show 4 more completed");
    await row(group, shortcut.id).locator("a[data-sidebar-thread-id]").click();
    await group.getByRole("button", { name: "Show 4 more completed", exact: true }).waitFor();
    async function first(thread) {
      console.log("Checking first completion:", thread.title);
      await page.waitForFunction(({ id, sectionId }) => {
        const icon = document.querySelector(`[data-ribbon-sidebar-root] [data-sidebar-section-id="${sectionId}"] [aria-label="Completed stage"]`);
        return icon?.closest("[data-thread-id]")?.dataset.threadId === id;
      }, { id: thread.id, sectionId: fixture.section.id });
    }
    place(returning, "Active");
    await row(group, returning.id).getByLabel("Active stage", { exact: true }).waitFor();
    await row(group, returning.id).hover();
    await row(group, returning.id).getByRole("button", { name: "Thread actions", exact: true }).click();
    await page.getByRole("menuitem", { name: /Set stage/ }).hover();
    await page.getByRole("menuitemradio", { name: "Completed", exact: true }).click();
    await first(returning);
    await page.locator('[data-app-composer-role="primary"] [contenteditable="true"]').click();
    const response = page.waitForResponse((response) => /\/rpc\/setWorkflowStage$/.test(response.url()));
    await page.keyboard.press(process.platform === "darwin" ? "Meta+." : "Control+.");
    assert.ok((await response).ok());
    await first(shortcut);
    place(returning, "Active");
    place(returning, "Completed");
    await first(returning);
    const previewRows = (stage) => group.locator("[data-thread-id]").filter({
      has: page.getByLabel(`${stage} stage`, { exact: true }),
    });
    for (const limit of [1, 2, 3, 4, 5]) {
      fixture.run(["plugin", "config", "thread-stages", "set", "stagePreviewRows", String(limit)]);
      await group.getByRole("button", { name: `Show ${7 - limit} more completed`, exact: true }).waitFor();
      assert.equal(await completed.count(), limit - 1);
      assert.equal(await previewRows("Deferred").count(), 1, "A single Deferred thread stays visible at every limit");
    }
    // Move the drawn completions to exercise Deferred's overflow with the same setting.
    const deferredIds = await completed.evaluateAll((nodes) => nodes.map((node) => node.dataset.threadId));
    try {
      for (const id of deferredIds) place({ id }, "Deferred");
      fixture.run(["plugin", "config", "thread-stages", "set", "stagePreviewRows", "3"]);
      const deferredCount = deferredIds.length + 1;
      await group.getByRole("button", { name: `Show ${deferredCount - 2} more deferred`, exact: true }).waitFor();
      assert.equal(await previewRows("Deferred").count(), 2);
      fixture.run(["plugin", "config", "thread-stages", "set", "stagePreviewRows", "1"]);
      const deferredMore = group.getByRole("button", { name: `Show ${deferredCount} more deferred`, exact: true });
      await deferredMore.waitFor();
      assert.equal(await previewRows("Deferred").count(), 0);
      await deferredMore.click();
      assert.equal(await previewRows("Deferred").count(), deferredCount);
      await group.getByRole("button", { name: "Show fewer deferred", exact: true }).click();
      await deferredMore.waitFor();
      assert.equal(await previewRows("Deferred").count(), 0);
    } finally {
      for (const id of deferredIds) place({ id }, "Completed");
    }
    fixture.run(["plugin", "config", "thread-stages", "set", "stagePreviewRows", "2"]);
    place(shortcut, "Active");
    place(shortcut, "Completed");
    place(returning, "Active");
    place(returning, "Completed");
    await group.getByRole("button", { name: "Show 5 more completed", exact: true }).click();
    await first(returning);

    fixture.run(["thread-stages", "place", returning.id, "--to", `${STAGES}/Completed`, "--after", shortcut.id]);
    await first(shortcut);

    const gate = new Promise((resolve) => { releaseSave = resolve; });
    await page.route("**/rpc/updatePlacementV1", async (route) => {
      await gate;
      await route.continue();
    }, { times: 1 });
    const dragged = page.waitForResponse((response) => response.url().endsWith("/rpc/updatePlacementV1"));
    void dragged.catch(() => undefined);
    await pickUp(page, link(group, returning.id));
    await carryTo(page, link(group, shortcut.id), "before");
    await dropMarker(group).waitFor();
    await page.mouse.up();
    await first(returning);
    releaseSave();
    assert.ok((await dragged).ok());

    async function reopen() {
      const url = page.url();
      const next = await context.newPage();
      await page.close({ runBeforeUnload: false });
      page = next;
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await sidebar(page).waitFor({ timeout: 120_000 });
      group = section(page, fixture.section.id);
      await group.getByRole("button", { name: "Show 5 more completed", exact: true }).click();
    }
    await reopen();
    await first(returning);
    await link(group, returning.id).click();
    await page.waitForURL(`**/threads/${returning.id}`);
    await page.locator('[data-app-composer-role="primary"] [contenteditable="true"]').click();
    const reordered = page.waitForResponse((response) => response.url().endsWith("/rpc/reorderThread"));
    await page.keyboard.press(process.platform === "darwin" ? "Alt+Meta+ArrowDown" : "Alt+Control+ArrowDown");
    assert.ok((await reordered).ok());
    await first(shortcut);
    await reopen();
    await first(shortcut);

    const placements = fixture.runJson(["thread-stages", "show", returning.id]);
    const stage = placements.find(({ placement }) => placement.groupingKey === STAGES).placement;
    const completedBefore = stage.enteredAtMs;
    fixture.run(["thread-stages", "place", returning.id, "--to", `${STAGES}/Completed`, "--before", shortcut.id]);
    await first(returning);
    const afterReorder = fixture.runJson(["thread-stages", "show", returning.id])
      .find(({ placement }) => placement.groupingKey === STAGES).placement;
    assert.equal(afterReorder.enteredAtMs, completedBefore, "Reordering must preserve the completion time used by auto-archive");
    await reopen();
    await first(returning);
    await context.close();
  } finally {
    releaseSave();
    fixture.run(["plugin", "config", "thread-stages", "set", "stagePreviewRows", "2"]);
    place(shortcut, "Active");
    place(returning, "Completed");
    await browser.close();
  }
}
