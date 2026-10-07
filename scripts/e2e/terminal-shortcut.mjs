import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { FEATURED_PROJECT, FEATURED_THREAD } from "../screenshots/fixture.mjs";

export async function verifyTerminalShortcut({ stack, fixture }) {
  const project = fixture.projects.get(FEATURED_PROJECT);
  const thread = fixture.threads.get(FEATURED_THREAD);
  const browser = await chromium.launch({ args: ["--mute-audio"] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.tracing.start({ snapshots: true, sources: true });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.goto(new URL(`/projects/${project.id}/threads/${thread.id}`, stack.serverUrl).href);
    await page.locator("[data-missing-keyboard-shortcuts-ready]").waitFor({ state: "attached" });
    const primary = page.locator('[data-app-composer-role="primary"] [role="textbox"]');
    await primary.click();
    const primaryText = await primary.innerText();
    const response = page.waitForResponse((response) =>
      response.url().endsWith("/plugins/missing-keyboard-shortcuts/rpc/openTerminal"));
    const start = performance.now();
    await page.keyboard.press("Control+Backquote");
    const opened = await (await response).json();
    assert.equal(opened.ok, true);
    assert.equal(opened.result.created, true);
    await page.locator("[data-app-terminal] .xterm-screen").waitFor({ timeout: 30_000 });
    const terminalFocused = () => page.waitForFunction(() => {
      const input = document.activeElement;
      const pane = input?.closest("[data-app-terminal]");
      const bounds = pane?.getBoundingClientRect();
      return input?.matches(".xterm-helper-textarea") && bounds?.width > 0 && bounds?.height > 0;
    }, null, { timeout: 5_000 });
    await terminalFocused();
    const coldMs = performance.now() - start;
    assert.ok(coldMs < 5_000, `First terminal activation took ${Math.round(coldMs)} ms`);
    const activateExisting = async (label) => {
      const response = page.waitForResponse((response) =>
        response.url().endsWith("/plugins/missing-keyboard-shortcuts/rpc/openTerminal"));
      const start = performance.now();
      await page.keyboard.press("Control+Backquote");
      const reused = await (await response).json();
      assert.equal(reused.ok, true);
      assert.deepEqual(reused.result, { created: false, terminalId: opened.result.terminalId });
      await terminalFocused();
      const elapsed = performance.now() - start;
      assert.ok(elapsed < 1_000, `${label} took ${Math.round(elapsed)} ms`);
      console.log(`${label}: ${Math.round(elapsed)} ms`);
    };
    console.log(`First terminal activation: ${Math.round(coldMs)} ms`);
    await primary.click();
    await activateExisting("Focus the visible terminal from the composer");
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await page.keyboard.press("Control+Backquote");
      await page.locator("[data-app-terminal] .xterm-screen").waitFor({ state: "hidden", timeout: 5_000 });
      await page.waitForFunction((node) => document.activeElement === node, await primary.elementHandle(), { timeout: 5_000 });
      await activateExisting(`Reopen terminal ${attempt + 1}`);
    }
    // bb suppresses terminal input while replaying scrollback. Wait for xterm
    // to render the fixture shell's prompt and position its input cursor.
    await page.waitForFunction(() => {
      const input = document.querySelector("[data-app-terminal] .xterm-helper-textarea");
      return input !== null && Number.parseFloat(getComputedStyle(input).left) > 0;
    }, null, { timeout: 5_000 });
    await page.keyboard.type("printf 'CTRL_BACKQUOTE_%s\\n' READY");
    await page.keyboard.press("Enter");
    fixture.run(["terminal", "wait", opened.result.terminalId,
      "--contains", "CTRL_BACKQUOTE_READY", "--from-start", "--timeout", "5s"]);
    assert.equal(await primary.innerText(), primaryText);
    assert.deepEqual(fixture.runJson(["terminal", "list", "--thread", thread.id]).sessions.map(({ id }) => id),
      [opened.result.terminalId]);
    assert.deepEqual(errors, []);
  } catch (error) {
    console.error("Terminal shortcut failure", JSON.stringify(await page.evaluate((threadId) => ({
      activeElement: {
        tag: document.activeElement?.tagName,
        label: document.activeElement?.getAttribute("aria-label"),
      },
      panelState: JSON.parse(localStorage.getItem(`bb.thread.fixedPanelTabsState-${threadId}-1`) ?? "null"),
      panelButtons: [...document.querySelectorAll('[data-panel-group] button[aria-label*="right panel"]')].map((node) => node.getAttribute("aria-label")),
      terminals: [...document.querySelectorAll("[data-app-terminal]")].map((node) => ({
        bounds: node.getBoundingClientRect().toJSON(),
        hasInput: node.querySelector(".xterm-helper-textarea") !== null,
      })),
    }), thread.id), null, 2));
    const directory = resolve(".scratch/e2e");
    await mkdir(directory, { recursive: true });
    await context.tracing.stop({ path: resolve(directory, "terminal-shortcut.trace.zip") });
    throw error;
  } finally {
    await browser.close();
  }
}
