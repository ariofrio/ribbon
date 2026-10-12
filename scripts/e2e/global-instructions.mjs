import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, expect } from "playwright/test";

export function prepareInstructionsProvider({ bb, cliEnv }) {
  const source = join(cliEnv.BB_DATA_DIR, "fixture-provider");
  const destination = join(cliEnv.BB_DATA_DIR, "instructions-provider");
  mkdirSync(destination, { recursive: true });
  const manifest = JSON.parse(readFileSync(join(source, "package.json"), "utf8"));
  manifest.name = "bb-plugin-instructions-test-provider";
  writeFileSync(join(destination, "package.json"), JSON.stringify(manifest));
  copyFileSync(join(source, "host.ts"), join(destination, "host.ts"));
  const server = readFileSync(join(source, "server.ts"), "utf8");
  const declaration = JSON.parse(server.match(/bb\.providers\.register\((.*)\);/u)[1]);
  declaration.id = "acp-instructions-test";
  declaration.displayName = "Instructions test";
  declaration.experimental_bridgeOptions.acpLaunchSpec.args = [join(import.meta.dirname, "global-instructions-agent.mjs")];
  declaration.experimental_bridgeOptions.acpLaunchSpec.env.BB_INSTRUCTIONS_PROMPTS = join(cliEnv.BB_DATA_DIR, "instruction-prompts.jsonl");
  writeFileSync(join(destination, "server.ts"),
    `import type { BbPluginApi } from "@get-bb/plugin-sdk";\nexport default function(bb: BbPluginApi) { bb.providers.register(${JSON.stringify(declaration)}); }\n`);
  execFileSync(bb, ["plugin", "install", destination, "--yes"], { env: cliEnv, stdio: "inherit" });
}

