import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { AGENT, FEATURED_PROJECT, FEATURED_THREAD } from "../screenshots/fixture.mjs";

const MODIFIER = process.platform === "darwin" ? "Meta" : "Control";
const READY = "[data-missing-keyboard-shortcuts-ready]";
const PRIMARY = '[data-app-composer-role="primary"] [role="textbox"]';
const SIDE_CHAT = '[data-testid="plugin-panel-tab-content"] > [data-bb-plugin="missing-keyboard-shortcuts"]';
const COMMAND_EVENT = "bb-plugin-missing-keyboard-shortcuts:run-command";

async function pressCommand(page, keys, id) {
  const count = await page.evaluate(() => window.shortcutCommands.length);
  await page.keyboard.press(keys);
  await page.waitForFunction(({ count, id }) =>
    window.shortcutCommands.length === count + 1 && window.shortcutCommands[count] === id,
  { count, id }, { timeout: 5_000 });
}

async function settings(page, stack) {
  await page.goto(new URL("/settings/keyboard", stack.serverUrl).href);
  await page.getByRole("button", { name: /^Record shortcut for Navigate backward,/ }).waitFor();
}

async function assign(page, title, keys) {
  const recorder = page.getByRole("button", { name: new RegExp(`^Record shortcut for ${title},`) });
  await recorder.click();
  await page.keyboard.press(keys);
  const replace = page.getByRole("button", { name: "Replace binding", exact: true });
  await page.waitForFunction(({ title }) =>
    [...document.querySelectorAll("button")].some((node) =>
      node.textContent === "Replace binding" ||
      (node.getAttribute("aria-label")?.startsWith(`Reset shortcut for ${title}`) && !node.disabled)),
  { title });
  if (await replace.isVisible()) await replace.click();
  await page.waitForFunction((node) => !node.matches(":disabled"), await recorder.elementHandle());
}

async function navigation(page, fixture, thread) {
  const other = fixture.threads.get("Investigate webhook retries");
  const primary = page.locator(PRIMARY);
  await primary.click();
  await page.keyboard.type("History retains this draft");
  await page.locator(`a[data-sidebar-thread-id="${other.id}"]`).first().click();
  await page.waitForURL((url) => url.pathname.endsWith(`/threads/${other.id}`));
  await primary.click();
  await pressCommand(page, `${MODIFIER}+BracketLeft`, "navigate-back");
  await page.waitForURL((url) => url.pathname.endsWith(`/threads/${thread.id}`));
  assert.equal(await primary.innerText(), "History retains this draft");
  await primary.click();
  await pressCommand(page, `${MODIFIER}+BracketRight`, "navigate-forward");
  await page.waitForURL((url) => url.pathname.endsWith(`/threads/${other.id}`));
  await primary.waitFor();
}

async function threadCreation(page, stack, project, thread) {
  await settings(page, stack);
  const personal = "Start a personal thread";
  const currentProject = "Start a thread in the current project";
  const personalBinding = page.getByRole("button", { name: new RegExp(`^Record shortcut for ${personal},`) });
  console.log("Default personal-thread binding:", await personalBinding.getAttribute("aria-label"));
  if ((await personalBinding.getAttribute("aria-label")).endsWith("unassigned")) {
    await page.getByText("Default shortcut left unbound: also used by New thread.", { exact: true }).waitFor();
  }
  await assign(page, personal, `${MODIFIER}+KeyN`);
  await assign(page, currentProject, `${MODIFIER}+Shift+KeyN`);
  // No selected thread in this browser yet: project creation falls back to personal.
  await pressCommand(page, `${MODIFIER}+Shift+KeyN`, "new-project-thread");
  const primary = page.locator(PRIMARY);
  await focused(page, primary);
  await page.getByRole("button", { name: "Project: No project", exact: true }).waitFor();
  await page.goto(new URL(`/projects/${project.id}/threads/${thread.id}`, stack.serverUrl).href);
  await primary.click();
  await pressCommand(page, `${MODIFIER}+Shift+KeyN`, "new-project-thread");
  await focused(page, primary);
  await page.getByRole("button", { name: `Project: ${project.name}`, exact: true }).waitFor();
  await pressCommand(page, `${MODIFIER}+KeyN`, "new-personal-thread");
  await focused(page, primary);
  await page.getByRole("button", { name: "Project: No project", exact: true }).waitFor();
  await settings(page, stack);
  await pressCommand(page, `${MODIFIER}+Shift+KeyN`, "new-project-thread");
  await focused(page, primary);
  await page.getByRole("button", { name: `Project: ${project.name}`, exact: true }).waitFor();
}

