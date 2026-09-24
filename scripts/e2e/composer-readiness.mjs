import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { AGENT, FEATURED_PROJECT } from "../screenshots/fixture.mjs";

export async function verifyComposerReadiness({ stack, fixture }) {
  const project = fixture.projects.get(FEATURED_PROJECT);
  const thread = fixture.runJson([
    "thread", "spawn", "--project", project.id,
    "--machine", "screenshots", "--environment", project.root,
    "--provider", `acp-${AGENT.id}`, "--model", AGENT.modelId,
    "--permission-mode", "accept-edits", "--title", "Composer readiness",
    "--prompt", "Check side chat focus",
  ]);
  fixture.run(["thread", "wait", thread.id, "--status", "idle"]);
  const browser = await chromium.launch({ args: ["--mute-audio"] });
  let context;
  try {
    context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await context.tracing.start({ snapshots: true, sources: true });
    const page = await context.newPage();
    await page.goto(new URL(`/projects/${project.id}/threads/${thread.id}`, stack.serverUrl).href);
    await page.locator("[data-missing-keyboard-shortcuts-ready]").waitFor({ state: "attached" });
    const primary = page.locator('[data-app-composer-role="primary"] [role="textbox"]');
    await primary.waitFor();
    await primary.focus();

    const panelSelector = '[data-testid="plugin-panel-tab-content"] > [data-bb-plugin="missing-keyboard-shortcuts"]';
    // Hold the mounted composer out of layout until its editor is ready. A
    // panel can become visible without changing any of the composer's children.
    const hiddenComposer = await page.addStyleTag({
      content: `${panelSelector} [data-app-composer-role="secondary"] { display: none !important; }`,
    });
    const response = page.waitForResponse((response) =>
      response.url().endsWith("/plugins/missing-keyboard-shortcuts/rpc/createSideChat"),
    );
    await page.keyboard.press(`Shift+${process.platform === "darwin" ? "Meta" : "Control"}+KeyL`);
    assert.equal((await (await response).json()).ok, true);
    const reply = page.locator(panelSelector).getByRole("textbox", { name: "Reply…", includeHidden: true });
    await reply.waitFor({ state: "attached", timeout: 120_000 });
    await page.waitForFunction((node) => node.isContentEditable, await reply.elementHandle());
    assert.equal(await reply.isVisible(), false);
    fixture.run(["thread", "update", thread.id, "--title", "Composer readiness updated"]);
    await page.getByText("Composer readiness updated", { exact: true }).first().waitFor();
    await page.locator(panelSelector).evaluate(async (panel) => {
      await Promise.allSettled(panel.getAnimations({ subtree: true })
        .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
        .map((animation) => animation.finished));
    });
    await hiddenComposer.evaluate((node) => node.remove());
    await reply.waitFor();
    await page.waitForFunction((node) => document.activeElement === node, await reply.elementHandle());
    await page.keyboard.type("Focus survived delayed visibility");
    assert.equal(await reply.innerText(), "Focus survived delayed visibility");
  } catch (error) {
    const directory = resolve(".scratch/e2e");
    await mkdir(directory, { recursive: true })
      .then(() => context?.tracing.stop({ path: resolve(directory, "composer-readiness.trace.zip") }))
      .catch((diagnosticError) => console.error("Could not save the composer-readiness trace:", diagnosticError));
    throw error;
  } finally {
    await browser.close();
  }
}
