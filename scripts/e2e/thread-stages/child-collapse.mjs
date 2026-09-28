import { AGENT, FEATURED_PROJECT, FEATURED_THREAD } from "../../screenshots/fixture.mjs";
import { launch, link, openContext, sidebar, spawnChild, withPreferenceSaved } from "./sidebar.mjs";

export async function verifyChildCollapse({ stack, fixture }) {
  const parent = fixture.threads.get(FEATURED_THREAD);
  const project = fixture.projects.get(FEATURED_PROJECT);
  const child = spawnChild(fixture, { parent, project, title: "Child collapse persistence", AGENT });
  const browser = await launch();
  try {
    const context = await openContext(browser);
    const page = await context.newPage();
    page.setDefaultTimeout(15_000);
    await page.goto(new URL(`/projects/${project.id}/threads/${parent.id}`, stack.serverUrl).href);
    const list = sidebar(page);
    const childRow = link(list, child.id);
    const parentRow = link(list, parent.id);
    const collapse = list.getByRole("button", { name: `Collapse ${FEATURED_THREAD} threads`, exact: true });
    const expand = list.getByRole("button", { name: `Expand ${FEATURED_THREAD} threads`, exact: true });
    await list.waitFor({ timeout: 120_000 });
    await childRow.waitFor();
    await parentRow.hover();
    await withPreferenceSaved(page, "collapsedThreads", () => collapse.click());
    await childRow.waitFor({ state: "hidden" });
    await page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 });
    await list.waitFor({ timeout: 120_000 });
    await expand.waitFor();
    await childRow.waitFor({ state: "hidden" });
    await withPreferenceSaved(page, "collapsedThreads", () => expand.click());
    await childRow.waitFor();
    await page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 });
    await list.waitFor({ timeout: 120_000 });
    await childRow.waitFor();
    await context.close();
  } finally {
    await browser.close();
  }
}