async function composerFocus(page, stack, project, thread) {
  await settings(page, stack);
  const title = "Focus the primary composer";
  const recorder = page.getByRole("button", { name: new RegExp(`^Record shortcut for ${title},`) });
  console.log("Default primary-composer binding:", await recorder.getAttribute("aria-label"));
  await assign(page, title, `${MODIFIER}+KeyL`);
  await page.goto(new URL(`/projects/${project.id}/threads/${thread.id}`, stack.serverUrl).href);
  const primary = page.locator(PRIMARY);
  await primary.click();
  await pressCommand(page, `${MODIFIER}+Shift+KeyL`, "toggle-side-chat");
  const reply = page.locator(SIDE_CHAT).getByRole("textbox", { name: "Reply…" });
  await focused(page, reply);
  await page.keyboard.type("Keep the secondary draft");
  await pressCommand(page, `${MODIFIER}+KeyL`, "focus-primary-composer");
  await focused(page, primary);
  await page.keyboard.type("Primary receives this text");
  assert.equal(await primary.innerText(), "Primary receives this text");
  assert.equal(await reply.innerText(), "Keep the secondary draft");
  // Rebinding and clearing must change the actual keyboard handler, not just settings.
  const settingsPage = await page.context().newPage();
  await settings(settingsPage, stack);
  await assign(settingsPage, title, `${MODIFIER}+Alt+KeyL`);
  await reply.click();
  await pressCommand(page, `${MODIFIER}+Alt+KeyL`, "focus-primary-composer");
  await focused(page, primary);
  await settingsPage.getByRole("button", { name: `Clear shortcut for ${title}`, exact: true }).click();
  await settingsPage.getByRole("button", { name: `Record shortcut for ${title}, current shortcut unassigned`, exact: true }).waitFor();
  await reply.click();
  await page.keyboard.press(`${MODIFIER}+Alt+KeyL`);
  await page.keyboard.type(" remains secondary");
  assert.equal(await reply.innerText(), "Keep the secondary draft remains secondary");
  await focused(page, reply);
}

async function focused(page, locator) {
  await page.waitForFunction((node) => {
    const bounds = node.getBoundingClientRect();
    return document.activeElement === node && bounds.width > 0 && bounds.height > 0;
  }, await locator.elementHandle(), { timeout: 5_000 });
}

