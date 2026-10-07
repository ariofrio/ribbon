import assert from "node:assert/strict";
import { FEATURED_PROJECT, FEATURED_THREAD } from "../../screenshots/fixture.mjs";
import { launch, openContext, row, sidebar } from "./sidebar.mjs";
import { pullRequest } from "./pr-status.mjs";

export async function verifyRowActions({ stack, fixture }) {
  const project = fixture.projects.get(FEATURED_PROJECT);
  const thread = fixture.threads.get(FEATURED_THREAD);
  const previous = fixture.runJson(["thread-stages", "prefs", "get", "rowActions"]);
  fixture.run(["thread-stages", "prefs", "set", "rowActions", '["pin","copyLink","rename"]']);
  const browser = await launch();
  try {
    const context = await openContext(browser);
    const page = await context.newPage();
    await page.goto(new URL(`/projects/${project.id}/threads/${thread.id}`, stack.serverUrl).href);
    const list = sidebar(page);
    await list.waitFor({ timeout: 120_000 });
    const target = row(list, thread.id);
    await target.hover();
    const pin = target.getByRole("button", { name: "Pin", exact: true });
    await pin.waitFor();
    const geometry = await target.evaluate((element) => {
      const title = element.querySelector("a[data-sidebar-thread-id]").parentElement;
      const buttons = [...element.querySelectorAll("button")].filter((button) =>
        ["Pin", "Copy thread link", "Rename", "Thread actions"].includes(button.getAttribute("aria-label")));
      const boxes = buttons.map((button) => button.getBoundingClientRect());
      return {
        titleRight: title.querySelector(".bb-thread-title").getBoundingClientRect().right,
        controlsLeft: Math.min(...boxes.map((box) => box.left)),
        count: buttons.length,
      };
    });
    assert.equal(geometry.count, 4);
    assert.ok(geometry.titleRight <= geometry.controlsLeft + 4, "the title leaves room for every configured action and the menu");
    await pin.click();
    await target.getByRole("button", { name: "Unpin", exact: true }).waitFor();
    await target.hover();
    await target.getByRole("button", { name: "Unpin", exact: true }).click();
    await target.getByRole("button", { name: "Pin", exact: true }).waitFor();
    await target.hover();
    await target.getByRole("button", { name: "Thread actions", exact: true }).click();
    await page.getByRole("menuitem", { name: "Customize row actions", exact: true }).click();
    await list.getByText("Customize row actions", { exact: true }).waitFor();
    await context.close();

    const mobile = await openContext(browser, {
      viewport: { width: 600, height: 900 }, hasTouch: true, isMobile: true,
    });
    const mobilePage = await mobile.newPage();
    await mobilePage.route("**/api/v1/environments/*/pull-request*", (route) =>
      route.fulfill({ json: pullRequest("blocked") }));
    await mobilePage.route("**/rpc/pullRequestDetailsV1", (route) =>
      route.fulfill({ status: 500, json: { ok: false, error: { message: "gh unavailable" } } }));
    await mobilePage.goto(new URL(`/projects/${project.id}/threads/${thread.id}`, stack.serverUrl).href);
    await mobilePage.getByTestId("app-sidebar-trigger-overlay").getByRole("button").tap();
    const mobileRow = row(sidebar(mobilePage), thread.id);
    await mobileRow.getByText("#12345", { exact: true }).waitFor({ timeout: 120_000 });
    const coarse = await mobileRow.evaluate((element) => ({
      pointer: matchMedia("(pointer: coarse)").matches,
      padding: parseFloat(getComputedStyle(element.querySelector("a[data-sidebar-thread-id]").parentElement).paddingRight),
      actionWidth: element.querySelector('button[aria-label="Copy thread link"]').getBoundingClientRect().width,
      rowWidth: element.getBoundingClientRect().width,
    }));
    assert.equal(coarse.pointer, true);
    assert.ok(coarse.rowWidth > 0);
    assert.equal(coarse.actionWidth, 0, "desktop hover actions are hidden on touch screens");
    assert.equal(coarse.padding, 36, "hidden hover actions leave the normal trailing lane on touch screens");
    await mobile.close();
  } finally {
    await browser.close();
    fixture.run(["thread-stages", "prefs", "set", "rowActions", JSON.stringify(previous.value)]);
  }
}
