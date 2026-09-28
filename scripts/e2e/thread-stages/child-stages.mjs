import assert from "node:assert/strict";
import { AGENT, FEATURED_PROJECT, FEATURED_THREAD } from "../../screenshots/fixture.mjs";
import { launch, openContext, row, sidebar, spawnChild, STAGES } from "./sidebar.mjs";

export function stageFor(fixture, threadId) {
  const shown = fixture.runJson(["sidebar", "show", threadId]);
  return Array.isArray(shown)
    ? shown.find(({ placement }) => placement.groupingKey === STAGES)?.placement.groupId
    : shown.stage;
}

export async function verifyChildStages({ stack, fixture }) {
  const parent = fixture.threads.get(FEATURED_THREAD);
  const project = fixture.projects.get(FEATURED_PROJECT);
  const child = spawnChild(fixture, { parent, project, title: "Independent child stage", AGENT });
  const parentStage = stageFor(fixture, parent.id);
  fixture.run(["sidebar", "place", child.id, "--to", `${STAGES}/BlockedOnThirdParty`]);
  assert.equal(stageFor(fixture, child.id), "BlockedOnThirdParty");
  assert.equal(stageFor(fixture, parent.id), parentStage);
  assert.ok(fixture.runJson([
    "sidebar", "list", "--include-children", "--scope", `${STAGES}/BlockedOnThirdParty`,
  ]).some(({ id }) => id === child.id));

  const browser = await launch();
  try {
    const context = await openContext(browser);
    try {
      const page = await context.newPage();
      await page.goto(new URL(`/projects/${project.id}/threads/${parent.id}`, stack.serverUrl).href);
      const list = sidebar(page);
      await list.waitFor({ timeout: 120_000 });
      const childRow = row(list, child.id);
      await childRow.waitFor();
      const icon = childRow.locator('[aria-label="Blocked on third party stage"]');
      await icon.waitFor();
      const rendered = await icon.evaluate((node) => {
        const style = getComputedStyle(node);
        const bounds = node.getBoundingClientRect();
        return { display: style.display, visibility: style.visibility, width: bounds.width, height: bounds.height };
      });
      assert.notEqual(rendered.display, "none");
      assert.equal(rendered.visibility, "visible");
      assert.ok(rendered.width > 0 && rendered.height > 0);
      await childRow.hover();
      await childRow.getByRole("button", { name: "Thread actions" }).click();
      await page.getByRole("menuitem", { name: "Move to stage" }).click();
      await page.getByRole("menuitemradio", { name: "Active" }).click();
      await childRow.locator('[aria-label="Active stage"]').waitFor({ state: "attached" });
      assert.equal(stageFor(fixture, child.id), "Active");
      assert.equal(stageFor(fixture, parent.id), parentStage);
    } finally {
      await context.close();
    }
  } finally {
    await browser.close();
  }
}
