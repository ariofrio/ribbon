import assert from "node:assert/strict";
import { FEATURED_PROJECT, FEATURED_THREAD, THREADS } from "../../screenshots/fixture.mjs";
import { launch, link, openContext, project, section, sidebar, withPreferenceSaved } from "./sidebar.mjs";

// Whether a click on the group sets its rows moving, rather than snapping
// them to where they end: counts what is animating inside the group's body
// two frames after the click lands, when both kinds of fold are under way.
async function recordFold(group) {
  await group.evaluate((node) => {
    node.dataset.e2eFoldAnimations = "";
    node.addEventListener("click", () => {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        node.dataset.e2eFoldAnimations = String(node.getAnimations({ subtree: true })
          // A working row's shimmer loops forever; a fold ends.
          .filter((animation) => animation.effect?.getTiming().iterations !== Infinity &&
            animation.effect?.target?.closest("[data-ribbon-group-body]")).length);
      }));
    }, { capture: true, once: true });
  });
}
async function foldAnimations(page, group) {
  await page.waitForFunction((node) => node.dataset.e2eFoldAnimations !== "", await group.elementHandle());
  return Number(await group.evaluate((node) => node.dataset.e2eFoldAnimations));
}

// Folded, a group still shows the open thread, and only that: opening a
// thread elsewhere empties it, and unfolding brings every row back.
async function verifyGroup({ page, list, group, label, prefKey, openThread, otherThread }) {
  // The folded group's rows and the empty check both read the group's own
  // subtree; the thread opened elsewhere is reached through the whole list.
  await page.goto(openThread.href, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await list.waitFor({ timeout: 120_000 });
  const opened = link(group, openThread.id);
  await opened.waitFor();
  await page.waitForFunction((id) => document.querySelector(`[data-ribbon-sidebar-root] [data-thread-id="${id}"]`)?.classList.contains("bb-sidebar-selected-row"), openThread.id);
  const visibleIds = () => group.evaluate((node) =>
    [...node.querySelectorAll("[data-thread-id]")].filter((row) => row.getBoundingClientRect().height > 0).map((row) => row.dataset.threadId));
  const all = await visibleIds();
  assert.ok(all.length >= 2, `${label} holds more than the open thread: ${all.join(",")}`);
  const folded = () => page.waitForFunction((id) => {
    const root = document.querySelector("[data-ribbon-sidebar-root]");
    const rows = [...root.querySelectorAll(`[data-sidebar-section-id], [data-sidebar-project-id]`)]
      .find((g) => g.querySelector(`[data-thread-id="${id}"]`))?.querySelectorAll("[data-thread-id]") ?? [];
    const visible = [...rows].filter((row) => row.getBoundingClientRect().height > 0);
    return visible.length === 1 && visible[0].dataset.threadId === id && visible[0].getAnimations({ subtree: true }).length === 0;
  }, openThread.id, { timeout: 10_000 });
  const unfolded = () => page.waitForFunction(([ids]) => {
    const root = document.querySelector("[data-ribbon-sidebar-root]");
    // Settled open, the body no longer clips its rows.
    const body = ids.map((id) => root.querySelector(`[data-thread-id="${id}"]`)?.closest("[data-ribbon-group-body]"))[0];
    return ids.every((id) => (root.querySelector(`[data-thread-id="${id}"]`)?.getBoundingClientRect().height ?? 0) > 0) &&
      body != null && getComputedStyle(body.firstElementChild).clipPath === "none";
  }, [all], { timeout: 10_000 }).catch(async (error) => {
    console.error("Unfold readiness", await group.evaluate((node, ids) => ({
      rows: ids.map((id) => {
        const row = node.querySelector(`[data-thread-id="${id}"]`);
        const body = row?.closest("[data-ribbon-group-body]");
        return { id, height: row?.getBoundingClientRect().height ?? null, clipPath: body ? getComputedStyle(body.firstElementChild).clipPath : null };
      }),
      text: node.innerText,
    }), all));
    throw error;
  });
  await group.getByRole("button", { name: `Collapse ${label} section`, exact: true }).hover();
  await recordFold(group);
  await withPreferenceSaved(page, prefKey, () =>
    group.getByRole("button", { name: `Collapse ${label} section`, exact: true }).click());
  // The others fold away around the open thread's row, rather than the group
  // snapping shut; the row stays, on its own, at the top level.
  assert.ok(await foldAnimations(page, group) > 0, `${label} folds around the open thread`);
  await folded();
  // Unfolding while it holds the open thread grows the others back around it.
  await recordFold(group);
  await withPreferenceSaved(page, prefKey, () =>
    group.getByRole("button", { name: `Expand ${label} section`, exact: true }).click());
  assert.ok(await foldAnimations(page, group) > 0, `${label} unfolds around the open thread`);
  await unfolded();
  await withPreferenceSaved(page, prefKey, () =>
    group.getByRole("button", { name: `Collapse ${label} section`, exact: true }).click());
  await folded();
  const preview = group.locator(`[data-thread-id="${openThread.id}"]`);
  assert.equal(await preview.getAttribute("data-ribbon-depth"), "0", "The preview sits at the top level");
  assert.ok(await preview.evaluate((row) => row.classList.contains("bb-sidebar-selected-row")), "The preview is drawn as the open row");
  // Opening a thread elsewhere, from the list itself, leaves the folded
  // group empty. (A page load instead would let bb unfold the group for any
  // thread that turns unread as the list fills in.)
  await link(list, otherThread.id).click();
  await page.waitForFunction((id) => document.querySelector(`[data-ribbon-sidebar-root] [data-thread-id="${id}"]`)?.classList.contains("bb-sidebar-selected-row"), otherThread.id);
  await group.getByRole("button", { name: `Expand ${label} section`, exact: true }).waitFor();
  assert.deepEqual(await visibleIds(), [], `A folded ${label} without the open thread shows no rows`);
  // Unfolding restores every row.
  await withPreferenceSaved(page, prefKey, () =>
    group.getByRole("button", { name: `Expand ${label} section`, exact: true }).click());
  await unfolded();
}

export async function verifyCollapsedPreview({ stack, fixture, cases }) {
  const webProject = fixture.projects.get(FEATURED_PROJECT);
  const featured = fixture.threads.get(FEATURED_THREAD);
  // Somewhere else to open a thread: outside the section, since bb unfolds
  // a group to reveal a thread opened inside it, and outside the project.
  // Every fixture thread starts in the section, so one leaves it for the run.
  const api = fixture.threads.get(THREADS.find((spec) => spec.project === "atlas-api" && spec.stage === null).title);
  const apiProject = fixture.projects.get("atlas-api");
  const href = (thread, proj) => new URL(`/projects/${proj.id}/threads/${thread.id}`, stack.serverUrl).href;
  // Moving selection must not replace this row in a collapsed stage preview.
  fixture.run(["thread-stages", "place", featured.id, "--to", "plugin:thread-stages:stages/Active"]);
  fixture.run(["thread", "update", api.id, "--clear-section"]);
  const browser = await launch();
  try {
    if (cases.includes("section")) {
      const context = await openContext(browser);
      const page = await context.newPage();
      page.setDefaultTimeout(30_000);
      const list = sidebar(page);
      await verifyGroup({
        page, list,
        group: section(page, fixture.section.id),
        label: fixture.section.name,
        prefKey: "collapsedThreadSections",
        openThread: { id: featured.id, href: href(featured, webProject) },
        otherThread: { id: api.id, href: href(api, apiProject) },
      });
      await context.close();
    }
    if (cases.includes("project")) {
      const context = await openContext(browser);
      const page = await context.newPage();
      page.setDefaultTimeout(30_000);
      const list = sidebar(page);
      // The mode is bb's own preference, chosen from a heading's menu.
      async function chooseOrganization(current, next) {
        const heading = list.getByRole("button", { name: `${current} actions`, exact: true })
          .locator('xpath=ancestor::*[@data-sidebar="group-label"][1]');
        await heading.hover();
        await heading.getByRole("button", { name: `${current} actions`, exact: true }).click();
        await page.getByRole("menuitem", { name: "Organize" }).hover();
        await withPreferenceSaved(page, "organizationMode", () =>
          page.getByRole("menuitemradio", { name: next, exact: true }).click());
        await page.keyboard.press("Escape");
      }
      await page.goto(href(featured, webProject), { waitUntil: "domcontentloaded", timeout: 120_000 });
      await list.waitFor({ timeout: 120_000 });
      await chooseOrganization(`${fixture.section.name} section`, "By project");
      try {
        await verifyGroup({
          page, list,
          group: project(page, webProject.id),
          label: webProject.name,
          prefKey: "collapsedProjects",
          openThread: { id: featured.id, href: href(featured, webProject) },
          otherThread: { id: api.id, href: href(api, apiProject) },
        });
      } finally {
        await chooseOrganization(webProject.name, "Custom");
      }
      await context.close();
    }
  } finally {
    await browser.close();
    fixture.run(["thread", "update", api.id, "--section", fixture.section.id]);
  }
}
