import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { AGENT } from "../../screenshots/fixture.mjs";
import { launch, link, openContext, section, sidebar, sidebarRoot } from "./sidebar.mjs";

export async function verifyNewThreadRouting({ stack, fixture }) {
  const groupId = fixture.section.id;
  const project = fixture.projects.get("atlas-api");
  assert.ok(project, "The routing fixture is missing atlas-api");
  const browser = await launch();
  try {
    const context = await openContext(browser, {
      viewport: { width: 1280, height: 800 },
      reducedMotion: "reduce",
    });
    await context.addInitScript(
      ({ providerId, modelId }) => {
        window.localStorage.setItem("bb.promptbox.provider", providerId);
        window.localStorage.setItem(`bb.promptbox.model-${encodeURIComponent(providerId)}-1`, modelId);
      },
      { providerId: `acp-${AGENT.id}`, modelId: AGENT.modelId },
    );
    const page = await context.newPage();
    await page.goto(new URL(`/projects/${encodeURIComponent(project.id)}`, stack.serverUrl).href, {
      waitUntil: "domcontentloaded",
    });
    await sidebar(page).waitFor({ timeout: 120_000 });
    const composer = page.locator('[data-app-composer-role="primary"]');
    await composer.waitFor({ timeout: 120_000 });
    const group = section(page, groupId);
    const create = group.getByRole("button", { name: "New thread in Atlas section", exact: true });
    await group.locator('[data-sidebar="group-label"]').hover();
    await create.click();
    const environmentButton = composer.getByRole("button", { name: "Environment" });
    const environmentChoice = page
      .locator('[role="menuitem"], [role="menuitemradio"], [role="option"]')
      .filter({ hasText: /^Project checkout$/ });
    await environmentButton.click();
    await environmentChoice.click();
    await environmentChoice.waitFor({ state: "hidden" });
    await environmentButton.filter({ hasText: "Project checkout" }).waitFor();
    const modelButton = composer.getByRole("button", { name: /Provider, model and reasoning/ });
    await modelButton.filter({ hasText: AGENT.modelName }).waitFor();
    const editor = composer.locator('[contenteditable="true"]');
    const prompt = "Investigate why webhook retries stall after the third attempt.";
    await editor.click();
    await editor.pressSequentially(prompt, { delay: 10 });
    assert.equal(await editor.textContent(), prompt);
    await composer.getByRole("button", { name: "Submit (Enter)" }).waitFor();
    await composer.locator('[data-promptbox-submit-action][type="submit"]').click({ timeout: 120_000 });
    await page.waitForURL(/\/threads\/[^/]+/, { timeout: 120_000 });
    const threadId = new URL(page.url()).pathname.match(/\/threads\/([^/]+)/)?.[1];
    assert.ok(threadId, `Could not read the created thread ID from ${page.url()}`);

    const deadline = Date.now() + 30_000;
    let placed = null;
    while (Date.now() <= deadline) {
      const thread = fixture.runJson(["thread-stages", "show", threadId]);
      placed = thread.section.id;
      if (placed === groupId) {
        await link(group, threadId).waitFor();
        assert.equal(
          await group.locator("a[data-sidebar-thread-id]").first().getAttribute("data-sidebar-thread-id"),
          threadId,
          "New roots enter at the top of their section",
        );
        await context.close();
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    assert.equal(placed, groupId, `Section New thread was placed in ${placed ?? "no section"}`);
  } finally {
    await browser.close();
  }
}

export async function waitForThreadStages({ bb, cliEnv }) {
  const deadline = Date.now() + 120_000;
  for (;;) {
    try {
      const output = execFileSync(bb, ["thread-stages", "list", "--json"], { env: cliEnv, encoding: "utf8" });
      if (Array.isArray(JSON.parse(output))) return;
    } catch {
      // The plugin may still be initializing.
    }
    if (Date.now() > deadline) throw new Error("Timed out waiting for the Thread stages CLI");
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}
