import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { FEATURED_THREAD } from "../../screenshots/fixture.mjs";
import { carryTo, dropMarker, heading, launch, link, openContext, pickUp, sidebar } from "./sidebar.mjs";

export async function verifyMachineOrder({ stack, fixture }) {
  const moving = fixture.threads.get(FEATURED_THREAD);
  const resident = fixture.threads.get("Add keyboard navigation to filters");
  const prefs = fixture.runJson(["thread-stages", "prefs", "list"]);
  const browser = await launch();
  let context;
  try {
    for (const [key, value] of [["organizationMode", "machine"], ["chronologicalSort", "none"], ["environmentGrouping", "false"]]) {
      fixture.run(["thread-stages", "prefs", "set", key, value]);
    }
    for (const stage of ["Active", "Completed"]) {
      for (const thread of [moving, resident]) fixture.run(["thread-stages", "stage", stage, thread.id]);
    }
    const savedOrder = (by) => fixture.runJson(["thread-stages", "list", "--by", by === "builtin:sections" ? "section" : "project", by === "builtin:sections" ? "--section" : "--project", by === "builtin:sections" ? fixture.section.id : moving.projectId]).map(({ id }) => id);
    const sectionOrder = savedOrder("builtin:sections");
    const projectOrder = savedOrder("builtin:projects");
    context = await openContext(browser, { organization: "machine", viewport: { width: 1280, height: 1200 } });
    await context.tracing.start({ snapshots: true, sources: true });
    let page = await context.newPage();
    async function ready() {
      await page.goto(stack.serverUrl);
      await sidebar(page).waitFor({ timeout: 120_000 });
      const group = sidebar(page).getByText("screenshots", { exact: true }).locator('xpath=ancestor::*[@data-sidebar-sticky-group][1]');
      await group.waitFor().catch(async (error) => {
        console.error("Machine sidebar", await sidebar(page).innerText());
        throw error;
      });
      const more = group.getByRole("button", { name: /^Show \d+ more completed$/ });
      if (await more.count()) await more.click();
      await link(group, moving.id).waitFor();
      return group;
    }
    let group = await ready();
    async function first(thread, second) {
      await page.waitForFunction(({ first, second }) => {
        const root = document.querySelector("[data-ribbon-sidebar-root]");
        const a = root?.querySelector(`[data-thread-id="${first}"]`);
        const b = root?.querySelector(`[data-thread-id="${second}"]`);
        return a && b && a.getBoundingClientRect().top < b.getBoundingClientRect().top;
      }, { first: thread.id, second: second.id });
    }
    await first(resident, moving);
    await pickUp(page, link(group, moving.id));
    await carryTo(page, link(group, resident.id), "before");
    const marker = group.locator(`[data-thread-id="${resident.id}"][data-sidebar-reorder-placement="before"]`);
    await marker.waitFor();
    assert.ok(await marker.evaluate((node) => {
      const line = getComputedStyle(node, "::before");
      return line.content !== "none" && parseFloat(line.height) > 0 &&
        line.backgroundColor !== "rgba(0, 0, 0, 0)";
    }), "The insertion line is drawn before releasing the drag");
    const placed = page.waitForResponse((response) => response.url().endsWith("/rpc/updatePlacementV1"));
    await page.mouse.up();
    const response = await placed;
    assert.equal(response.request().postDataJSON().groupingKey, "builtin:machines");
    assert.ok((await response.json()).result.ok);
    await first(moving, resident);
    assert.deepEqual(savedOrder("builtin:sections"), sectionOrder);
    assert.deepEqual(savedOrder("builtin:projects"), projectOrder);
    await page.close({ runBeforeUnload: false });
    page = await context.newPage();
    group = await ready();
    await first(moving, resident);
    // A heading drop uses this machine's rank too.
    await pickUp(page, link(group, resident.id));
    await carryTo(page, heading(group));
    await dropMarker(group).waitFor({ state: "hidden" });
    const overlay = group.locator("[data-sidebar-drop-target-overlay]");
    await overlay.waitFor();
    assert.ok(await overlay.evaluate((node) => {
      const box = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return box.width > 0 && box.height > 0 && style.visibility === "visible" &&
        style.backgroundColor !== "rgba(0, 0, 0, 0)";
    }), "The group drop target is drawn before releasing the drag");
    const headed = page.waitForResponse((response) => response.url().endsWith("/rpc/updatePlacementV1"));
    await page.mouse.up();
    assert.ok((await (await headed).json()).result.ok);
    await first(resident, moving);
  } catch (error) {
    await mkdir(resolve(".scratch/e2e"), { recursive: true });
    await context?.tracing.stop({ path: resolve(".scratch/e2e/machine-order.trace.zip") });
    throw error;
  } finally {
    await context?.close();
    await browser.close();
    for (const thread of [moving, resident]) fixture.run(["thread-stages", "stage", "Active", thread.id]);
    for (const key of ["organizationMode", "chronologicalSort", "environmentGrouping"]) {
      fixture.run(["thread-stages", "prefs", "set", key, JSON.stringify(prefs[key])]);
    }
  }
}
