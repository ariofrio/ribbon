import assert from "node:assert/strict";
import { chromium } from "playwright";
import {
  applyPluginState,
  AGENT,
  FEATURED_PROJECT,
  FEATURED_THREAD,
} from "../screenshots/fixture.mjs";

const MODIFIER = process.platform === "darwin" ? "Meta" : "Control";

export async function verifyPluginUpgrade({ stack, fixture }) {
  const thread = fixture.threads.get(FEATURED_THREAD);
  const project = fixture.projects.get(FEATURED_PROJECT);
  await applyPluginState({ stack, ...fixture });
  // A personal project uses the fallback icon and can precede custom project icons.
  const personal = fixture.runJson([
    "thread", "spawn", "--project", "proj_personal",
    "--provider", `acp-${AGENT.id}`, "--model", AGENT.modelId,
    "--permission-mode", "accept-edits", "--title", "Personal icon fallback",
    "--prompt", "Check icon fallback",
  ]);
  fixture.run(["thread", "wait", personal.id, "--status", "idle"]);
  const browser = await chromium.launch({ args: ["--mute-audio"] });
  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(
      new URL(`/projects/${project.id}/threads/${thread.id}`, stack.serverUrl)
        .href,
    );
    await page
      .locator("[data-ribbon-sidebar-ready]")
      .waitFor({ timeout: 120_000 });
    await page
      .locator("[data-missing-keyboard-shortcuts-ready]")
      .waitFor({ state: "attached", timeout: 120_000 });

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
    await page.waitForFunction((projectId) => {
      const element = document.querySelector(
        `[data-ribbon-sidebar-root] [data-ribbon-icons-project="${CSS.escape(projectId)}"]`,
      );
      return (
        element &&
        getComputedStyle(element)
          .getPropertyValue("--ribbon-icons-project-glyph")
          .includes("url(")
      );
    }, project.id);

    const sideChatResponse = page.waitForResponse((response) =>
      response.url().endsWith("/plugins/missing-keyboard-shortcuts/rpc/createSideChat"),
    );
    await page.keyboard.press(`Shift+${MODIFIER}+KeyL`);
    const sideChatResult = await (await sideChatResponse).json();
    assert.equal(sideChatResult.ok, true);
    const reply = page.getByRole("textbox", { name: "Reply…" });
    try {
      await reply.waitFor({ timeout: 120_000 });
    } catch (error) {
      console.error("Side-chat composer failure", {
        pageErrors: errors,
        thread: fixture.run(["thread", "show", sideChatResult.result.threadId]),
        page: await page.locator("body").innerText(),
      });
      throw error;
    }
    await page.waitForFunction(
      (composer) => document.activeElement === composer,
      await reply.elementHandle(),
    );
    await page.keyboard.type("Side chat focus check");
    assert.equal(await reply.innerText(), "Side chat focus check");

    // The public command invokes the overlay's UI action. It still opens a
    // real host terminal through the SDK and existing panel integration.
    const terminalResponse = page.waitForResponse((response) =>
      response
        .url()
        .endsWith("/plugins/missing-keyboard-shortcuts/rpc/openTerminal"),
    );
    await page.keyboard.press("Control+Backquote");
    assert.equal((await (await terminalResponse).json()).ok, true);
    await page.locator(".xterm-screen").waitFor({ timeout: 120_000 });

    await page.locator("body").evaluate((body) => {
      body.tabIndex = -1;
      body.focus();
    });
    await page.keyboard.press(`${MODIFIER}+Shift+KeyP`);
    const commandSearch = page.getByRole("combobox", {
      name: "Search commands",
    });
    await commandSearch.waitFor();
    await commandSearch.fill(">file thread as completed");
    const completeCommand = page.getByText("File thread as Completed", {
      exact: true,
    });
    await completeCommand.waitFor();
    const stageResponse = page.waitForResponse((response) =>
      response.url().endsWith("/plugins/thread-stages/rpc/setWorkflowStage"),
    );
    await completeCommand.click();
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
