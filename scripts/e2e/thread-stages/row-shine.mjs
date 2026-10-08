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

    const phases = () => list.locator("[data-ribbon-active-row]").evaluateAll((rows) => rows.flatMap((node) =>
      node.getAnimations({ subtree: true })
        .filter((animation) => ["spin", "ribbon-shine-window", "ribbon-shine-content"].includes(animation.animationName))
        .map((animation) => ({
          name: animation.animationName,
          progress: animation.effect.getComputedTiming().progress,
          transform: getComputedStyle(animation.effect.target).transform,
        })),
    ));
    const verifyPhases = async () => {
      const observations = await phases();
      const rings = observations.filter(({ name }) => name === "spin");
      assert.ok(rings.length >= 3, "several working rings are rendered");
      const progress = observations.map(({ progress }) => progress);
      assert.ok(progress.every((value) => value !== null), "every working animation has a phase");
      assert.ok(Math.max(...progress) - Math.min(...progress) < 0.001,
        `all row shimmers and rings share a phase: ${JSON.stringify(observations)}`);
      assert.ok(rings.every(({ transform }) => transform === rings[0].transform),
        "rings in different rows render the same rotation");
    };
    await verifyPhases();

    // A draft adds a new shining indicator after the row is already moving.
    // Wait for a phase well away from zero so a restarted animation cannot
    // accidentally look synchronized.
    await page.waitForFunction(() => {
      const wave = document.querySelector("[data-ribbon-sidebar-root] [data-ribbon-shine-window]");
      const progress = wave?.getAnimations()[0]?.effect.getComputedTiming().progress;
      return progress > 0.25 && progress < 0.5;
    });
    const editor = page.locator('[data-app-composer-role="primary"] [contenteditable="true"]').first();
    await editor.fill("A draft added while working");
    await list.locator(`[data-thread-id="${thread.id}"] [data-sidebar-thread-trailing-indicator]`)
      .getByLabel("Thread working with unsubmitted draft", { exact: true }).waitFor();
    await verifyPhases();

    await page.emulateMedia({ reducedMotion: "reduce" });
    assert.equal((await phases()).length, 0, "reduced motion stops all row shimmers and rings");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.waitForFunction(() => {
      const animations = [...document.querySelectorAll("[data-ribbon-sidebar-root] [data-ribbon-active-row]")]
        .flatMap((node) => node.getAnimations({ subtree: true }))
        .filter((animation) => ["spin", "ribbon-shine-window", "ribbon-shine-content"].includes(animation.animationName));
      return animations.length > 0 && animations.every((animation) => !animation.pending &&
        animation.effect.getComputedTiming().progress > 0);
    });
    await verifyPhases();

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
