import assert from "node:assert/strict";
import { chromium } from "playwright";

const THREAD = "Retire the v1 pricing endpoint";
const LABEL = "Stage: Completed → Idle";

export async function verifyStageChangeMessages({ stack, fixture }) {
  const thread = fixture.threads.get(THREAD);
  const place = (stage) =>
    fixture.run([
      "sidebar",
      "place",
      thread.id,
      "--to",
      `plugin:thread-stages:stages/${stage}`,
    ]);
  const setMessages = (enabled) =>
    fixture.run([
      "plugin",
      "config",
      "ribbon-sidebar",
      "set",
      "messageOnStageChange",
      String(enabled),
    ]);
  const browser = await chromium.launch({ args: ["--mute-audio"] });
  try {
    setMessages(true);
    place("Idle");

    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
    });
    context.setDefaultTimeout(30_000);
    const page = await context.newPage();
    await page.goto(new URL(`/threads/${thread.id}`, stack.serverUrl).href);
    // The pill carries the label only because Ribbon's message put it there;
    // no other surface on the page draws this text.
    const pill = page.locator('[title]').filter({ hasText: LABEL }).last();
    await pill.waitFor({ timeout: 60_000 });
    const drawn = await pill.evaluate((node) => {
      const style = getComputedStyle(node);
      const box = node.getBoundingClientRect();
      return {
        display: style.display,
        radius: parseFloat(style.borderTopLeftRadius),
        width: box.width,
        icon: node.querySelector("svg, [style*='mask']") !== null,
      };
    });
    assert.notEqual(drawn.display, "none");
    assert.ok(drawn.width > 0, "The stage pill must take up space");
    assert.ok(drawn.radius > 0, "The stage notice must draw as a pill");
    assert.ok(drawn.icon, "The stage pill must carry Ribbon's icon");

    const events = JSON.parse(
      fixture.run(["thread", "log", thread.id, "--all", "--json"]),
    );
    const serialized = JSON.stringify(events);
    assert.ok(
      serialized.includes(
        "This thread's workflow stage changed from Completed to Idle",
      ),
      "The agent must receive the pill's resolved stage context",
    );
    await context.close();
  } finally {
    setMessages(false);
    place("Completed");
    await browser.close();
  }
}
