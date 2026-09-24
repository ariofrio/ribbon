import assert from "node:assert/strict";
import { chromium } from "playwright";
import { FEATURED_THREAD } from "../../screenshots/fixture.mjs";

export async function verifyCompletedPlacement({ stack, fixture }) {
  const groupingKey = "plugin:thread-stages:stages";
  const returning = fixture.threads.get("Add keyboard navigation to filters");
  const shortcut = fixture.threads.get(FEATURED_THREAD);
  const place = (thread, stage, ...anchor) => fixture.run([
    "sidebar", "place", thread.id, "--to", `${groupingKey}/${stage}`, ...anchor,
  ]);
  const browser = await chromium.launch({ args: ["--mute-audio"] });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
    await context.addInitScript((groupingKey) => {
      localStorage.setItem("bb.sidebar.threadListProvider", JSON.stringify("ribbon-sidebar/ribbon-sidebar"));
      localStorage.setItem("bb.plugin.ribbon-sidebar.preferences.v1", JSON.stringify({
        view: { scope: { kind: "all" }, groupingKey, filterGroupingKey: null, sort: "manual" },
        collapsed: [],
      }));
    }, groupingKey);
    const page = await context.newPage();
    await page.goto(stack.serverUrl);
    const sidebar = page.locator("[data-ribbon-sidebar-root][data-ribbon-sidebar-ready]");
    await sidebar.waitFor({ timeout: 120_000 });
    const completed = sidebar.getByRole("region", { name: "Completed group", exact: true });
    const row = (thread) => sidebar.locator("li").filter({
      has: page.locator(`a[data-sidebar-thread-id="${thread.id}"]`),
    });
    async function first(thread) {
      await page.waitForFunction((threadId) => {
        const group = document.querySelector('[data-ribbon-sidebar-root] [aria-label="Completed group"]');
        const links = [...(group?.querySelectorAll("a[data-sidebar-thread-id]") ?? [])];
        const boxes = links.map((link) => ({ id: link.dataset.sidebarThreadId, box: link.getBoundingClientRect() }));
        return boxes.length > 1 && boxes.every(({ box }) => box.height > 0) &&
          boxes.sort((a, b) => a.box.top - b.box.top)[0].id === threadId;
      }, thread.id, { timeout: 15_000 });
    }

    // The thread already has a retained position near the bottom of Completed.
    place(returning, "Idle");
    await sidebar.getByRole("region", { name: "Idle group", exact: true })
      .getByText(returning.title, { exact: true }).waitFor();
    await row(returning).hover();
    await row(returning).getByRole("button", { name: "Thread actions", exact: true }).click();
    await page.getByRole("menuitem", { name: /Move to stage/ }).hover();
    await page.getByRole("menuitem").filter({ hasText: /^Completed$/ }).click();
    await first(returning);

    await row(shortcut).locator("a[data-sidebar-thread-id]").click();
    await page.waitForURL(`**/threads/${shortcut.id}`);
    await page.locator('[data-app-composer-role="primary"] [contenteditable="true"]').click();
    // Ctrl+. conflicts with Deferred on non-Mac clients, so bb disables it.
    // Exercise the existing alternate there, and the primary Cmd+. on macOS.
    const stageResponse = page.waitForResponse((response) =>
      response.url().endsWith("/plugins/thread-stages/rpc/setWorkflowStage"),
    );
    await page.keyboard.press(process.platform === "darwin" ? "Meta+." : "Control+Alt+.");
    assert.ok((await stageResponse).ok());
    await first(shortcut);

    place(returning, "Idle");
    place(returning, "Completed");
    await first(returning);
    place(shortcut, "Completed", "--before", returning.id);
    await first(shortcut);
    place(shortcut, "Completed", "--after", returning.id);
    await first(returning);

    place(shortcut, "Idle");
    await sidebar.getByRole("region", { name: "Idle group", exact: true })
      .getByText(shortcut.title, { exact: true }).waitFor();
    const source = row(shortcut).locator("a[data-sidebar-thread-id]");
    await source.hover();
    const sourceBox = await source.boundingBox();
    await page.mouse.move(sourceBox.x + 60, sourceBox.y + sourceBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(sourceBox.x + 70, sourceBox.y + sourceBox.height / 2);
    await page.locator("[data-ribbon-thread-drag-overlay]").waitFor();
    const heading = await completed.locator('[data-sidebar="group-label"]').boundingBox();
    await page.mouse.move(heading.x + 60, heading.y + heading.height / 2);
    await completed.locator("[data-ribbon-thread-drop-preview]").waitFor();
    await page.mouse.up();
    await first(shortcut);
    await completed.getByText(shortcut.title, { exact: true }).waitFor({ state: "visible" });
    await context.close();
  } finally {
    await browser.close();
  }
}
