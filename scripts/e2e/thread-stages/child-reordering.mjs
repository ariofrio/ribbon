import assert from "node:assert/strict";
import { AGENT, FEATURED_PROJECT, FEATURED_THREAD } from "../../screenshots/fixture.mjs";
import {
  carryTo, dragChip, dropMarker, launch, link, openContext, pickUp, rowOrder,
  sidebar, spawnChild, waitForOrder,
} from "./sidebar.mjs";

export async function verifyChildReordering({ stack, fixture }) {
  const parent = fixture.threads.get(FEATURED_THREAD);
  const project = fixture.projects.get(FEATURED_PROJECT);
  const older = spawnChild(fixture, { parent, project, title: "Child order older", AGENT });
  const newer = spawnChild(fixture, { parent, project, title: "Child order newer", AGENT });
  const browser = await launch();
  try {
    const context = await openContext(browser);
    const page = await context.newPage();
    page.setDefaultTimeout(15_000);
    page.on("pageerror", (error) => console.error("Browser error:", error));
    await page.goto(new URL(`/projects/${project.id}/threads/${parent.id}`, stack.serverUrl).href);
    const list = sidebar(page);
    await list.waitFor({ timeout: 120_000 });
    const childOrder = async () =>
      (await rowOrder(list)).filter((id) => id === older.id || id === newer.id);
    const olderRow = link(list, older.id);
    const newerRow = link(list, newer.id);
    await olderRow.waitFor();
    await newerRow.waitFor();
    assert.deepEqual(await childOrder(), [newer.id, older.id], "new children enter at the top");

    const url = page.url();
    const saved = page.waitForResponse((response) => response.url().endsWith("/rpc/reorderChildrenV1"));
    await pickUp(page, olderRow);
    await carryTo(page, newerRow, "before");
    await dropMarker(list).waitFor();
    await page.mouse.up();
    assert.ok((await saved).ok());
    await dragChip(page).waitFor({ state: "hidden" });
    await waitForOrder(page, older.id, newer.id);
    assert.deepEqual(await childOrder(), [older.id, newer.id]);
    assert.equal(page.url(), url, "dropping a child must not open it");

    await page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 });
    await list.waitFor({ timeout: 120_000 });
    await olderRow.waitFor();
    assert.deepEqual(await childOrder(), [older.id, newer.id], "child order survives reload");

    fixture.run(["thread-stages", "place", newer.id, "--before", older.id]);
    await waitForOrder(page, newer.id, older.id);
    const listed = fixture.runJson(["thread-stages", "children", parent.id]);
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
