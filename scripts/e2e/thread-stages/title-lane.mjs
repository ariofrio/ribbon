import assert from "node:assert/strict";
import { AGENT, FEATURED_PROJECT, FEATURED_THREAD, THREADS } from "../../screenshots/fixture.mjs";
import { launch, link, openContext, parentAnswered, sidebar, spawnChild } from "./sidebar.mjs";

// The title runs to the row's edge unless something stands in the trailing
// lane at rest; hovering the row opens the lane for its actions. A toggle for
// shown children takes no room until then either.
const REST_PX = 8;
const LANE_PX = 36;

export async function verifyTitleLane({ stack, fixture }) {
  const project = fixture.projects.get(FEATURED_PROJECT);
  const child = fixture.threads.get(FEATURED_THREAD);
  const parent = fixture.threads.get(THREADS.find((spec) => spec.title === "Replace the legacy filter drawer").title);
  // Unread since the fixture made it: its lane holds bb's unread mark. (A
  // working row turns its stage ring instead and keeps no lane.)
  const unread = fixture.threads.get(THREADS.find((spec) => spec.title === "Compare managed Postgres plans").title);
  // A read, childless row with nothing to show in its lane.
  const plain = fixture.runJson([
    "thread", "spawn", "--project", project.id,
    "--machine", "screenshots", "--environment", project.root,
    "--provider", `acp-${AGENT.id}`, "--model", AGENT.modelId,
    "--title", "Title lane at rest", "--permission-mode", "accept-edits",
    "--prompt", "Confirm the title lane fixture is ready.",
  ]);
  // The fixture's threads are roots; a parent needs a child of its own.
  const shown = spawnChild(fixture, { parent, project, title: "Title lane child", AGENT });
  const browser = await launch();
  try {
    fixture.run(["thread", "wait", plain.id, "--status", "idle"]);
    await parentAnswered(fixture, parent, shown);
    fixture.run(["thread", "read", shown.id]);
    fixture.run(["thread", "update", plain.id, "--section", fixture.section.id]);
    fixture.run(["thread", "read", plain.id]);
    // Unread, the parent would show an indicator and keep its lane.
    fixture.run(["thread", "read", parent.id]);
    fixture.run(["thread-stages", "stage", "Active", parent.id]);
    fixture.run(["thread-stages", "stage", "Active", plain.id]);
    const context = await openContext(browser);
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
    await page.goto(new URL(`/projects/${project.id}/threads/${child.id}`, stack.serverUrl).href, { waitUntil: "domcontentloaded", timeout: 120_000 });
    const list = sidebar(page);
    await list.waitFor({ timeout: 120_000 });
    for (const id of [plain.id, parent.id, shown.id, unread.id]) await link(list, id).waitFor();
    const lane = (id) => page.evaluate((id) => {
      const row = document.querySelector(`[data-ribbon-sidebar-root] [data-thread-id="${id}"]`);
      const titleBox = row.querySelector("a[data-sidebar-thread-id]").parentElement;
      const chevron = row.querySelector('button[aria-label$=" threads"]');
      const indicator = row.querySelector("[data-sidebar-thread-trailing-indicator]");
      const box = chevron?.getBoundingClientRect();
      return {
        padding: parseFloat(getComputedStyle(titleBox).paddingRight),
        chevronWidth: box ? box.width : null,
        // What a click where the toggle will appear reaches at this moment.
        chevronReach: box ? document.elementFromPoint(box.right - 2, box.top + box.height / 2)?.closest("button") === chevron : null,
        indicator: indicator !== null,
      };
    }, id);
    // A row just read settles a moment later.
    const indicatorOf = (id) => page.evaluate((id) => {
      const node = document.querySelector(`[data-ribbon-sidebar-root] [data-thread-id="${id}"] [data-sidebar-thread-trailing-indicator]`);
      return node ? (node.querySelector("[aria-label]")?.getAttribute("aria-label") ?? node.getAttribute("aria-label") ?? "unlabelled") : null;
    }, id);
    const settled = async (id, message) => {
      try {
        await page.waitForFunction(
          (id) => document.querySelector(`[data-ribbon-sidebar-root] [data-thread-id="${id}"] [data-sidebar-thread-trailing-indicator]`) === null,
          id,
          { timeout: 20_000 },
        );
      } catch {
        assert.fail(`${message}; it shows ${await indicatorOf(id)}`);
      }
    };
    const rest = async (id) => { await page.mouse.move(1000, 700); await page.waitForFunction(() => document.querySelector("[data-ribbon-sidebar-root] [data-thread-id]:hover") === null); return lane(id); };
    const hovered = async (id) => { await link(list, id).hover(); await page.waitForFunction((id) => document.querySelector(`[data-ribbon-sidebar-root] [data-thread-id="${id}"]:hover`) !== null, id); return lane(id); };

    await settled(plain.id, "The plain row shows no indicator");
    const plainRest = await rest(plain.id);
    assert.equal(plainRest.padding, REST_PX, "A quiet row's title runs to the row's edge");
    assert.equal((await hovered(plain.id)).padding, LANE_PX, "Hovering opens the lane for the row's actions");

    await settled(parent.id, "The read parent shows no indicator");
    const parentRest = await rest(parent.id);
    assert.equal(parentRest.padding, REST_PX, "A parent with its children shown runs to the edge too");
    assert.equal(parentRest.chevronWidth, 0, "Its toggle takes no room at rest");
    assert.equal(parentRest.chevronReach, false, "Nor does it catch clicks at rest");
    const parentHovered = await hovered(parent.id);
    assert.equal(parentHovered.padding, LANE_PX);
    assert.equal(parentHovered.chevronWidth, 20, "Hovering shows the toggle");
    assert.equal(parentHovered.chevronReach, true, "and it takes clicks");

    const unreadRest = await rest(unread.id);
    assert.equal(unreadRest.indicator, true, "The unread row shows an indicator");
    assert.equal(unreadRest.padding, LANE_PX, "An indicator keeps the lane at rest");
    await context.close();
  } finally {
    await browser.close();
    fixture.run(["thread", "archive", plain.id]);
    fixture.run(["thread", "archive", shown.id]);
  }
}