async function sideChat(page, fixture, thread) {
  const primary = page.locator(PRIMARY);
  await primary.click();
  const response = page.waitForResponse((response) =>
    response.url().endsWith("/plugins/missing-keyboard-shortcuts/rpc/createSideChat"));
  await page.keyboard.press(`${MODIFIER}+Shift+KeyL`);
  const created = await (await response).json();
  assert.equal(created.ok, true);
  const childId = created.result.threadId;
  const reply = page.locator(SIDE_CHAT).getByRole("textbox", { name: "Reply…" });
  await reply.waitFor({ timeout: 120_000 });
  await focused(page, reply);
  await page.keyboard.type("Retain this side-chat draft");
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.keyboard.press(`${MODIFIER}+Shift+KeyL`);
    await reply.waitFor({ state: "hidden", timeout: 5_000 });
    await focused(page, primary);
    const response = page.waitForResponse((response) =>
      response.url().endsWith("/plugins/missing-keyboard-shortcuts/rpc/validateSideChat"));
    const start = performance.now();
    await page.keyboard.press(`${MODIFIER}+Shift+KeyL`);
    assert.deepEqual(await (await response).json(), { ok: true, result: { reusable: true } });
    await reply.waitFor();
    await focused(page, reply);
    const elapsed = performance.now() - start;
    assert.ok(elapsed < 1_000, `Side-chat reopen took ${Math.round(elapsed)} ms`);
    assert.equal(await reply.innerText(), "Retain this side-chat draft");
    console.log(`Side-chat reopen ${attempt + 1}: ${Math.round(elapsed)} ms`);
  }
  const tabs = fixture.runJson(["thread", "tabs", "show", thread.id]).tabs;
  const sideChats = tabs.filter((tab) => tab.kind === "plugin-panel" &&
    tab.pluginId === "missing-keyboard-shortcuts" && tab.actionId === "side-chat");
  assert.equal(sideChats.length, 1);
  assert.equal(JSON.parse(sideChats[0].paramsJson).threadId, childId);
}

export async function verifyMissingShortcuts({ stack, fixture, cases }) {
  const browser = await chromium.launch({ args: ["--mute-audio"] });
  const project = fixture.projects.get(FEATURED_PROJECT);
  try {
    for (const testCase of cases) {
      let thread = fixture.threads.get(testCase === "composer-focus" ?
        "Replace the legacy filter drawer" : FEATURED_THREAD);
      if (testCase === "side-chat") {
        thread = fixture.runJson([
          "thread", "spawn", "--project", project.id,
          "--machine", "screenshots", "--environment", project.root,
          "--provider", `acp-${AGENT.id}`, "--model", AGENT.modelId,
          "--permission-mode", "accept-edits", "--title", "Side-chat shortcut lifecycle",
          "--prompt", "Check repeated side chat shortcuts",
        ]);
        fixture.run(["thread", "wait", thread.id, "--status", "idle"]);
      }
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      context.setDefaultTimeout(30_000);
      await context.tracing.start({ snapshots: true, sources: true });
      const page = await context.newPage();
      page.on("dialog", (dialog) => void dialog.accept());
      await context.addInitScript((eventName) => {
        window.shortcutCommands = [];
        window.addEventListener(eventName, (event) => window.shortcutCommands.push(event.detail.id));
      }, COMMAND_EVENT);
      const errors = [];
      let failed = false;
      page.on("pageerror", (error) => errors.push(error.message));
      try {
        await page.goto(new URL(testCase === "thread-creation" ? "/settings/keyboard" :
          `/projects/${project.id}/threads/${thread.id}`, stack.serverUrl).href);
        await page.locator(READY).waitFor({ state: "attached" });
        if (testCase === "side-chat") await sideChat(page, fixture, thread);
        if (testCase === "navigation") await navigation(page, fixture, thread);
        if (testCase === "thread-creation") await threadCreation(page, stack, project, thread);
        if (testCase === "composer-focus") await composerFocus(page, stack, project, thread);
        assert.deepEqual(errors, []);
      } catch (error) {
        failed = true;
        console.error(`Missing shortcuts ${testCase} failure`, error);
        await mkdir(resolve(".scratch/e2e"), { recursive: true });
        await context.tracing.stop({ path: resolve(`.scratch/e2e/missing-shortcuts-${testCase}.trace.zip`) });
        throw error;
      } finally {
        if (!failed && ["thread-creation", "composer-focus"].includes(testCase)) {
          const settingsPage = await context.newPage();
          await settings(settingsPage, stack);
          const reset = settingsPage.getByRole("button", { name: "Reset all", exact: true });
          if (await reset.isEnabled()) {
            await reset.click();
            await settingsPage.waitForFunction((node) => node.disabled, await reset.elementHandle());
          }
        }
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
}
