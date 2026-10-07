import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import { AGENT, FEATURED_PROJECT } from "../screenshots/fixture.mjs";

export function prepareLogoProvider({ bb, cliEnv }) {
  const fixtureDir = join(cliEnv.BB_DATA_DIR, "fixture-provider");
  const logoDir = join(cliEnv.BB_DATA_DIR, "mention-logo-provider");
  mkdirSync(logoDir);
  const manifest = JSON.parse(
    readFileSync(join(fixtureDir, "package.json"), "utf8"),
  );
  manifest.name = "bb-plugin-mention-logo-provider";
  manifest.bb.branding.icon = "./logo.svg";
  writeFileSync(join(logoDir, "package.json"), JSON.stringify(manifest));
  copyFileSync(join(fixtureDir, "host.ts"), join(logoDir, "host.ts"));
  writeFileSync(
    join(logoDir, "logo.svg"),
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="M12 2 22 12 12 22 2 12Z"/></svg>',
  );
  const server = readFileSync(join(fixtureDir, "server.ts"), "utf8")
    .replace('"id":"acp-screenshots"', '"id":"acp-mention-logo"')
    .replace('"displayName":"bb"', '"displayName":"Mention logo provider"')
    .replace('"icon":"Toolbox"', '"icon":"./logo.svg"');
  writeFileSync(join(logoDir, "server.ts"), server);
  execFileSync(bb, ["plugin", "install", logoDir, "--yes"], {
    env: cliEnv,
    stdio: "inherit",
  });
}

async function expectProviderIcon(pill) {
  await pill.waitFor();
  const rendered = await pill.evaluate((node) => {
    const svg = node.querySelector("svg");
    if (!svg) return null;
    const style = getComputedStyle(svg);
    const box = svg.getBBox();
    return {
      width: svg.getBoundingClientRect().width,
      drawingWidth: box.width,
      display: style.display,
      color: style.color,
    };
  });
  assert.ok(
    rendered?.width > 0 && rendered.drawingWidth > 0,
    "The provider glyph must render, rather than the plugin's mask icon",
  );
  assert.notEqual(rendered.display, "none");
  assert.notEqual(rendered.color, "rgba(0, 0, 0, 0)");
}

