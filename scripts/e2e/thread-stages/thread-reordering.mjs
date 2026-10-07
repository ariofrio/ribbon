import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { FEATURED_PROJECT, FEATURED_THREAD, THREADS } from "../../screenshots/fixture.mjs";
import {
  carryTo, dragChip, dropMarker, heading, launch, link, openContext, pickUp,
  rowOrder, section, sidebar,
} from "./sidebar.mjs";

export async function verifyThreadReordering({ stack, fixture, initialSort = "none" }) {
  const savedSort = fixture.runJson(["thread-stages", "prefs", "get", "chronologicalSort"]).value;
  fixture.run(["thread-stages", "prefs", "set", "chronologicalSort", initialSort]);
  for (const thread of fixture.threads.values()) fixture.run(["thread-stages", "stage", "Active", thread.id]);
  const browser = await launch();
  let releaseSave = () => {};
  let context;
  try {
    context = await openContext(browser);
    await context.tracing.start({ snapshots: true, sources: true });
    let page = await context.newPage();
    page.on("pageerror", (error) => console.error("Browser error:", error));
    const thread = fixture.threads.get(FEATURED_THREAD);
    const project = fixture.projects.get(FEATURED_PROJECT);
    await page.goto(new URL(`/projects/${project.id}/threads/${thread.id}`, stack.serverUrl).href);
    const list = sidebar(page);
    await list.waitFor({ timeout: 120_000 });
    const group = section(page, fixture.section.id);
    const original = await rowOrder(group);
    assert.ok(original.length >= 2);
    const source = link(group, original[0]);
    const target = link(group, original[1]);
    const url = page.url();
    const saveGate = new Promise((resolve) => {
      releaseSave = resolve;
    });
    await page.route("**/rpc/updatePlacementV1", async (route) => {
      await saveGate;
      await route.continue();
    }, { times: 1 });
    // Answered only once the gate opens, however long the checks before take.
    const saved = page.waitForResponse((response) => response.url().endsWith("/rpc/updatePlacementV1"), { timeout: 0 });
    // A failure before the gate opens closes the page; report that failure, not this one.
    void saved.catch(() => undefined);
    await pickUp(page, source);
    const chip = dragChip(page);
    assert.ok(
      await chip.evaluate((node) => {
        const style = getComputedStyle(node);
        return node.getBoundingClientRect().height >= 24 && style.visibility === "visible" && style.pointerEvents === "none";
      }),
    );
    await carryTo(page, target, "after");
    const marker = dropMarker(group);
    await marker.waitFor();
    assert.equal(await marker.getAttribute("data-thread-id"), original[1]);
    assert.equal(await marker.getAttribute("data-sidebar-reorder-placement"), "after");
    await page.mouse.up();
    // The list draws the drop before the server answers.
    await page.waitForFunction(
      ({ first, second }) => {
        const nodes = [...document.querySelectorAll("[data-ribbon-sidebar-root] [data-thread-id]")];
        return nodes.findIndex((n) => n.dataset.threadId === second) < nodes.findIndex((n) => n.dataset.threadId === first);
      },
      { first: original[0], second: original[1] },
    );
    await source.waitFor();
    assert.equal(await source.evaluate((node) => getComputedStyle(node.closest("[data-thread-id]")).opacity), "1");
    await marker.waitFor({ state: "hidden" });
    releaseSave();
    assert.ok((await saved).ok());
    assert.equal(page.url(), url, "dropping a thread must not open it");
    // A reload straight after the gated save has hung this page's main
    // thread in full runs, in bb's own unload rather than anything the list
    // draws; a fresh page reads the persisted order without that race.
    page = await freshPage(page);
    const list2 = sidebar(page);
    const group2 = section(page, fixture.section.id);
    await list2.waitFor({ timeout: 120_000 });
    const reordered = await rowOrder(group2);
    assert.ok(reordered.indexOf(original[1]) < reordered.indexOf(original[0]), "order survives reload");

    // Escape restores the source and leaves the persisted order alone.
    await pickUp(page, link(group2, original[1]));
    assert.equal(page.url(), url, "cancel drag start must not navigate");
    await page.keyboard.press("Escape");
    assert.equal(page.url(), url, "Escape must not navigate");
    await page.mouse.up();
    await dragChip(page).waitFor({ state: "hidden" });
    await link(group2, original[0]).waitFor();
    assert.deepEqual(await rowOrder(group2), reordered);
    assert.equal(page.url(), url, "cancel must not navigate");

    // A group title inserts first.
    page = await freshPage(page);
    const list3 = sidebar(page);
    const group3 = section(page, fixture.section.id);
    await list3.waitFor({ timeout: 120_000 });
    const afterCancel = await rowOrder(group3);
    await pickUp(page, link(group3, afterCancel.at(-1)));
    const headerBox = await heading(group3).boundingBox();
    await page.mouse.move(headerBox.x + 60, headerBox.y + headerBox.height / 2, { steps: 10 });
    // bb marks the section under the pointer, its own as "unchanged".
    await group3.locator("[data-sidebar-drop-target-overlay]").waitFor();
    const headerSaved = page.waitForResponse((response) => response.url().endsWith("/rpc/updatePlacementV1"));
    await page.mouse.up();
    assert.ok((await headerSaved).ok());
    page = await freshPage(page);
    const group4 = section(page, fixture.section.id);
    await sidebar(page).waitFor({ timeout: 120_000 });
    assert.equal((await rowOrder(group4))[0], afterCancel.at(-1), "dropping on the group title persists the first position");
    await context.close();
  } catch (error) {
    // Whether the plugin server still answers, and what it logged.
    for (const args of [["plugin", "logs", "thread-stages"], ["thread-stages", "list", "--json"]]) {
      try {
        console.error(`bb ${args.join(" ")}:`, fixture.run(args).split("\n").slice(-30).join("\n"));
      } catch (diagnosticError) {
        console.error(`bb ${args.join(" ")} failed:`, diagnosticError.message);
      }
    }
    const directory = resolve(".scratch/e2e");
    await mkdir(directory, { recursive: true })
      .then(() => context?.tracing.stop({ path: resolve(directory, "thread-reordering.trace.zip") }))
      .catch((diagnosticError) => console.error("Could not save the thread-reordering trace:", diagnosticError));
    throw error;
  } finally {
    fixture.run(["thread-stages", "prefs", "set", "chronologicalSort", savedSort]);
    for (const spec of THREADS) if (spec.stage) fixture.run(["thread-stages", "stage", `${spec.stage}`, fixture.threads.get(spec.title).id]);
    releaseSave();
    await browser.close();
  }
}


/** Opens the same route in a new page and closes the old one. */
async function freshPage(page) {
  const url = page.url();
  const context = page.context();
  const next = await context.newPage();
  await page.close({ runBeforeUnload: false });
  await next.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });
  return next;
}
