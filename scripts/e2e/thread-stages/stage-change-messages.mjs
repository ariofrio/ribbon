import assert from "node:assert/strict";
import { launch } from "./sidebar.mjs";

const THREAD = "Retire the v1 pricing endpoint";

export async function verifyStageChangeMessages({ stack, fixture }) {
  const thread = fixture.threads.get(THREAD);
  const place = (stage) => fixture.run(["thread-stages", "stage", stage, thread.id]);
  const setMessages = (enabled) =>
    fixture.run(["plugin", "config", "thread-stages", "set", "messageOnStageChange", String(enabled)]);
  const browser = await launch();
  try {
    setMessages(true);
    place("Active");

    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    context.setDefaultTimeout(30_000);
    const page = await context.newPage();
    await page.goto(new URL(`/threads/${thread.id}`, stack.serverUrl).href);
    // Query and measure together: the live timeline can replace a notice
    // between evaluateAll's element query and its callback.
    const rendered = await page.waitForFunction(() => {
      // Only the notice's paragraph holds this text beside a mention pill.
      const notice = [...document.querySelectorAll("p")]
        .filter((node) => /^Thread stage updated:/.test(node.textContent)
          && node.querySelector("[data-prompt-mention]"))
        .at(-1);
      if (!notice) return false;
      const pills = [...notice.querySelectorAll("[data-prompt-mention]")].map((node) => {
        const style = getComputedStyle(node);
        const icon = node.firstElementChild;
        return {
          label: node.textContent,
          display: style.display,
          radius: parseFloat(style.borderTopLeftRadius),
          width: node.getBoundingClientRect().width,
          icon: icon !== null && icon.getBoundingClientRect().width > 0 && getComputedStyle(icon).maskImage.includes("thread-stages"),
        };
      });
      // bb resolves the branding icon after the pill first draws.
      return pills.length === 2 && pills.every((pill) =>
        pill.width > 0 && pill.radius > 0 && pill.display !== "none" && pill.icon)
        ? pills : false;
    }, undefined, { timeout: 60_000 });
    const pills = await rendered.jsonValue();
    await rendered.dispose();
    assert.deepEqual(pills.map(({ label }) => label), ["Completed", "Active"]);
    for (const pill of pills) {
      assert.notEqual(pill.display, "none");
      assert.ok(pill.width > 0, `${pill.label} must take up space`);
      assert.ok(pill.radius > 0, `${pill.label} must draw as a pill`);
      assert.ok(pill.icon, `${pill.label} must carry Thread stages' icon`);
    }

    const composer = page.locator('[data-app-composer-role="primary"] [contenteditable="true"]');
    await composer.click();
    await page.keyboard.type("then @bl");
    // Only Thread stages' provider supplies this subtitle to the menu.
    await page.getByText("Stage · another bb thread owns a required action or result, and no useful independent work remains here", { exact: true }).waitFor();
    await page.keyboard.press("Enter");
    const inserted = page.locator('[data-app-composer-role="primary"] [data-prompt-mention]').filter({ hasText: "Blocked on another thread" });
    await inserted.waitFor();
    assert.equal((await composer.innerText()).includes("@bl"), false, "Picking the stage must replace the typed query with its pill");
    await composer.press(process.platform === "darwin" ? "Meta+a" : "Control+a");
    await page.keyboard.press("Backspace");

    const events = JSON.parse(fixture.run(["thread", "log", thread.id, "--all", "--json"]));
    const serialized = JSON.stringify(events);
    assert.ok(serialized.includes("this thread's stage changed from Completed to Active"), "The agent must receive the notice's agent-only context");
    assert.ok(serialized.includes("@Active is the Active workflow stage"), "The agent must receive each stage mention's resolved context");
    await context.close();
  } finally {
    setMessages(false);
    place("Completed");
    await browser.close();
  }
}
