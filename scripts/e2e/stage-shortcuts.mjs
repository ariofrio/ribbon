import assert from "node:assert/strict";
import { chromium } from "playwright";
import { AGENT, FEATURED_PROJECT } from "../screenshots/fixture.mjs";
import { link, openContext, row, sidebar } from "./thread-stages/sidebar.mjs";

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
        [mac ? "Meta+Shift+." : "Control+Shift+.", "Active"],
        [mac ? "Meta+Shift+," : "Control+Shift+,", "Waiting"],
        [mac ? "Control+Meta+." : "Control+Alt+,", "Deferred"],
        [mac ? "Control+Alt+Meta+." : "Control+Alt+Shift+.", "BlockedOnOtherAgent"],
        [mac ? "Control+Meta+Shift+." : "Control+Alt+Shift+,", "BlockedOnThirdParty"],
        [mac ? "Meta+Alt+." : "Control+Alt+.", "Completed"],
      ];
      const context = await openContext(browser);
      try {
        await context.addInitScript((platform) => {
          Object.defineProperty(navigator, "platform", { get: () => platform });
        }, platform);
        const page = await context.newPage();
        await page.goto(new URL(`/projects/${project.id}/threads/${thread.id}`, stack.serverUrl).href);
        const list = sidebar(page);
        await list.waitFor({ timeout: 120_000 });
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
        for (const [shortcut, stage] of shortcuts) {
          console.log(`Checking ${platform}: ${shortcut} → ${stage}`);
          // Every shortcut must change the owned thread, even when another
          // shortcut moved selection elsewhere or the prior platform ended
          // on the same stage. Return through the rendered list without a boot.
          const initial = stage === "Active" ? "Waiting" : "Active";
          fixture.run(["thread-stages", "stage", initial, thread.id]);
          await row(list, thread.id).getByLabel(`${initial} stage`, { exact: true }).waitFor();
          await link(list, thread.id).click();
          await page.waitForURL(`**/threads/${thread.id}`);
          await editor.click();
          await page.waitForFunction((node) => document.activeElement === node, await editor.elementHandle());
          const responsePromise = page.waitForResponse(
            (response) => response.url().endsWith("/plugins/thread-stages/rpc/setWorkflowStage")
              && response.request().postDataJSON()?.threadId === thread.id,
            { timeout: 15_000 },
          );
          void responsePromise.catch(() => undefined);
          await page.keyboard.press(shortcut);
          const response = await responsePromise;
          assert.match(response.request().postData(), new RegExp(`"workflowStage"\\s*:\\s*"${stage}"`));
          const result = await response.json();
          assert.equal(result.ok, true, `${platform}: ${shortcut} files as ${stage}`);
          const { destination } = result.result;
          if (destination.kind === "thread") await page.waitForURL(`**/threads/${destination.threadId}`);
          if (destination.kind === "compose") await page.waitForURL((url) => !url.pathname.includes("/threads/"));
        }
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
}
