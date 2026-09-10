import assert from "node:assert/strict";
import { chromium } from "playwright";
import {
  applyPluginState,
  FEATURED_PROJECT,
  FEATURED_THREAD,
} from "../screenshots/fixture.mjs";

export async function verifyPluginUpgrade({ stack, fixture }) {
  const thread = fixture.threads.get(FEATURED_THREAD);
  const project = fixture.projects.get(FEATURED_PROJECT);
  await applyPluginState({ stack, ...fixture });
  const browser = await chromium.launch({ args: ["--mute-audio"] });
  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const keybindingsReady = page.waitForResponse(
      (response) =>
        response
          .url()
          .endsWith(
            "/plugins/missing-keyboard-shortcuts/rpc/listAppKeybindings",
          ) && response.ok(),
    );
    await page.goto(
      new URL(`/projects/${project.id}/threads/${thread.id}`, stack.serverUrl)
        .href,
    );
    await page
      .locator("[data-ribbon-sidebar-ready]")
      .waitFor({ timeout: 120_000 });
    await keybindingsReady;

    // These controls are now mounted by the public navigation slot. Verify
    // their rendered position, then use a real pointer to open their menu.
    const navigation = page.getByRole("navigation", {
      name: "Sidebar navigation",
      exact: true,
    });
    const options = navigation.getByRole("button", {
      name: "Sidebar display options",
    });
    await options.waitFor();
    const optionsBox = await options.boundingBox();
    const newThreadBox = await navigation
      .getByRole("button", { name: /New thread/ })
      .first()
      .boundingBox();
    assert.ok(optionsBox && newThreadBox && optionsBox.y < newThreadBox.y);
    await navigation.locator("[data-ribbon-sidebar-top-controls]").hover();
    await page.waitForFunction(() => {
      const button = document.querySelector(
        '[data-ribbon-sidebar-top-controls] [aria-label="Sidebar display options"]',
      );
      return (
        button &&
        getComputedStyle(button).pointerEvents === "auto" &&
        getComputedStyle(button).opacity === "1"
      );
    });
    await options.click();
    await page.getByRole("menuitem", { name: /^Sort/ }).waitFor();
    await page.keyboard.press("Escape");

    const icon = page
      .locator("header")
      .getByRole("button", { name: `Icon for ${FEATURED_PROJECT}` });
    await icon.waitFor({ timeout: 120_000 });
    await icon.click();
    await page.getByRole("searchbox", { name: "Search icons" }).waitFor();
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => {
      const element = document.querySelector(
        "[data-ribbon-sidebar-root] [data-ribbon-icons-project]",
      );
      return (
        element &&
        getComputedStyle(element)
          .getPropertyValue("--ribbon-icons-project-glyph")
          .includes("url(")
      );
    });

    // The shortcut handler now lives in an overlay. It still opens a real
    // host terminal via the SDK and the existing panel integration.
    const terminalResponse = page.waitForResponse((response) =>
      response
        .url()
        .endsWith("/plugins/missing-keyboard-shortcuts/rpc/openTerminal"),
    );
    await page.keyboard.press("Control+Backquote");
    assert.equal((await (await terminalResponse).json()).ok, true);
    await page.locator(".xterm-screen").waitFor({ timeout: 120_000 });
    const stageResponse = page.waitForResponse((response) =>
      response.url().endsWith("/plugins/thread-stages/rpc/setWorkflowStage"),
    );
    await page.keyboard.press("Meta+Period");
    const response = await stageResponse;
    const stageResult = await response.json();
    assert.equal(stageResult.ok, true);
    const destination = stageResult.result.destination;
    if (destination.kind === "thread") {
      await page.waitForURL(new RegExp(`/threads/${destination.threadId}$`));
    }

    assert.deepEqual(errors, []);
    await context.close();
  } finally {
    await browser.close();
  }
}
