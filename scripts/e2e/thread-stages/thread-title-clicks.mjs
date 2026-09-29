import { FEATURED_THREAD } from "../../screenshots/fixture.mjs";
import { launch, link, openContext, row, sidebar } from "./sidebar.mjs";

export async function verifyThreadTitleClicks({ stack, fixture }) {
  const longTitle = "Investigate webhook retries when delivery repeatedly fails and the queue stops making progress";
  const longThread = fixture.threads.get("Investigate webhook retries");
  fixture.run(["thread", "update", longThread.id, "--title", longTitle]);
  const browser = await launch();
  try {
    const context = await openContext(browser, { viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    await page.goto(stack.serverUrl);
    const list = sidebar(page);
    await list.waitFor({ timeout: 120_000 });
    for (const [thread, title] of [
      [fixture.threads.get(FEATURED_THREAD), FEATURED_THREAD],
      [longThread, longTitle],
    ]) {
      const label = row(list, thread.id).getByText(title, { exact: true });
      await label.waitFor();
      await label.scrollIntoViewIfNeeded();
      if (thread === longThread) {
        // Its turn never ends, so its row shimmers. The shimmer's masks sit
        // over the row's link and must still let clicks through to it.
        await list.locator(`[data-thread-id="${thread.id}"][data-ribbon-shine-row]`).waitFor();
      }
      const box = await label.boundingBox();
      // Click visible text even when an overlaid row link receives the pointer.
      await page.mouse.click(box.x + 8, box.y + box.height / 2);
      await page.waitForURL(`**/threads/${thread.id}`, { timeout: 15_000 });
    }
    // Leave the working thread, then return through its stage icon.
    const featured = await link(list, fixture.threads.get(FEATURED_THREAD).id).boundingBox();
    await page.mouse.click(featured.x + featured.width / 2, featured.y + featured.height / 2);
    await page.waitForURL(`**/threads/${fixture.threads.get(FEATURED_THREAD).id}`, { timeout: 15_000 });
    const icon = await row(list, longThread.id).locator('[aria-label$=" stage, working"]').boundingBox();
    await page.mouse.click(icon.x + icon.width / 2, icon.y + icon.height / 2);
    await page.waitForURL(`**/threads/${longThread.id}`, { timeout: 15_000 });
    await context.close();
  } finally {
    await browser.close();
    fixture.run(["thread", "update", longThread.id, "--title", longThread.title]);
  }
}
