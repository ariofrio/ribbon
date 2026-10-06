import assert from "node:assert/strict";
import { FEATURED_PROJECT, FEATURED_THREAD } from "../../screenshots/fixture.mjs";
import { launch, openContext, row, sidebar } from "./sidebar.mjs";

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
        padding: parseFloat(getComputedStyle(title).paddingRight),
        width: Math.max(...boxes.map((box) => box.right)) - Math.min(...boxes.map((box) => box.left)),
        count: buttons.length,
      };
    });
    assert.equal(geometry.count, 4);
    assert.ok(geometry.padding >= geometry.width, "the title leaves room for every configured action and the menu");
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
  } finally {
    await browser.close();
    fixture.run(["thread-stages", "prefs", "set", "rowActions", JSON.stringify(previous.value)]);
  }
}
