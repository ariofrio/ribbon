import assert from "node:assert/strict";
import { FEATURED_PROJECT, FEATURED_THREAD } from "../../screenshots/fixture.mjs";
import { carryTo, dropMarker, launch, link, openContext, pickUp, project, row, section, sidebar, STAGES, withPreferenceSaved } from "./sidebar.mjs";

export async function verifyStagePlacement({ stack, fixture }) {
  const returning = fixture.threads.get("Add keyboard navigation to filters");
  const other = fixture.threads.get(FEATURED_THREAD);
  const projectId = fixture.projects.get(FEATURED_PROJECT).id;
  const place = (thread, stage) => fixture.run(["thread-stages", "place", thread.id, "--to", `${STAGES}/${stage}`]);
  const labels = { Active: "Active", Deferred: "Deferred", BlockedOnOtherAgent: "Blocked on other agent", BlockedOnThirdParty: "Blocked on third party" };
  const mac = process.platform === "darwin";
  const shortcuts = {
    Active: mac ? "Meta+Shift+." : "Control+Shift+.",
    Deferred: mac ? "Control+Meta+." : "Alt+Control+,",
    BlockedOnOtherAgent: mac ? "Alt+Control+Meta+." : "Alt+Control+Shift+.",
    BlockedOnThirdParty: mac ? "Control+Meta+Shift+." : "Alt+Control+Shift+,",
  };
  const browser = await launch();
  try {
    for (const organization of ["chronological", "project"]) {
      const context = await openContext(browser, { organization, viewport: { width: 1280, height: 1200 } });
      context.setDefaultTimeout(20_000);
      let page = await context.newPage();
      await page.goto(stack.serverUrl);
      await sidebar(page).waitFor({ timeout: 120_000 });
      async function chooseOrganization(current, next) {
        const heading = sidebar(page).getByRole("button", { name: `${current} actions`, exact: true })
          .locator('xpath=ancestor::*[@data-sidebar="group-label"][1]');
        await heading.hover();
        await heading.getByRole("button", { name: `${current} actions`, exact: true }).click();
        await page.getByRole("menuitem", { name: "Organize" }).hover();
        await withPreferenceSaved(page, "organizationMode", () =>
          page.getByRole("menuitemradio", { name: next, exact: true }).click());
        await page.keyboard.press("Escape");
      }
      if (organization === "project") {
        await chooseOrganization(`${fixture.section.name} section`, "By project");
      }
      let group = organization === "project" ? project(page, projectId) : section(page, fixture.section.id);
      const grouping = organization === "project" ? "builtin:projects" : "builtin:sections";
      const groupId = organization === "project" ? projectId : fixture.section.id;

      async function mainOrder() {
        return group.locator('[aria-label$=" stage"]').evaluateAll((icons) =>
          icons.filter((icon) =>
            ["Active stage", "Blocked on other agent stage", "Blocked on third party stage"].includes(icon.getAttribute("aria-label")))
            .map((icon) => icon.closest("[data-thread-id]"))
            .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)
            .map((row) => row.dataset.threadId));
      }
      async function afterOther() {
        await page.waitForFunction(({ selector, first, second }) => {
          const group = document.querySelector(selector);
          const a = group.querySelector(`[data-thread-id="${first}"]`);
          const b = group.querySelector(`[data-thread-id="${second}"]`);
          return a && b && a.getBoundingClientRect().top < b.getBoundingClientRect().top;
        }, {
          selector: `[data-ribbon-sidebar-root] [data-sidebar-${organization === "project" ? "project" : "section"}-id="${groupId}"]`,
          first: other.id, second: returning.id,
        });
      }
      async function first(stage, thread = returning) {
        await row(group, thread.id).getByLabel(`${labels[stage]} stage`, { exact: true }).waitFor();
        await page.waitForFunction(({ selector, id, deferred }) => {
          const group = document.querySelector(selector);
          const icons = [...group.querySelectorAll('[aria-label$=" stage"]')].filter((icon) =>
            deferred ? icon.getAttribute("aria-label") === "Deferred stage" :
              ["Active stage", "Blocked on other agent stage", "Blocked on third party stage"].includes(icon.getAttribute("aria-label")));
          const rows = icons.map((icon) => icon.closest("[data-thread-id]"));
          const target = rows.find((row) => row.dataset.threadId === id);
          return target && rows.every((row) => target.getBoundingClientRect().top <= row.getBoundingClientRect().top);
        }, {
          selector: `[data-ribbon-sidebar-root] [data-sidebar-${organization === "project" ? "project" : "section"}-id="${groupId}"]`,
          id: thread.id, deferred: stage === "Deferred",
        });
      }
      async function move(stage, method) {
        if (method === "cli") {
          place(returning, stage);
        } else if (method === "menu") {
          await row(group, returning.id).hover();
          await row(group, returning.id).getByRole("button", { name: "Thread actions", exact: true }).click();
          await page.getByRole("menuitem", { name: /Move to stage/ }).hover();
          await page.getByRole("menuitemradio", { name: labels[stage], exact: true }).click();
        } else {
          await page.goto(new URL(`/projects/${projectId}/threads/${returning.id}`, stack.serverUrl).href,
            { waitUntil: "domcontentloaded" });
          await sidebar(page).waitFor({ timeout: 120_000 });
          await page.locator('[data-app-composer-role="primary"] [contenteditable="true"]').click();
          const saved = page.waitForResponse((response) => response.url().endsWith("/rpc/setWorkflowStage"));
          await page.keyboard.press(shortcuts[stage]);
          const response = await saved;
          assert.ok(response.ok());
          const { destination } = (await response.json()).result;
          if (destination.kind === "thread") {
            await page.waitForURL(`**/threads/${destination.threadId}`);
          }
        }
        await row(group, returning.id).getByLabel(`${labels[stage]} stage`, { exact: true }).waitFor();
      }
      for (const method of ["cli", "menu", "shortcut"]) {
        for (const stage of ["BlockedOnOtherAgent", "BlockedOnThirdParty", "Deferred"]) {
          console.log(`Checking ${organization} ${method} stage entry: ${stage}`);
          place(returning, "Active");
          fixture.run(["thread-stages", "place", returning.id, "--to", `${grouping}/${groupId}`, "--after", other.id]);
          await row(group, returning.id).getByLabel("Active stage", { exact: true }).waitFor();
          await afterOther();
          const before = await mainOrder();
          await move(stage, method);
          if (stage === "Deferred") {
            await first(stage);
            await move("Active", method);
            await afterOther();
          } else {
            assert.deepEqual(await mainOrder(), before);
            await move(stage === "BlockedOnOtherAgent" ? "BlockedOnThirdParty" : "BlockedOnOtherAgent", method);
            assert.deepEqual(await mainOrder(), before);
            await move("Active", method);
            await page.reload({ waitUntil: "domcontentloaded" });
            await sidebar(page).waitFor({ timeout: 120_000 });
            await row(group, returning.id).getByLabel("Active stage", { exact: true }).waitFor();
            assert.deepEqual(await mainOrder(), before);
          }
        }
      }
      place(other, "Deferred");
      place(returning, "Deferred");
      await first("Deferred");
      console.log(`Checking ${organization} Deferred drag and keyboard reordering`);
      await pickUp(page, link(group, returning.id));
      await carryTo(page, link(group, other.id), "after");
      await dropMarker(group).waitFor();
      const dragged = page.waitForResponse((response) => response.url().endsWith("/rpc/updatePlacementV1"));
      await page.mouse.up();
      assert.ok((await dragged).ok());
      await first("Deferred", other);
      await page.goto(new URL(`/projects/${projectId}/threads/${returning.id}`, stack.serverUrl).href,
        { waitUntil: "domcontentloaded" });
      await sidebar(page).waitFor({ timeout: 120_000 });
      await page.locator('[data-app-composer-role="primary"] [contenteditable="true"]').click();
      const reordered = page.waitForResponse((response) => response.url().endsWith("/rpc/reorderThread"));
      await page.keyboard.press(mac ? "Alt+Meta+ArrowUp" : "Alt+Control+ArrowUp");
      assert.ok((await reordered).ok());
      await first("Deferred");
      // A fresh client must read the saved preview order.
      const url = page.url();
      const fresh = await context.newPage();
      await page.close({ runBeforeUnload: false });
      page = fresh;
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await sidebar(page).waitFor({ timeout: 120_000 });
      group = organization === "project" ? project(page, projectId) : section(page, fixture.section.id);
      await first("Deferred");
      place(other, "Active");
      if (organization === "project") {
        await chooseOrganization(fixture.projects.get(FEATURED_PROJECT).name, "Custom");
      }
      await context.close();
    }
  } finally {
    place(other, "Active");
    place(returning, "Completed");
    await browser.close();
  }
}
