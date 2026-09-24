import { chromium } from "playwright";
import { FEATURED_THREAD } from "../../screenshots/fixture.mjs";

export async function verifyThreadTitleClicks({ stack, fixture }) {
  const longTitle = "Investigate webhook retries when delivery repeatedly fails and the queue stops making progress";
  const longThread = fixture.threads.get("Investigate webhook retries");
  fixture.run(["thread", "update", longThread.id, "--title", longTitle]);
  const browser = await chromium.launch({ args: ["--mute-audio"] });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await context.addInitScript(() => {
      localStorage.setItem("bb.sidebar.threadListProvider", JSON.stringify("ribbon-sidebar/ribbon-sidebar"));
      localStorage.setItem("bb.plugin.ribbon-sidebar.preferences.v1", JSON.stringify({
        view: { scope: { kind: "all" }, groupingKey: null, filterGroupingKey: null },
        collapsed: [],
      }));
    });
    const page = await context.newPage();
    await page.goto(stack.serverUrl);
    const sidebar = page.locator("[data-ribbon-sidebar-root][data-ribbon-sidebar-ready]");
    await sidebar.waitFor({ timeout: 120_000 });
    for (const [thread, title] of [
      [fixture.threads.get(FEATURED_THREAD), FEATURED_THREAD],
      [longThread, longTitle],
    ]) {
      const row = sidebar.locator("li").filter({
        has: page.locator(`a[data-sidebar-thread-id="${thread.id}"]`),
      });
      const label = row.getByText(title, { exact: true });
      await label.waitFor();
      await label.scrollIntoViewIfNeeded();
      if (thread === longThread) {
        await page.waitForFunction((title) => {
          const label = [...document.querySelectorAll("[data-ribbon-sidebar-root] span")]
            .find((node) => node.childElementCount === 0 && node.textContent === title);
          return label && label.getBoundingClientRect().width >
            label.closest(".overflow-hidden").getBoundingClientRect().width;
        }, title);
      }
      const box = await label.boundingBox();
      // Click visible text even when an overlaid row link receives the pointer.
      await page.mouse.click(box.x + 8, box.y + box.height / 2);
      await page.waitForURL(`**/threads/${thread.id}`, { timeout: 15_000 });
    }
    await context.close();
  } finally {
    await browser.close();
    fixture.run(["thread", "update", longThread.id, "--title", longThread.title]);
  }
}
