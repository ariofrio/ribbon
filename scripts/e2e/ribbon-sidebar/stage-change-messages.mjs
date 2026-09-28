import assert from "node:assert/strict";
import { chromium } from "playwright";

const THREAD = "Retire the v1 pricing endpoint";

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
    // Only the notice's paragraph holds this text beside a mention pill.
    const notice = page
      .locator("p, div")
      .filter({ hasText: /^Thread stage updated:/ })
      .filter({ has: page.locator('[data-prompt-mention]') })
      .last();
    await notice.waitFor({ timeout: 60_000 });
    // bb looks up a plugin's branding icon after the pill first draws.
    await notice.evaluate(
      (node) =>
        new Promise((resolve) => {
          const done = () =>
            [...node.querySelectorAll("[data-prompt-mention]")].every((pill) =>
              getComputedStyle(pill.firstElementChild).maskImage.includes(
                "thread-stages",
              ),
            );
          if (done()) return resolve();
          const observer = new MutationObserver(() => {
            if (!done()) return;
            observer.disconnect();
            resolve();
          });
          observer.observe(node, {
            subtree: true,
            childList: true,
            attributes: true,
          });
        }),
    );
    const mentions = notice.locator('[data-prompt-mention]');
    await mentions.first().waitFor({ state: "visible" });
    await mentions.last().waitFor({ state: "visible" });
    const pills = await mentions.evaluateAll((nodes) =>
      nodes.map((node) => {
        const style = getComputedStyle(node);
        const icon = node.firstElementChild;
        return {
          label: node.textContent,
          display: style.display,
          radius: parseFloat(style.borderTopLeftRadius),
          width: node.getBoundingClientRect().width,
          icon:
            icon !== null &&
            icon.getBoundingClientRect().width > 0 &&
            getComputedStyle(icon).maskImage.includes("thread-stages"),
        };
      }),
    );
    assert.deepEqual(
      pills.map(({ label }) => label),
      ["Completed", "Idle"],
    );
    for (const pill of pills) {
      assert.notEqual(pill.display, "none");
      assert.ok(pill.width > 0, `${pill.label} must take up space`);
      assert.ok(pill.radius > 0, `${pill.label} must draw as a pill`);
      assert.ok(pill.icon, `${pill.label} must carry Thread stages' icon`);
    }

    const composer = page.locator(
      '[data-app-composer-role="primary"] [contenteditable="true"]',
    );
    await composer.click();
    await page.keyboard.type("then @bl");
    // Only Thread stages' provider supplies this subtitle to the menu.
    await page
      .getByText("Stage · cannot progress until something external changes", {
        exact: true,
      })
      .waitFor();
    await page.keyboard.press("Enter");
    const inserted = page
      .locator('[data-app-composer-role="primary"] [data-prompt-mention]')
      .filter({ hasText: "Blocked" });
    await inserted.waitFor();
    assert.equal(
      (await composer.innerText()).includes("@bl"),
      false,
      "Picking the stage must replace the typed query with its pill",
    );
    await composer.press(process.platform === "darwin" ? "Meta+a" : "Control+a");
    await page.keyboard.press("Backspace");

    const events = JSON.parse(
      fixture.run(["thread", "log", thread.id, "--all", "--json"]),
    );
    const serialized = JSON.stringify(events);
    assert.ok(
      serialized.includes(
        "this thread's stage changed from Completed to Idle",
      ),
      "The agent must receive the notice's agent-only context",
    );
    assert.ok(
      serialized.includes("@Idle is the Idle workflow stage"),
      "The agent must receive each stage mention's resolved context",
    );
    await context.close();
  } finally {
    setMessages(false);
    place("Completed");
    await browser.close();
  }
}
