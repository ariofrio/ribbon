import assert from "node:assert/strict";
import { AGENT, FEATURED_PROJECT, FEATURED_THREAD, THREADS } from "../../screenshots/fixture.mjs";
import { launch, link, openContext, sidebar, spawnChild } from "./sidebar.mjs";

async function verifyPreview({ page, group, threads, outside, fixture }) {
  const ids = new Set(threads.map((thread) => thread.id));
  const visible = () => group.locator("[data-thread-id]").evaluateAll((nodes, ids) =>
    nodes.filter((node) => ids.includes(node.dataset.threadId) && node.getBoundingClientRect().height > 0)
      .map((node) => node.dataset.threadId), [...ids]);
  for (const stage of ["deferred", "completed"]) {
    const more = group.getByRole("button", { name: `Show 2 more ${stage}`, exact: true });
    await more.waitFor();
    const active = threads.find((thread) => thread.stage === "Active");
    const rowPadding = await group.locator(`[data-thread-id="${active.id}"]`).evaluate((node) =>
      parseFloat(getComputedStyle(node).paddingLeft));
    assert.equal(await more.evaluate((node) => parseFloat(getComputedStyle(node).paddingLeft)),
      rowPadding + 24, "The expansion button follows this list's indentation");
  }
  const stageOf = new Map(threads.map((thread) => [thread.id, thread.stage]));
  assert.deepEqual((await visible()).map((id) => stageOf.get(id)), ["Active", "Deferred", "Completed"]);
  for (const limit of [1, 3]) {
    fixture.run(["plugin", "config", "thread-stages", "set", "stagePreviewRows", String(limit)]);
    for (const stage of ["deferred", "completed"]) {
      await group.getByRole("button", { name: `Show ${4 - limit} more ${stage}`, exact: true }).waitFor();
    }
    assert.equal((await visible()).length, 1 + 2 * (limit - 1), "Each stage shares the configured row budget");
  }
  fixture.run(["plugin", "config", "thread-stages", "set", "stagePreviewRows", "2"]);
  for (const stage of ["deferred", "completed"]) {
    const more = group.getByRole("button", { name: `Show 2 more ${stage}`, exact: true });
    await more.focus();
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => document.activeElement?.matches("a[data-sidebar-thread-id]"));
    const selected = await page.evaluate(() => document.activeElement.dataset.sidebarThreadId);
    assert.ok(ids.has(selected), "Keyboard expansion focuses a revealed row in this list");
    await page.keyboard.press("Enter");
    await page.waitForURL(`**/threads/${selected}`);
    await page.mouse.move(1000, 800);
    await page.waitForFunction((id) => {
      const row = document.querySelector(`[data-ribbon-sidebar-root] [data-thread-id="${id}"]`);
      const background = row && getComputedStyle(row).backgroundColor;
      return background && background !== "transparent" && background !== "rgba(0, 0, 0, 0)";
    }, selected);
    await group.getByRole("button", { name: `Show fewer ${stage}`, exact: true }).click();
    await more.waitFor();
    await link(group, selected).waitFor();
    assert.ok(await link(group, selected).isVisible(), "The selected thread remains in the preview");
    await link(sidebar(page), outside.id).click();
    await page.waitForURL(`**/threads/${outside.id}`);
  }
  await page.waitForFunction(([element, ids]) =>
    [...element.querySelectorAll("[data-thread-id]")].filter((node) =>
      ids.includes(node.dataset.threadId) && node.getBoundingClientRect().height > 0).length === 3,
    [await group.elementHandle(), [...ids]]);
  assert.deepEqual((await visible()).map((id) => stageOf.get(id)), ["Active", "Deferred", "Completed"]);
}

