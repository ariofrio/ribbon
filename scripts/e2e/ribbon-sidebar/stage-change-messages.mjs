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
    // Only the notice's paragraph holds both labels; nothing else bb draws
    // puts a Ribbon pill beside this text.
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
                "ribbon-sidebar",
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
    const pills = await notice
      .locator('[data-prompt-mention]')
      .evaluateAll((nodes) =>
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
              getComputedStyle(icon).maskImage.includes("ribbon-sidebar"),
          };
        }),
      );
    assert.deepEqual(
      pills.map(({ label }) => label),
      ["stage:completed", "stage:idle"],
    );
    for (const pill of pills) {
      assert.notEqual(pill.display, "none");
      assert.ok(pill.width > 0, `${pill.label} must take up space`);
      assert.ok(pill.radius > 0, `${pill.label} must draw as a pill`);
      assert.ok(pill.icon, `${pill.label} must carry Ribbon's icon`);
    }

    const composer = page.locator(
      '[data-app-composer-role="primary"] [contenteditable="true"]',
    );
    await composer.click();
    await page.keyboard.type("then @stage:bl");
    // Only Ribbon's stage provider supplies this subtitle to the menu.
    await page
      .getByText("Blocked: cannot progress until something external changes", {
        exact: true,
      })
      .waitFor();
    await page.keyboard.press("Enter");
    const inserted = page
      .locator('[data-app-composer-role="primary"] [data-prompt-mention]')
      .filter({ hasText: "stage:blocked" });
    await inserted.waitFor();
    assert.equal(
      (await composer.innerText()).includes("@stage:bl"),
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
      serialized.includes("is Ribbon's Idle workflow stage"),
      "The agent must receive each stage mention's resolved context",
    );
    await context.close();
  } finally {
    setMessages(false);
    place("Completed");
    await browser.close();
  }
}
