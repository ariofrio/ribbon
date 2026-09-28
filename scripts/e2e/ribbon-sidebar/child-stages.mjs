import assert from "node:assert/strict";
import { chromium } from "playwright";
import {
  AGENT,
  FEATURED_PROJECT,
  FEATURED_THREAD,
} from "../../screenshots/fixture.mjs";

const STAGES = "plugin:thread-stages:stages";

function stageFor(fixture, threadId) {
  const shown = fixture.runJson(["sidebar", "show", threadId]);
  return Array.isArray(shown)
    ? shown.find(({ placement }) => placement.groupingKey === STAGES)?.placement.groupId
    : shown.stage;
}

export async function verifyChildStages({ stack, fixture }) {
  const parent = fixture.threads.get(FEATURED_THREAD);
  const project = fixture.projects.get(FEATURED_PROJECT);
  const child = fixture.runJson([
    "thread", "spawn", "--project", project.id,
    "--machine", "screenshots", "--environment", project.root,
    "--parent-thread", parent.id, "--provider", `acp-${AGENT.id}`,
    "--model", AGENT.modelId, "--title", "Independent child stage",
    "--permission-mode", "accept-edits", "--prompt", "Check child stages.",
  ]);
  fixture.run(["thread", "wait", child.id, "--status", "idle"]);
  const parentStage = stageFor(fixture, parent.id);
  fixture.run(["sidebar", "place", child.id, "--to", `${STAGES}/Blocked`]);
  assert.equal(stageFor(fixture, child.id), "Blocked");
  assert.equal(stageFor(fixture, parent.id), parentStage);
  assert.ok(fixture.runJson([
    "sidebar", "list", "--include-children", "--scope", `${STAGES}/Blocked`,
  ]).some(({ id }) => id === child.id));

  const browser = await chromium.launch({ args: ["--mute-audio"] });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    try {
      await context.addInitScript(() => {
        localStorage.setItem("bb.sidebar.threadListProvider", JSON.stringify("ribbon-sidebar/ribbon-sidebar"));
      });
      const page = await context.newPage();
      await page.goto(new URL(`/projects/${project.id}/threads/${parent.id}`, stack.serverUrl).href);
      const sidebar = page.locator("[data-ribbon-sidebar-root][data-ribbon-sidebar-ready]");
      await sidebar.waitFor({ timeout: 120_000 });
      const row = sidebar.locator(`[data-thread-id="${child.id}"]`);
      await row.waitFor();
      const icon = row.locator('[aria-label="Blocked stage"]');
      await icon.waitFor();
      const rendered = await icon.evaluate((node) => {
        const style = getComputedStyle(node);
        const bounds = node.getBoundingClientRect();
        return { display: style.display, visibility: style.visibility, width: bounds.width, height: bounds.height };
      });
      assert.notEqual(rendered.display, "none");
      assert.equal(rendered.visibility, "visible");
      assert.ok(rendered.width > 0 && rendered.height > 0);
      await row.hover();
      await row.getByRole("button", { name: "Thread actions" }).click();
      await page.getByRole("menuitem", { name: "Move to stage" }).click();
      await page.getByRole("menuitem", { name: "Idle" }).click();
      await row.locator('[aria-label="Idle stage"]').waitFor({ state: "attached" });
      assert.equal(stageFor(fixture, child.id), "Idle");
      assert.equal(stageFor(fixture, parent.id), parentStage);
    } finally {
      await context.close();
    }
  } finally {
    await browser.close();
  }
}
