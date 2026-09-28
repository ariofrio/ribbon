import assert from "node:assert/strict";
import { FEATURED_THREAD } from "../../screenshots/fixture.mjs";
import { launch, openContext, row, section, sidebar, STAGES } from "./sidebar.mjs";

export async function verifyCompletedPlacement({ stack, fixture }) {
  const returning = fixture.threads.get("Add keyboard navigation to filters");
  const shortcut = fixture.threads.get(FEATURED_THREAD);
  const place = (thread, stage) => fixture.run(["sidebar", "place", thread.id, "--to", `${STAGES}/${stage}`]);
  const browser = await launch();
  try {
    const context = await openContext(browser, { viewport: { width: 1280, height: 1000 } });
    context.setDefaultTimeout(20_000);
    context.setDefaultNavigationTimeout(20_000);
    const page = await context.newPage();
    await page.goto(stack.serverUrl);
    const list = sidebar(page);
    await list.waitFor({ timeout: 120_000 });
    const group = section(page, fixture.section.id);
    const completed = group.locator("[data-thread-id]").filter({ has: page.getByLabel("Completed stage", { exact: true }) });
    await group.getByRole("button", { name: "Show 3 more completed", exact: true }).waitFor();
    assert.equal(await completed.count(), 2);
    const gaps = await group.locator("[data-thread-id]").evaluateAll((nodes) =>
      nodes.slice(1).map((node, index) => node.getBoundingClientRect().top - nodes[index].getBoundingClientRect().bottom));
    assert.ok(gaps.every((gap) => Math.abs(gap - gaps[0]) < 0.01), `Stage boundaries must preserve the row spacing: ${gaps}`);
    const more = group.getByRole("button", { name: "Show 3 more completed", exact: true });
    await more.focus();
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => document.activeElement?.matches("a[data-sidebar-thread-id]"));
    const revealed = await page.evaluate(() => document.activeElement.dataset.sidebarThreadId);
    assert.equal(await completed.count(), 5);
    await page.keyboard.press("Enter");
    await page.waitForURL(`**/threads/${revealed}`);
    const fewer = group.getByRole("button", { name: "Show fewer completed", exact: true });
    await fewer.click();
    await group.getByRole("button", { name: "Show 2 more completed", exact: true }).waitFor();
    assert.equal(await completed.count(), 3, "The selected completion remains visible outside the two-row preview");
    assert.equal(await page.evaluate(() => document.activeElement?.textContent), "Show 2 more completed");
    await row(group, shortcut.id).locator("a[data-sidebar-thread-id]").click();
    await group.getByRole("button", { name: "Show 3 more completed", exact: true }).waitFor();
    async function first(thread) {
      console.log("Checking newest completion:", thread.title);
      await page.waitForFunction((id) => {
        const icon = document.querySelector('[data-ribbon-sidebar-root] [aria-label="Completed stage"]');
        return icon?.closest("[data-thread-id]")?.dataset.threadId === id;
      }, thread.id);
    }
    place(returning, "Idle");
    await row(group, returning.id).getByLabel("Idle stage", { exact: true }).waitFor();
    await row(group, returning.id).hover();
    await row(group, returning.id).getByRole("button", { name: "Thread actions", exact: true }).click();
    await page.getByRole("menuitem", { name: /Move to stage/ }).hover();
    await page.getByRole("menuitem").filter({ hasText: /^Completed$/ }).click();
    await first(returning);
    await page.locator('[data-app-composer-role="primary"] [contenteditable="true"]').click();
    const response = page.waitForResponse((response) => /\/rpc\/setWorkflowStage$/.test(response.url()));
    await page.keyboard.press(process.platform === "darwin" ? "Meta+." : "Control+.");
    assert.ok((await response).ok());
    await first(shortcut);
    place(returning, "Idle");
    place(returning, "Completed");
    await first(returning);
    await context.close();
  } finally {
    place(shortcut, "Idle");
    place(returning, "Completed");
    await browser.close();
  }
}
