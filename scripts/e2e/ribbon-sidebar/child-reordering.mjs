import assert from "node:assert/strict";
import { chromium } from "playwright";
import { AGENT, FEATURED_PROJECT, FEATURED_THREAD } from "../../screenshots/fixture.mjs";

export async function verifyChildReordering({ stack, fixture }) {
  const parent = fixture.threads.get(FEATURED_THREAD);
  const project = fixture.projects.get(FEATURED_PROJECT);
  const spawn = (title) => {
    const child = fixture.runJson([
      "thread", "spawn", "--project", project.id,
      "--machine", "screenshots", "--environment", project.root,
      "--parent-thread", parent.id, "--provider", `acp-${AGENT.id}`,
      "--model", AGENT.modelId, "--title", title,
      "--permission-mode", "accept-edits", "--prompt", `Check ${title}.`,
    ]);
    fixture.run(["thread", "wait", child.id, "--status", "idle"]);
    return child;
  };
  const older = spawn("Child order older");
  const newer = spawn("Child order newer");
  const browser = await chromium.launch({ args: ["--mute-audio"] });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await context.addInitScript(() => {
      localStorage.setItem("bb.sidebar.threadListProvider", JSON.stringify("ribbon-sidebar/ribbon-sidebar"));
    });
    const page = await context.newPage();
    page.setDefaultTimeout(15_000);
    page.on("pageerror", (error) => console.error("Browser error:", error));
    await page.goto(new URL(`/projects/${project.id}/threads/${parent.id}`, stack.serverUrl).href);
    const sidebar = page.locator("[data-ribbon-sidebar-root][data-ribbon-sidebar-ready]");
    await sidebar.waitFor({ timeout: 120_000 });
    const childOrder = () =>
      sidebar.locator("li[data-thread-id]").evaluateAll(
        (nodes, ids) => nodes.map((node) => node.dataset.threadId).filter((id) => ids.includes(id)),
        [older.id, newer.id],
      );
    const olderRow = sidebar.locator(`a[data-sidebar-thread-id="${older.id}"]`);
    const newerRow = sidebar.locator(`a[data-sidebar-thread-id="${newer.id}"]`);
    await olderRow.waitFor();
    await newerRow.waitFor();
    assert.deepEqual(await childOrder(), [newer.id, older.id], "new children enter at the top");

    const url = page.url();
    const saved = page.waitForResponse((response) => response.url().endsWith("/rpc/reorderChildrenV1"));
    const sourceBox = await olderRow.boundingBox();
    await page.mouse.move(sourceBox.x + 60, sourceBox.y + sourceBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(sourceBox.x + 66, sourceBox.y + sourceBox.height / 2, { steps: 3 });
    await page.locator("[data-ribbon-thread-drag-overlay]").waitFor({ timeout: 5000 });
    const targetBox = await newerRow.boundingBox();
    await page.mouse.move(targetBox.x + 60, targetBox.y + 3, { steps: 10 });
    await sidebar.locator("[data-ribbon-thread-drop-preview]").waitFor();
    await page.mouse.up();
    assert.ok((await saved).ok());
    assert.deepEqual(await childOrder(), [older.id, newer.id]);
    assert.equal(page.url(), url, "dropping a child must not open it");

    await page.reload();
    await sidebar.waitFor({ timeout: 120_000 });
    await olderRow.waitFor();
    assert.deepEqual(await childOrder(), [older.id, newer.id], "child order survives reload");

    fixture.run(["sidebar", "place", newer.id, "--before", older.id]);
    await page.waitForFunction(
      ([first, second]) => {
        const ids = [...document.querySelectorAll("[data-ribbon-sidebar-root] li[data-thread-id]")]
          .map((node) => node.dataset.threadId);
        return ids.indexOf(first) >= 0 && ids.indexOf(first) < ids.indexOf(second);
      },
      [newer.id, older.id],
    );
    const listed = fixture.runJson(["sidebar", "children", parent.id]);
    assert.deepEqual(
      listed.map(({ id }) => id).filter((id) => id === older.id || id === newer.id),
      [newer.id, older.id],
      "the CLI lists children in sidebar order",
    );
    await context.close();
  } finally {
    await browser.close();
  }
}