export async function verifyGlobalInstructions({ stack, fixture }) {
  const file = join(stack.dataDir, "AGENTS.md");
  const previous = existsSync(file) ? readFileSync(file) : null;
  const original = "# Global rules\r\n\r\nKeep **important** details.\r\n\r\n- First\r\n- Second\r\n\r\n| Rule | Reason |\r\n| --- | --- |\r\n| Verify | Accuracy |\r\n";
  writeFileSync(file, original);
  const browser = await chromium.launch({ headless: true, args: ["--mute-audio"] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 960 } });
  await context.tracing.start({ screenshots: true, snapshots: true });
  let disabled = false;
  try {
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.setDefaultTimeout(60_000);
    await page.goto(new URL("/settings/plugins/global-instructions", stack.serverUrl).href);
    const panel = page.getByRole("region", { name: "Global instructions editor" });
    const source = panel.getByRole("textbox", { name: "Global instructions" });
    await expect(source).toHaveValue(original.replaceAll("\r\n", "\n"));
    await expect(panel.getByText(file, { exact: true })).toBeVisible();
    await expect(panel.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
    console.log("Global instructions: source loaded; switching to rich mode.");
    await panel.getByRole("tab", { name: "Rich Markdown" }).click();
    const rich = panel.getByRole("textbox", { name: "Global instructions" });
    await expect(rich.getByRole("heading", { name: "Global rules" })).toBeVisible();
    await expect(rich.getByRole("cell", { name: "Accuracy" })).toBeVisible();
    const appearance = await rich.evaluate((node) => {
      const heading = getComputedStyle(node.querySelector("h1"));
      const paragraph = getComputedStyle(node.querySelector("p"));
      const list = getComputedStyle(node.querySelector("ul"));
      return { headingSize: parseFloat(heading.fontSize), paragraphSize: parseFloat(paragraph.fontSize), list: list.listStyleType, height: node.getBoundingClientRect().height };
    });
    assert.ok(appearance.headingSize > appearance.paragraphSize, "Rich headings must render larger than prose");
    assert.equal(appearance.list, "disc");
    assert.ok(appearance.height >= 300, "The editor must render its minimum height inside bb's CSS scope");
    console.log("Global instructions: rich mode renders; switching back to source.");
    await panel.getByRole("tab", { name: "Plain text" }).click();
    await expect(panel.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
    assert.equal(readFileSync(file, "utf8"), original, "Mode switches preserve exact source");

    // A large document exceeds both Custom instructions and plugin KV limits.
    const large = "# Global rules\n\n" + ("Keep every detail. ".repeat(25) + "\n").repeat(1000) + "\n日本語 🎉\nGLOBAL_INSTRUCTIONS_END_MARKER";
    console.log("Global instructions: filling large source.");
    await source.fill(large);
    console.log("Global instructions: saving large source.");
    await panel.getByRole("button", { name: "Save", exact: true }).click();
    await expect(panel.getByRole("status")).toHaveText("Saved. New agent sessions will use these instructions.");
    assert.equal(readFileSync(file, "utf8"), large);
    await page.reload();
    await expect(source).toHaveValue(large);

    async function verifyDelivery(prompt, expected) {
      const thread = fixture.runJson(["thread", "spawn", "--project", "proj_personal", "--provider", "acp-instructions-test", "--model", "fixture", "--permission-mode", "accept-edits", "--prompt", prompt]);
      fixture.run(["thread", "wait", thread.id, "--status", "idle"]);
      const records = readFileSync(join(stack.dataDir, "instruction-prompts.jsonl"), "utf8").trim().split("\n").map((line) => JSON.parse(line));
      const record = records.findLast((record) => record.threadId === thread.id);
      assert.ok(record, "The provider must receive the turn");
      const text = record.prompt.filter((block) => block.type === "text").map((block) => block.text).join("\n");
      assert.ok(text.includes(expected), "The provider receives the whole server AGENTS.md, without truncation");
      assert.equal(text.split("GLOBAL_INSTRUCTIONS_END_MARKER").length - 1, 1, "Global instructions are delivered once");
      return thread.id;
    }
    const threadId = await verifyDelivery("Check global instructions", large);
    const next = large.replace("Keep every detail.", "The next session sees this edit.");
    await source.fill(next);
    await panel.getByRole("button", { name: "Save", exact: true }).click();
    await expect(panel.getByRole("status")).toHaveText("Saved. New agent sessions will use these instructions.");
    fixture.run(["thread", "tell", threadId, "Check updated instructions"]);
    fixture.run(["thread", "wait", threadId, "--status", "idle"]);
    const delivered = readFileSync(join(stack.dataDir, "instruction-prompts.jsonl"), "utf8").trim().split("\n").map((line) => JSON.parse(line)).findLast((record) => record.threadId === threadId);
    assert.ok(delivered.prompt.every((block) => block.type !== "text" || !block.text.includes("GLOBAL_INSTRUCTIONS_END_MARKER")), "ACP injects instructions only on the session's first turn");
    await verifyDelivery("Check updated instructions in a new session", next);
    fixture.run(["plugin", "disable", "global-instructions"]);
    disabled = true;
    await verifyDelivery("Check instructions without the plugin", next);
    fixture.run(["plugin", "enable", "global-instructions"]);
    disabled = false;
    await page.reload();
    await expect(source).toHaveValue(next);

    await source.fill("Keep details.");
    await panel.getByRole("button", { name: "Save", exact: true }).click();
    await expect(panel.getByRole("status")).toHaveText("Saved. New agent sessions will use these instructions.");
    await panel.getByRole("tab", { name: "Rich Markdown" }).click();
    await rich.click();
    await rich.press("ControlOrMeta+End");
    await page.keyboard.type(" Always verify.");
    await rich.press("ControlOrMeta+a");
    await panel.getByRole("button", { name: "Bold", exact: true }).click();
    await expect(rich.locator("strong")).toHaveText("Keep details. Always verify.");
    assert.ok(await rich.locator("strong").evaluate(node => parseInt(getComputedStyle(node).fontWeight) >= 600), "Bold renders from a real toolbar click");
    await panel.getByRole("button", { name: "Save", exact: true }).click();
    await expect(panel.getByRole("status")).toHaveText("Saved. New agent sessions will use these instructions.");
    assert.equal(readFileSync(file, "utf8"), "**Keep details. Always verify.**");
    await rich.click();
    await rich.press("ControlOrMeta+End");
    await page.keyboard.type(" Discard me.");
    await panel.getByRole("button", { name: "Discard changes" }).click();
    await expect(rich).toHaveText("Keep details. Always verify.");
    await expect(panel.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
    await panel.getByRole("tab", { name: "Plain text" }).click();
    await expect(source).toHaveValue("**Keep details. Always verify.**");

    await source.fill("Local draft");
    writeFileSync(file, "External rules");
    await panel.getByRole("button", { name: "Save", exact: true }).click();
    await expect(panel.getByRole("alert")).toContainText("changed elsewhere");
    await expect(source).toHaveValue("Local draft");
    assert.equal(readFileSync(file, "utf8"), "External rules");
    await panel.getByRole("button", { name: "Reload latest" }).click();
    await expect(source).toHaveValue("External rules");
    await page.setViewportSize({ width: 390, height: 844 });
    await source.click();
    await source.press("ControlOrMeta+End");
    await page.keyboard.type("\nMobile edit");
    await panel.getByRole("button", { name: "Save", exact: true }).click();
    await expect(panel.getByRole("status")).toHaveText("Saved. New agent sessions will use these instructions.");
    assert.equal(readFileSync(file, "utf8"), "External rules\nMobile edit");
    assert.ok(await panel.evaluate(node => node.scrollWidth <= node.clientWidth), "The editor fits a narrow viewport");
    assert.deepEqual(errors, []);
    console.log("Global instructions: rendered modes, large saves, stale drafts, mobile input, and real instruction delivery passed.");
  } catch (error) {
    await context.tracing.stop({ path: join(stack.dataDir, "global-instructions.trace.zip") });
    throw error;
  } finally {
    await browser.close();
    if (disabled) fixture.run(["plugin", "enable", "global-instructions"]);
    if (previous === null) rmSync(file, { force: true });
    else writeFileSync(file, previous);
  }
}
