import assert from "node:assert/strict";
import { AGENT, FEATURED_PROJECT, FEATURED_THREAD, THREADS } from "../../screenshots/fixture.mjs";
import {
  carryTo, dragChip, dropMarker, heading, launch, link, openContext, pickUp,
  rowOrder, section, sidebar, spawnChild, STAGES,
} from "./sidebar.mjs";

export async function verifyDragRegressions({ stack, fixture, cases }) {
  const threads = [...fixture.threads.values()];
  for (const [index, thread] of threads.entries()) {
    fixture.run(["thread-stages", "place", thread.id, "--to", `${STAGES}/${index < 6 ? "Active" : index < 8 ? "Deferred" : "Completed"}`]);
  }
  const children = [];
  if (cases.includes("nested")) {
    const project = fixture.projects.get(FEATURED_PROJECT);
    for (const parent of [threads[5], threads[6]]) {
      children.push(spawnChild(fixture, { parent, project, title: `Child of ${parent.title}`, AGENT }));
    }
  }
  const browser = await launch();
  let releaseRead = () => {};
  try {
    const context = await openContext(browser, { viewport: { width: 1280, height: 1000 } });
    const page = await context.newPage();
    page.on("pageerror", (error) => console.error("Browser error", error.message));
    page.setDefaultTimeout(15_000);
    await page.goto(
      new URL(`/projects/${fixture.projects.get(FEATURED_PROJECT).id}/threads/${fixture.threads.get(FEATURED_THREAD).id}`, stack.serverUrl).href,
    );
    const list = sidebar(page);
    await list.waitFor({ timeout: 120_000 }).catch(async (error) => {
      console.error("Sidebar readiness", await page.locator("body").innerText());
      throw error;
    });
    const group = section(page, fixture.section.id);
    const row = (id) => link(group, id);
    await group.getByRole("button", { name: "Show 1 more deferred", exact: true }).click();
    for (const thread of threads.slice(0, 8)) await row(thread.id).waitFor({ timeout: 120_000 });
    const mainIds = new Set(threads.slice(0, 6).map((t) => t.id));
    const order = async () => (await rowOrder(group)).filter((id) => mainIds.has(id));
    const chip = dragChip(page);
    const marker = dropMarker(group);
    const frames = () =>
      page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    async function responsive(action) {
      let timer;
      try {
        return await Promise.race([
          action,
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error("Drag must leave the browser responsive")), 15_000);
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
    }
    async function cancel() {
      await page.keyboard.press("Escape");
      await page.mouse.up();
      await chip.waitFor({ state: "hidden" });
    }
    if (cases.includes("preview-stability")) {
      const initial = await order();
      await pickUp(page, row(initial.at(-1)));
      const target = await row(initial[1]).boundingBox();
      const placements = [];
      for (let index = 0; index < 24; index++) {
        await responsive(page.mouse.move(target.x + 60 + (index % 2), target.y + 2));
        await responsive(frames());
        placements.push(
          await marker.evaluateAll((nodes) =>
            nodes.map((node) => `${node.dataset.threadId}:${node.dataset.sidebarReorderPlacement}`).join()),
        );
      }
      assert.ok(placements.slice(4).every((value) => value !== ""), "A valid drop must keep a visible marker");
      assert.equal(new Set(placements.slice(4)).size, 1, `A stationary pointer must not move the drop marker: ${JSON.stringify(placements)}`);
      await cancel();
    }
    if (cases.includes("stage-boundary")) {
      const initial = await order();
      await pickUp(page, row(initial[0]));
      await carryTo(page, row(threads[6].id), "before");
      await responsive(frames());
      assert.equal(await marker.count(), 0, "A working thread must not advertise insertion into the Deferred list");
      await cancel();
    }
    if (cases.includes("stage-placement")) {
      const initial = await order();
      // Dropped on the section heading, a Deferred thread goes first among
      // the Deferred, below every working thread.
      await pickUp(page, row(threads[7].id));
      const header = await heading(group).boundingBox();
      await page.mouse.move(header.x + 60, header.y + header.height / 2, { steps: 10 });
      await group.locator("[data-sidebar-drop-target-overlay]").waitFor();
      const saved = page.waitForResponse((response) => response.url().endsWith("/rpc/updatePlacementV1"));
      await page.mouse.up();
      assert.ok((await saved).ok());
      await chip.waitFor({ state: "hidden" });
      await page.waitForFunction(
        ({ moved, mainIds }) => {
          const ids = [...document.querySelectorAll("[data-ribbon-sidebar-root] [data-thread-id]")].map((node) => node.dataset.threadId);
          const deferredIndex = ids.indexOf(moved);
          return deferredIndex >= 0 && mainIds.every((id) => ids.indexOf(id) < deferredIndex);
        },
        { moved: threads[7].id, mainIds: [...mainIds] },
      );
      assert.deepEqual(await order(), initial, "Placing a Deferred thread leaves the working order alone");
      const deferred = (await rowOrder(group)).filter((id) => id === threads[6].id || id === threads[7].id);
      assert.deepEqual(deferred, [threads[7].id, threads[6].id], "The heading drop puts the thread first among the Deferred");
    }
    if (cases.includes("nested")) {
      await row(children[0].id).waitFor();
      await row(children[1].id).waitFor();
      const initial = await order();
      await pickUp(page, row(threads[5].id));
      await responsive(carryTo(page, row(children[1].id), "before"));
      await responsive(frames());
      assert.equal(await marker.count(), 0, "Children of another stage must not become section-wide drop targets");
      await cancel();
      assert.deepEqual(await order(), initial);
    }
    if (cases.includes("rapid-reorder")) {
      const initial = await order();
      const first = initial.at(-1);
      const second = initial.at(-2);
      const gate = new Promise((resolve) => {
        releaseRead = resolve;
      });
      await page.route("**/rpc/updatePlacementV1", async (route) => {
        await gate;
        await route.continue();
      }, { times: 1 });
      const saves = [];
      page.on("response", (response) => {
        if (response.url().endsWith("/rpc/updatePlacementV1")) saves.push(response);
      });
      async function toTop(id) {
        await pickUp(page, row(id));
        await carryTo(page, row((await order())[0]), "before");
        await marker.waitFor();
        await page.mouse.up();
        await chip.waitFor({ state: "hidden" });
        await page.waitForFunction(
          ({ id, sectionId }) =>
            document.querySelector(`[data-ribbon-sidebar-root] [data-sidebar-section-id="${sectionId}"] [data-thread-id]`)?.dataset.threadId === id,
          { id, sectionId: fixture.section.id },
        );
      }
      await toTop(first);
      await toTop(second);
      const expected = [second, first, ...initial.filter((id) => id !== first && id !== second)];
      assert.deepEqual(await order(), expected, "Both drops apply immediately before the first save completes");
      releaseRead();
      await page.waitForResponse(async (response) => {
        if (
          !response.url().endsWith("/rpc/listPlacementsV1") ||
          response.request().postDataJSON().groupingKey !== "builtin:sections" ||
          saves.length < 2
        )
          return false;
        const body = await response.json();
        return body.result.value.items.filter((item) => mainIds.has(item.threadId)).map((item) => item.threadId).join() === expected.join();
      });
      for (const response of saves) assert.equal((await response.json()).result.ok, true);
      assert.deepEqual(await order(), expected);
      await page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 });
      await list.waitFor({ timeout: 120_000 });
      assert.deepEqual(await order(), expected, "Successive drops persist in gesture order");
    }
    if (cases.includes("stale-read")) {
      const initial = await order();
      let captured;
      let capturedRevision = -1;
      const readCaptured = new Promise((resolve) => {
        captured = resolve;
      });
      const gate = new Promise((resolve) => {
        releaseRead = resolve;
      });
      let intercepted = false;
      await page.route("**/rpc/listPlacementsV1", async (route) => {
        if (intercepted || route.request().postDataJSON().groupingKey !== "builtin:sections") {
          await route.continue();
          return;
        }
        intercepted = true;
        const response = await route.fetch();
        capturedRevision = (await response.json()).result.value.revision;
        captured();
        await gate;
        await route.fulfill({ response });
      });
      fixture.run(["thread-stages", "place", initial[1], "--to", `${STAGES}/BlockedOnThirdParty`]);
      await Promise.race([
        readCaptured,
        new Promise((_, reject) => {
          const timer = setTimeout(() => reject(new Error("No pre-drop placement read captured")), 15_000);
          readCaptured.then(() => clearTimeout(timer));
        }),
      ]);
      const refreshed = page.waitForResponse(async (response) => {
        if (!response.url().endsWith("/rpc/listPlacementsV1") || response.request().postDataJSON().groupingKey !== "builtin:sections") return false;
        return (await response.json()).result.value.revision > capturedRevision;
      });
      await pickUp(page, row(initial.at(-1)));
      await carryTo(page, row(initial[0]), "before");
      await marker.waitFor();
      const saved = page.waitForResponse((response) => response.url().endsWith("/rpc/updatePlacementV1"));
      await page.mouse.up();
      assert.ok((await saved).ok());
      await page.waitForFunction(
        ({ id, sectionId }) =>
          document.querySelector(`[data-ribbon-sidebar-root] [data-sidebar-section-id="${sectionId}"] [data-thread-id]`)?.dataset.threadId === id,
        { id: initial.at(-1), sectionId: fixture.section.id },
      );
      await refreshed;
      await responsive(frames());
      const expected = await order();
      const staleArrived = page.waitForResponse(
        (response) => response.url().endsWith("/rpc/listPlacementsV1") && response.request().postDataJSON().groupingKey === "builtin:sections",
      );
      releaseRead();
      await staleArrived;
      await responsive(frames());
      assert.deepEqual(await order(), expected, "A delayed pre-drop read must not undo the saved drop");
      await page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 });
      await list.waitFor({ timeout: 120_000 });
      assert.deepEqual(await order(), expected, "The displayed order matches the saved order after reload");
    }
    await context.close();
  } finally {
    releaseRead();
    await browser.close();
    for (const child of children) fixture.run(["thread", "archive", child.id]);
    for (const spec of THREADS)
      if (spec.stage) fixture.run(["thread-stages", "place", fixture.threads.get(spec.title).id, "--to", `${STAGES}/${spec.stage}`]);
  }
}