export async function verifyStagePreviews({ stack, fixture, cases }) {
  const parent = fixture.threads.get(FEATURED_THREAD);
  const project = fixture.projects.get(FEATURED_PROJECT);
  const browser = await launch();
  const cleanup = [];
  try {
    fixture.run(["plugin", "config", "thread-stages", "set", "stagePreviewRows", "2"]);
    for (const testCase of cases) {
      console.log(`Checking stage previews: ${testCase}`);
      const stages = ["Completed", "Deferred", "Active", "Completed", "Deferred", "Completed", "Deferred"];
      let environmentId;
      const threads = testCase === "environment" || testCase === "pinned-environment"
        ? stages.map((stage, index) => {
            const thread = fixture.runJson([
              "thread", "spawn", "--project", project.id,
              ...(environmentId ? ["--environment", environmentId] : ["--machine", "screenshots", "--new-environment", "worktree"]),
              "--provider", `acp-${AGENT.id}`, "--model", AGENT.modelId,
              "--title", `Preview environment ${index}`, "--permission-mode", "accept-edits",
              "--prompt", "Check the preview.",
            ]);
            fixture.run(["thread", "wait", thread.id, "--status", "idle"]);
            environmentId = fixture.runJson(["thread", "show", thread.id]).environment.id;
            return { ...thread, stage };
          })
        : testCase === "children"
          ? stages.map((stage, index) => ({
              ...spawnChild(fixture, { parent, project, title: `Preview child ${index}`, AGENT }), stage,
            }))
          : THREADS.filter((spec) => spec.title !== FEATURED_THREAD).slice(0, stages.length)
            .map((spec, index) => ({ ...fixture.threads.get(spec.title), stage: stages[index] }));
      fixture.run(["thread-stages", "prefs", "set", "environmentGrouping", String(Boolean(environmentId))]);
      for (const thread of threads) {
        if (!testCase.startsWith("pinned") || environmentId) cleanup.push(() => fixture.run(["thread", "archive", thread.id]));
        else {
          const previous = fixture.runJson(["thread-stages", "show", thread.id]).stage;
          cleanup.push(() => {
            fixture.run(["thread", "unpin", thread.id]);
            fixture.run(["thread-stages", "stage", previous, thread.id]);
          });
          fixture.run(["thread", "pin", thread.id]);
        }
        if (testCase === "pinned-environment") fixture.run(["thread", "pin", thread.id]);
        fixture.run(["thread-stages", "stage", thread.stage, thread.id]);
      }
      const context = await openContext(browser);
      const page = await context.newPage();
      page.setDefaultTimeout(30_000);
      await page.goto(new URL(`/projects/${project.id}/threads/${parent.id}`, stack.serverUrl).href);
      const list = sidebar(page);
      await list.waitFor({ timeout: 120_000 });
      fixture.run(["thread-stages", "prefs", "set", "organizationMode",
        testCase === "pinned-project" ? "project" : testCase === "pinned-machine" ? "machine" : "chronological"]);
      const group = testCase === "children"
        ? list.locator(`[data-sidebar-parent-thread-id="${parent.id}"]`)
        : environmentId
          ? list.locator(`[data-sidebar-environment-id="${environmentId}"]`)
          : list.locator('[data-sidebar-sticky-header="false"]').filter({
              has: page.getByRole("button", { name: "Collapse Pinned section", exact: true }),
            });
      try {
        await group.waitFor();
        await verifyPreview({ page, group, threads, outside: parent, fixture });
      } catch (error) {
        console.error("Preview readiness", {
          testCase,
          groups: await group.count(),
          list: await list.innerText(),
          containers: await list.locator('[data-sidebar-sticky-header]').evaluateAll((nodes) =>
            nodes.map((node) => ({ header: node.dataset.sidebarStickyHeader, text: node.innerText }))),
        });
        throw error;
      }
      await context.close();
      while (cleanup.length) cleanup.pop()();
    }
  } finally {
    while (cleanup.length) cleanup.pop()();
    fixture.run(["thread-stages", "prefs", "reset", "environmentGrouping"]);
    fixture.run(["thread-stages", "prefs", "reset", "organizationMode"]);
    await browser.close();
  }
}