export async function verifyModelMentions({ stack, fixture }) {
  const project = fixture.projects.get(FEATURED_PROJECT);
  const thread = fixture.runJson([
    "thread",
    "spawn",
    "--project",
    project.id,
    "--machine",
    "screenshots",
    "--environment",
    project.root,
    "--provider",
    `acp-${AGENT.id}`,
    "--model",
    AGENT.modelId,
    "--permission-mode",
    "accept-edits",
    "--title",
    "Model mention verification",
    "--prompt",
    "Prepare to check model mentions",
  ]);
  fixture.run(["thread", "wait", thread.id, "--status", "idle"]);
  const browser = await chromium.launch({ args: ["--mute-audio"] });
  try {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
    });
    page.on("pageerror", (error) =>
      console.error("Model mention page error:", error),
    );
    page.on("console", (message) => {
      if (message.type() === "error" && /plugin SDK|model-mentions/u.test(message.text()))
        console.error("Model mention browser error:", message.text());
    });
    page.setDefaultTimeout(60_000);
    await page.goto(new URL(`/threads/${thread.id}`, stack.serverUrl).href);
    const composer = page.locator('[data-app-composer-role="primary"]');
    const editor = composer.locator('[contenteditable="true"]');
    const picker = composer.getByRole("button", {
      name: /Provider, model and reasoning/,
    });
    await picker.filter({ hasText: AGENT.modelName }).waitFor();
    const initialSelection = await picker.innerText();
    await editor.click();
    await page.keyboard.type(`For a subthread use @${AGENT.modelName}`);
    await page
      .getByText(`Model · ${AGENT.displayName}`, { exact: true })
      .waitFor();
    await page
      .getByText(`Model · ${AGENT.displayName}`, { exact: true })
      .click();
    await expectProviderIcon(
      composer
        .locator("[data-prompt-mention]")
        .filter({ hasText: AGENT.modelName }),
    );
    assert.equal(
      await picker.innerText(),
      initialSelection,
      "A model mention must leave the composer pickers unchanged",
    );
    await composer
      .getByRole("button", { name: "Submit (Enter)", exact: true })
      .click();
    fixture.run(["thread", "wait", thread.id, "--status", "idle"]);
    const events = fixture.runJson(["thread", "log", thread.id, "--all"]);
    const serialized = JSON.stringify(events);
    assert.ok(
      serialized.includes('\\"providerId\\":\\"acp-screenshots\\"'),
      "The agent receives the exact provider ID",
    );
    assert.ok(
      serialized.includes('\\"model\\":\\"fixture\\"'),
      "The agent receives the exact model ID",
    );
    assert.ok(
      serialized.includes("task described"),
      "The mention explains which task receives the model choice",
    );

    fixture.run([
      "thread",
      "tell",
      thread.id,
      "Queued mention test",
      "--send-at",
      "1h",
    ]);
    await page
      .getByRole("button", { name: "Edit queued message 1", exact: true })
      .press("Enter");
    const queuedEditor = page
      .locator('[contenteditable="true"]')
      .filter({ hasText: "Queued mention test" });
    await queuedEditor.click();
    await queuedEditor.press("End");
    await page.keyboard.type(` with @${AGENT.modelName}`);
    await page
      .getByText(`Model · ${AGENT.displayName}`, { exact: true })
      .waitFor();
    await page
      .getByText(`Model · ${AGENT.displayName}`, { exact: true })
      .click();
    const queuedComposer = queuedEditor.locator(
      "xpath=ancestor::*[@data-app-composer-role][1]",
    );
    await expectProviderIcon(
      queuedComposer
        .locator("[data-prompt-mention]")
        .filter({ hasText: AGENT.modelName }),
    );
    await queuedComposer
      .getByRole("button", { name: "Submit (Enter)", exact: true })
      .click();
    await queuedEditor.waitFor({ state: "hidden" });
    await page.reload();
    await page
      .getByRole("button", { name: "Edit queued message 1", exact: true })
      .press("Enter");
    const restored = page
      .locator('[contenteditable="true"]')
      .filter({ hasText: "Queued mention test" });
    await expectProviderIcon(
      restored
        .locator("[data-prompt-mention]")
        .filter({ hasText: AGENT.modelName }),
    );
    await page.goto(new URL(`/projects/${project.id}`, stack.serverUrl).href);
    const newComposer = page.locator('[data-app-composer-role="primary"]');
    const newPicker = newComposer.getByRole("button", {
      name: /Provider, model and reasoning/,
    });
    await newPicker.filter({ hasNotText: /Loading models/i }).waitFor();
    const newSelection = await newPicker.innerText();
    await newComposer.locator('[contenteditable="true"]').click();
    await page.keyboard.type(`Start a task with @${AGENT.modelName}`);
    await page
      .getByText("Model · Mention logo provider", { exact: true })
      .waitFor();
    await page
      .getByText("Model · Mention logo provider", { exact: true })
      .click();
    console.log(
      "Model mentions: sent context and queue persistence passed; checking SVG logo",
    );
    await page.waitForFunction(() => {
      const pill = document.querySelector(
        '[data-app-composer-role="primary"] [data-prompt-mention]',
      );
      return (
        pill &&
        [...pill.querySelectorAll("*")].some((node) => {
          const style = getComputedStyle(node);
          return (
            style.maskImage.includes(
              "/system/providers/acp-mention-logo/logo",
            ) &&
            node.getBoundingClientRect().width > 0 &&
            node.getBoundingClientRect().height > 0 &&
            style.backgroundColor !== "rgba(0, 0, 0, 0)"
          );
        })
      );
    });
    assert.equal(
      await newPicker.innerText(),
      newSelection,
      "New-thread mentions also leave the pickers unchanged",
    );
  } finally {
    await browser.close();
  }
}
