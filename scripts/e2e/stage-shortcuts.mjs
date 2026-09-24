import assert from "node:assert/strict";
import { chromium } from "playwright";
import { AGENT, FEATURED_PROJECT } from "../screenshots/fixture.mjs";

export async function verifyStageShortcuts({ stack, fixture }) {
  const project = fixture.projects.get(FEATURED_PROJECT);
  const thread = fixture.runJson([
    "thread", "spawn", "--project", project.id,
    "--provider", `acp-${AGENT.id}`, "--model", AGENT.modelId,
    "--permission-mode", "accept-edits", "--title", "Exercise stage shortcuts",
    "--prompt", "Check stage shortcuts",
  ]);
  fixture.run(["thread", "wait", thread.id, "--status", "idle"]);
  const browser = await chromium.launch({ args: ["--mute-audio"] });
  try {
    for (const platform of ["Linux x86_64", "Win32", "MacIntel"]) {
      const mac = platform === "MacIntel";
      const shortcuts = [
        [mac ? "Meta+." : "Control+.", "Completed"],
        [mac ? "Meta+Shift+." : "Control+Shift+.", "Idle"],
        [mac ? "Control+Meta+." : "Control+Alt+,", "Deferred"],
        [mac ? "Control+Meta+Shift+." : "Control+Alt+Shift+,", "Blocked"],
        [mac ? "Meta+Alt+." : "Control+Alt+.", "Completed"],
      ];
      for (const [shortcut, stage] of shortcuts) {
        console.log(`Checking ${platform}: ${shortcut} → ${stage}`);
        const context = await browser.newContext();
        await context.addInitScript((platform) => {
          Object.defineProperty(navigator, "platform", { get: () => platform });
        }, platform);
        const page = await context.newPage();
        await page.goto(new URL(`/projects/${project.id}/threads/${thread.id}`, stack.serverUrl).href);
        const editor = page.locator('[data-app-composer-role="primary"] [contenteditable="true"]');
        await editor.waitFor({ timeout: 120_000 });
        // The host snapshots commands when opening the palette. Refresh that
        // snapshot until this plugin has registered, rather than trusting the
        // host composer (which can mount before plugin code loads).
        const deadline = Date.now() + 120_000;
        for (;;) {
          await page.keyboard.press(`${mac ? "Meta" : "Control"}+Shift+KeyP`);
          const search = page.getByRole("combobox", { name: "Search commands" });
          await search.fill(">file thread as completed");
          const ready = await page.getByText("File thread as Completed", { exact: true }).isVisible();
          await page.keyboard.press("Escape");
          if (ready) break;
          assert.ok(Date.now() < deadline, `${platform}: stage commands did not register`);
        }
        await editor.click();
        const responsePromise = page.waitForResponse(
          (response) => response.url().endsWith("/plugins/ribbon-sidebar/rpc/setWorkflowStage"),
          { timeout: 15_000 },
        );
        await page.keyboard.press(shortcut);
        const response = await responsePromise;
        assert.match(response.request().postData(), new RegExp(`"workflowStage"\\s*:\\s*"${stage}"`));
        assert.equal((await response.json()).ok, true, `${platform}: ${shortcut} files as ${stage}`);
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
}
