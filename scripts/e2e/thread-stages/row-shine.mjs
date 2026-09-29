import assert from "node:assert/strict";
import { FEATURED_PROJECT, FEATURED_THREAD } from "../../screenshots/fixture.mjs";
import { launch, openContext, sidebar } from "./sidebar.mjs";

// A shimmer the main thread has to recompute every frame keeps it busy for as
// long as any thread works, and every click and keystroke waits behind it.
// Restyling and repainting every piece each frame kept it over 80% busy; the
// compositor-run slide leaves it nearly idle. Chromium still checks in on
// compositor animations a few times a second, so this measures how long the
// main thread works rather than how often.
const WINDOW_MS = 2000;
const MAX_BUSY_SHARE = 0.2;

export function markWorking(value) {
  if (!value || typeof value !== "object") return;
  if (typeof value.id === "string" && value.id.startsWith("thr_") && value.runtime) {
    value.status = "active";
    value.runtime.displayStatus = "active";
    value.queuedWork = "none";
    value.hasPendingInteraction = false;
  }
  for (const child of Object.values(value)) markWorking(child);
}

async function mainThreadBusyShare(context, page) {
  const cdp = await context.newCDPSession(page);
  const events = [];
  cdp.on("Tracing.dataCollected", ({ value }) => events.push(...value));
  const complete = new Promise((resolve) => cdp.once("Tracing.tracingComplete", resolve));
  await cdp.send("Tracing.start", {
    transferMode: "ReportEvents",
    traceConfig: { includedCategories: ["toplevel", "devtools.timeline", "disabled-by-default-devtools.timeline"] },
  });
  await page.evaluate((ms) => new Promise((resolve) => setTimeout(resolve, ms)), WINDOW_MS);
  await cdp.send("Tracing.end");
  await complete;
  await cdp.detach();
  const renderer = events.find((event) => event.name === "TracingStartedInBrowser")
    ?.args?.data?.frames?.find((frame) => !frame.parent)?.processId;
  const main = events.find((event) => event.ph === "M" && event.pid === renderer && event.args?.name === "CrRendererMain")?.tid;
  assert.ok(renderer && main, "the trace names the page's main thread");
  const busyUs = events
    .filter((event) => event.pid === renderer && event.tid === main && event.ph === "X" && event.name === "ThreadControllerImpl::RunTask")
    .reduce((total, event) => total + (event.dur ?? 0), 0);
  return busyUs / 1000 / WINDOW_MS;
}

export async function verifyRowShine({ stack, fixture }) {
  const project = fixture.projects.get(FEATURED_PROJECT);
  const thread = fixture.threads.get(FEATURED_THREAD);
  const browser = await launch();
  try {
    const context = await openContext(browser, { organization: "project", reducedMotion: "no-preference" });
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
    await page.route(/\/api\/v1\/(sidebar-bootstrap|threads(?:\/[^/?]+)?)(\?|$)/, async (route) => {
      // A fetch still in flight as the page closes rejects; that is not a
      // finding, and an uncaught rejection would end the whole run.
      try {
        const response = await route.fetch({ maxRetries: route.request().method() === "GET" ? 2 : 0 });
        if (!response.headers()["content-type"]?.includes("application/json")) {
          await route.fulfill({ response });
          return;
        }
        const body = await response.json();
        markWorking(body);
        await route.fulfill({ response, json: body });
      } catch (error) {
        if (page.isClosed()) return;
        throw error;
      }
    });
    await page.goto(new URL(`/projects/${project.id}/threads/${thread.id}`, stack.serverUrl).href);
    const list = sidebar(page);
    await list.waitFor({ timeout: 120_000 });
    const row = list.locator("[data-ribbon-shine-row]").first();
    await row.waitFor();
    assert.ok((await list.locator("[data-ribbon-shine-row]").count()) >= 3, "several working rows shimmer at once");
    await page.mouse.move(1200, 450);
    await page.waitForFunction(() => document.getAnimations().some((animation) => animation.playState === "running"));

    // The wave still travels: the same row soon draws differently.
    const first = await row.screenshot({ animations: "allow" });
    const deadline = Date.now() + 10_000;
    let moved = false;
    while (!moved && Date.now() < deadline) {
      moved = !first.equals(await row.screenshot({ animations: "allow" }));
    }
    assert.ok(moved, "the shimmer moves across a working row");

    const busy = await mainThreadBusyShare(context, page);
    assert.ok(busy <= MAX_BUSY_SHARE, `shimmering rows kept the main thread ${Math.round(busy * 100)}% busy; the animation should run off it`);
    await page.unrouteAll({ behavior: "ignoreErrors" });
    await context.close();
  } finally {
    await browser.close();
  }
}
