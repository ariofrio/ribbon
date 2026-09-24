import { chromium } from "playwright";
import { AGENT, FEATURED_PROJECT, FEATURED_THREAD } from "../../screenshots/fixture.mjs";

export async function verifyChildCollapse({ stack, fixture }) {
  const parent = fixture.threads.get(FEATURED_THREAD);
  const project = fixture.projects.get(FEATURED_PROJECT);
  const child = fixture.runJson([
    "thread", "spawn", "--project", project.id,
    "--machine", "screenshots", "--environment", project.root,
    "--parent-thread", parent.id, "--provider", `acp-${AGENT.id}`,
    "--model", AGENT.modelId, "--title", "Child collapse persistence",
    "--permission-mode", "accept-edits", "--prompt", "Check child collapse persistence.",
  ]);
  fixture.run(["thread", "wait", child.id, "--status", "idle"]);
  const browser = await chromium.launch({ args: ["--mute-audio"] });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await context.addInitScript(() => {
      localStorage.setItem("bb.sidebar.threadListProvider", JSON.stringify("ribbon-sidebar/ribbon-sidebar"));
    });
    const page = await context.newPage();
    page.setDefaultTimeout(15_000);
    await page.goto(new URL(`/projects/${project.id}/threads/${parent.id}`, stack.serverUrl).href);
    const sidebar = page.locator("[data-ribbon-sidebar-root][data-ribbon-sidebar-ready]");
    const childRow = sidebar.locator(`a[data-sidebar-thread-id="${child.id}"]`);
    const parentRow = sidebar.locator(`a[data-sidebar-thread-id="${parent.id}"]`);
    const collapse = sidebar.getByRole("button", { name: `Collapse ${FEATURED_THREAD} threads`, exact: true });
    const expand = sidebar.getByRole("button", { name: `Expand ${FEATURED_THREAD} threads`, exact: true });
    await sidebar.waitFor({ timeout: 120_000 });
    await childRow.waitFor();
    await parentRow.hover();
    await collapse.click();
    await childRow.waitFor({ state: "hidden" });
    await page.reload();
    await sidebar.waitFor({ timeout: 120_000 });
    await expand.waitFor();
    await childRow.waitFor({ state: "hidden" });
    await expand.click();
    await childRow.waitFor();
    await page.reload();
    await sidebar.waitFor({ timeout: 120_000 });
    await childRow.waitFor();
    await context.close();
  } finally {
    await browser.close();
  }
}
