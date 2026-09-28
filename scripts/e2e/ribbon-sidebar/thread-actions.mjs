import assert from "node:assert/strict";
import { chromium } from "playwright";
import { applyPluginState, FEATURED_PROJECT, FEATURED_THREAD } from "../../screenshots/fixture.mjs";

export async function verifyThreadActions({ stack, fixture }) {
  await applyPluginState({ stack, ...fixture });
  const browser = await chromium.launch({ args: ["--mute-audio"] });
  let cleanup = null;
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await context.addInitScript(() => {
      localStorage.setItem("bb.sidebar.threadListProvider", JSON.stringify("ribbon-sidebar/ribbon-sidebar"));
    });
    const page = await context.newPage();
    const thread = fixture.threads.get(FEATURED_THREAD);
    cleanup = async () => {
      const response = await page.request.post(
        new URL("/api/v1/plugins/ribbon-sidebar/rpc/saveThreadActionsV1", stack.serverUrl).href,
        { data: { threadId: thread.id, actions: [] } },
      );
      assert.equal(response.status(), 200, "The action fixture is removed after the test");
    };
    const project = fixture.projects.get(FEATURED_PROJECT);
    await page.goto(new URL(`/projects/${project.id}/threads/${thread.id}`, stack.serverUrl).href);
    const sidebar = page.locator("[data-ribbon-sidebar-root][data-ribbon-sidebar-ready]");
    await sidebar.waitFor({ timeout: 120_000 });
    const row = sidebar.locator(`li[data-thread-id="${thread.id}"]`).first();
    await row.hover();
    await row.getByRole("button", { name: "Thread actions" }).click();
    await page.getByRole("menuitem", { name: "Edit actions" }).click();
    const dialog = page.getByRole("dialog", { name: "Edit thread actions" });
    await dialog.getByRole("button", { name: "Add action" }).click();
    await dialog.getByRole("textbox", { name: "Action 1 button label" }).fill("Review");
    await dialog.getByRole("textbox", { name: "Action 1 prompt" }).fill("Review this thread.");
    await dialog.getByRole("button", { name: "Save actions" }).click();
    await dialog.waitFor({ state: "hidden" });
    const action = row.getByRole("button", { name: `Review in ${thread.title}` });
    await action.waitFor();
    await page.reload();
    await sidebar.waitFor({ timeout: 120_000 });
    await action.waitFor();
    const colors = await row.evaluate((node) => {
      const button = node.querySelector('button[aria-label^="Review in "]');
      const group = node.querySelector('[data-ribbon-icons-section]');
      if (!button || !group) throw new Error("Action button or section color owner missing");
      const picked = getComputedStyle(group).getPropertyValue("--ribbon-icons-section-color-light").trim();
      const tinted = getComputedStyle(button).backgroundColor;
      group.style.setProperty("--ribbon-icons-section-color-light", "oklch(0.5 0 0)");
      const neutral = getComputedStyle(button).backgroundColor;
      return { picked, tinted, neutral };
    });
    assert.ok(colors.picked, "The Icons plugin supplies this section's color");
    assert.notEqual(colors.tinted, colors.neutral, "The painted button follows its group color");

    const before = page.url();
    await row.getByRole("link", { name: `Open ${thread.title}` }).hover();
    const submissions = [];
    await page.route("**/plugins/ribbon-sidebar/rpc/runThreadActionV1", (route) => {
      submissions.push(route.request().postDataJSON());
      return route.fulfill({ json: { ok: true, result: { ok: true } } });
    });
    const response = page.waitForResponse((candidate) =>
      candidate.url().endsWith("/plugins/ribbon-sidebar/rpc/runThreadActionV1"));
    await action.click();
    assert.equal((await response).status(), 200);
    assert.equal(submissions.length, 1, "A real click dispatches one action");
    assert.equal(page.url(), before, "Running an action does not open another thread");
  } finally {
    try {
      await cleanup?.();
    } finally {
      await browser.close();
    }
  }
}
