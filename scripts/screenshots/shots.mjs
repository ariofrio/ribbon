import {
  AGENT,
  FEATURED_THREAD,
  SIDE_CHAT_QUESTION,
} from "./fixture.mjs";
import { settleAnimations } from "./settle.mjs";
import { seedTitleShowcase, TITLE_SHOWCASE } from "./showcase.mjs";

export const MODIFIER = process.platform === "darwin" ? "Meta" : "Control";

// What each plugin's screenshot pictures. Every shot starts from the same
// seeded bb and is captured twice: the whole window, for the plugin's own
// README, and a card cropped to what the plugin adds, for the table in the
// root README. Both carry the same shade and the same cutouts.
const THEME_FILES = [
  "screenshot-light.png",
  "screenshot-dark.png",
  // Two cards per mode: the one a row stacks, and the one it floats, which
  // carries the margin the paragraph beside it needs.
  "card-light.png",
  "card-dark.png",
  "card-beside-light.png",
  "card-beside-dark.png",
];

export const SIDEBAR_PROVIDER = "Thread stages";

/** bb's own sidebar column, which both sidebar cards are framed from. */
function bbSidebar(page) {
  return page.locator('[data-sidebar="sidebar"]');
}

/** The right panel the ⇧⌘L side chat opens into. */
function sideChatPanel(page) {
  return page
    .locator("aside")
    .filter({ has: page.getByRole("textbox", { name: "Reply…" }) });
}

function composer(page) {
  return page.locator('[data-app-composer-role="primary"]');
}

function modelResults(page) {
  return page.locator('button[title^="Models:"]').first().locator("xpath=../../..");
}

async function prepareModelMentions(page) {
  const editor = composer(page).locator('[contenteditable="true"]');
  const picker = composer(page).getByRole("button", { name: /Provider, model and reasoning/ });
  await picker.filter({ hasText: AGENT.modelName }).waitFor({ timeout: 120000 });
  const initialSelection = await picker.innerText();
  await editor.click();
  await page.keyboard.type("Have @model:Sonnet");
  const sonnet = page.locator('button[title^="Models:"]').filter({ hasText: "Model · Claude Code" });
  await sonnet.waitFor({ timeout: 120000 });
  await sonnet.click();
  await composer(page).locator("[data-prompt-mention]").filter({ hasText: "Sonnet" }).waitFor();
  await page.keyboard.type(" check the tests, then ask @model:Opus");
  const results = modelResults(page);
  await results.getByText("Model · Claude Code", { exact: true }).waitFor({ timeout: 120000 });
  await results.getByText("Model · Pi", { exact: true }).waitFor({ timeout: 120000 });
  if (await picker.innerText() !== initialSelection) throw new Error("Model mentions changed the composer selection");
  // Keep the pointer off the results so hovering cannot change the selected
  // suggestion or cover the menu with a tooltip.
  const viewport = page.viewportSize();
  await page.mouse.move(viewport.width - 1, viewport.height - 1);
  await settleAnimations(page);
}

async function openSideChatByShortcut(page) {
  const reply = page.getByRole("textbox", { name: "Reply…" });
  const readinessTimeout = 120000;
  const retryTimeout = 10000;
  const maxAttempts = readinessTimeout / retryTimeout;
  const isCreateSideChatRequest = (request) =>
    request.method() === "POST" &&
    new URL(request.url()).pathname ===
      "/api/v1/plugins/missing-keyboard-shortcuts/rpc/createSideChat";
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const requestPromise = page.waitForRequest(isCreateSideChatRequest, {
      timeout: retryTimeout,
    });
    void requestPromise.catch(() => {});
    try {
      await page.keyboard.press(`Shift+${MODIFIER}+KeyL`);
      const observed = await Promise.any([
        requestPromise.then((request) => ({ request })),
        reply
          .waitFor({ timeout: retryTimeout })
          .then(() => ({ request: null })),
      ]);
      if (observed.request !== null) {
        const response = await observed.request.response();
        if (response === null || !response.ok()) {
          throw new Error(
            `createSideChat failed${
              response === null ? " without a response" : ` with HTTP ${response.status()}`
            }`,
          );
        }
        await reply.waitFor({ timeout: readinessTimeout });
      }
      return reply;
    } catch (error) {
      // A full navigation remounts the shortcut plugin, so keep delivering the
      // key until either its RPC or the reusable panel proves the listener
      // handled one. Never retry after either point: the next key could close
      // the newly opened panel.
      if (
        !(error instanceof AggregateError) ||
        error.errors.some((candidate) => candidate?.name !== "TimeoutError") ||
        attempt === maxAttempts - 1
      ) {
        throw error;
      }
      continue;
    }
  }
}

/**
 * The main composer's model label is fixture chrome outside the shortcut this
 * shot demonstrates. Its variable-font edge pixels can differ between two
 * otherwise identical container captures, so leave its layout in place while
 * keeping those unrelated glyphs out of this full-window image.
 */
async function hideFixtureModelLabel(page) {
  await page.locator("span").evaluateAll((spans, modelName) => {
    for (const span of spans) {
      if (span.textContent === modelName) span.style.visibility = "hidden";
    }
  }, AGENT.modelName);
}

/**
 * Opens the thread every shot is framed around. It follows the sidebar link's
 * own target rather than clicking it, because clicking scrolls the row into
 * view, and a scrolled sidebar is not the top of a sidebar.
 */
async function openFeaturedThread(page, knownHref, {
  title = FEATURED_THREAD,
  reply = "Dashboard polish is in place.",
} = {}) {
  // Installing Thread stages changes bb's Automatic choice. Select it
  // explicitly so every shot exercises the only sidebar replacement in this
  // repository; its own shot supplies the route directly below.
  if (knownHref === undefined) {
    await selectSidebar(page, SIDEBAR_PROVIDER);
    // Appearance does not render a thread list. Return to bb's main route so
    // the selected provider mounts before resolving the featured row's link.
    await page.goto(new URL("/", page.url()).toString(), {
      waitUntil: "domcontentloaded",
    });
  }
  const href =
    knownHref ??
    (await page
      .getByRole("link", { name: new RegExp(`^Open ${FEATURED_THREAD}`) })
      .first()
      .getAttribute("href", { timeout: 120000 }));
  // Not networkidle: bb holds a socket open, so idleness never arrives
  // reliably. The wait below is the real proof the thread rendered.
  await page.goto(new URL(href, page.url()).toString(), {
    waitUntil: "domcontentloaded",
  });
  // Exactly, because the sidebar row previews the same reply, at greater
  // length, and either match would otherwise be ambiguous.
  await page
    .getByText(reply, { exact: true })
    .waitFor();
  // The composer resolves its permission mode after the thread itself, and a
  // shot taken in between differs from the same shot taken after, in a corner
  // no plugin here owns.
  //
  // Given the same two minutes as the crumb below, and for the same reason:
  // this is a readiness check bounded by a deadline, and a deadline measures
  // the machine. On a box carrying other captures it has timed out at thirty
  // seconds while the app was merely slow, which fails a run that would have
  // succeeded. The slack goes here rather than into accepting a shot taken
  // before the chip resolves.
  await page
    .getByRole("button", { name: "Permission mode" })
    .filter({ hasText: "Accept Edits" })
    .waitFor({ timeout: 120000 });
  // The branch the thread's workspace is on arrives later than the composer it
  // is written under, and it widens the row it lands in, so a shot taken in
  // between differs from the same shot taken after. Named inside the timeline
  // panel because the thread's details panel carries the same chip.
  await page
    .locator('#thread-detail-timeline-panel [data-promptbox-hide-branch-compact]')
    .filter({ hasText: /^main$/ })
    .waitFor({ timeout: 120000 });
  // The Thread stages list every shot shows draws its rows' stages and pull
  // request states after the rows themselves, and a shot taken in between
  // loses them. Its root is marked ready once the stages are in, and a row
  // stays marked pending until its pull request is known. The featured row
  // proves the rows are drawn, so an empty pending set is not vacuous. Given
  // two minutes because a freshly seeded bb is still settling while the first
  // shots are taken, and a plugin bundle can load well past Playwright's
  // default minute.
  const ribbon = page.locator(
    "[data-ribbon-sidebar-root][data-ribbon-sidebar-ready]",
  );
  await ribbon
    .getByRole("link", { name: new RegExp(`^Open ${title}`) })
    .first()
    .waitFor({ timeout: 120000 });
  await page.waitForFunction(
    () =>
      document.querySelector(
        "[data-ribbon-sidebar-root] [data-ribbon-pull-request-pending]",
      ) === null,
    null,
    { timeout: 120000 },
  );
  // Every wait above proves a thing arrived. This one proves nothing is still
  // moving.
  await settleAnimations(page);
}

async function selectSidebar(page, name) {
  await page.goto(new URL("/settings/appearance", page.url()).toString(), {
    waitUntil: "domcontentloaded",
  });
  await page
    .getByRole("heading", { name: "Appearance", exact: true })
    .waitFor({ timeout: 120000 });
  const selector = page.getByRole("button", { name: "Sidebar thread list" });
  await selector.waitFor({ timeout: 120000 });
  if ((await selector.innerText()) !== name) {
    await selector.click();
    // The accessible name also includes the option description, so filter the
    // menu item by its exact title instead of matching the whole name.
    await page
      .getByRole("menuitem")
      .filter({ has: page.getByText(name, { exact: true }) })
      .click();
  }
}

/** The collection is presented in ChatGPT's palette, including every plugin shot. */
export function setupScreenshots({ fixture }) {
  fixture.run(["theme", "set", "plugin:chatgpt-theme:chatgpt"]);
}

export const SHOTS = [
  {
    // One everyday workflow: a review action, a delegated investigation, and
    // a model choice in the composer. Nothing is shaded here,
    // because nothing is being pointed at.
    id: "collection",
    plugin: null,
    fileName: "hero",
    outputs: ["hero-light.png", "hero-dark.png"],
    // The hero runs the width of the README, where bb's default window spends
    // most of its height on an empty conversation. A shorter window fills the
    // same column with the parts a reader is being shown.
    viewport: { width: 1080, height: 620 },
    async prepare({ page }) {
      await openFeaturedThread(page);
      await prepareModelMentions(page);
    },
    highlights: () => [],
  },
  {
    id: "model-mentions",
    plugin: "bb-plugin-model-mentions",
    outputs: THEME_FILES,
    async prepare({ page }) {
      await openFeaturedThread(page);
      await prepareModelMentions(page);
    },
    highlights: (page) => [
      { locator: modelResults(page), padding: 4 },
      { locator: composer(page).locator('[contenteditable="true"]'), padding: 8 },
    ],
    focus: (page) => [modelResults(page), composer(page).locator('[contenteditable="true"]')],
    card: { viewport: { width: 900, height: 500 } },
  },
  {
    id: "missing-keyboard-shortcuts",
    plugin: "bb-plugin-missing-keyboard-shortcuts",
    outputs: THEME_FILES,
    async prepare({ page }) {
      // A full navigation can render the thread before remounting the plugin,
      // losing a shortcut sent in between. Wait for the public app overlay to
      // install its listener before pressing the shortcut.
      await openFeaturedThread(page);
      await page
        .locator("[data-missing-keyboard-shortcuts-ready]")
        .waitFor({ state: "attached", timeout: 120000 });
      // ⇧⌘L opens a side chat and puts the cursor in its composer, so the
      // question can be typed without clicking anything.
      const reply = await openSideChatByShortcut(page);
      // The next line types blind, so focus has to have arrived: the shortcut
      // moves it into this composer as the panel opens, and a keystroke sent
      // before that lands in whatever still holds it.
      await page.waitForFunction(
        (composer) => document.activeElement === composer,
        await reply.elementHandle(),
      );
      await settleAnimations(page);
      const panel = sideChatPanel(page);
      if (await panel.getByText(SIDE_CHAT_QUESTION, { exact: true }).count() === 0) {
        await page.keyboard.type(SIDE_CHAT_QUESTION);
        await page.keyboard.press("Enter");
      }
      await panel.getByText("Eighteen dashboard tests cover them.").waitFor();
      await panel.getByRole("button", { name: "Stop run", exact: true }).waitFor({ state: "hidden" });
      await settleAnimations(page);
      await hideFixtureModelLabel(page);
    },
    highlights: (page) => [
      {
        locator: sideChatPanel(page),
        // The panel runs the full height of the window, so the keys sit beside
        // it, level with the conversation rather than with its empty middle.
        keys: "⇧ ⌘ L",
        keysPlacement: "left",
        keysAnchor: "start",
      },
    ],
    // The panel is as wide as the card, so the card frames the exchange at its
    // top and the keys that opened it.
    focus: (page) => [
      page.getByRole("toolbar", { name: "Right panel views" }),
      page.getByText("Eighteen dashboard tests cover them."),
    ],
  },
  {
    id: "chatgpt-theme",
    plugin: "bb-plugin-chatgpt-theme",
    outputs: THEME_FILES,
    // The palette has no light-mode screenshot and dark-mode screenshot to
    // choose between: each of its files shows both palettes, meeting along the
    // diagonal, with the mode it is named for in the top-left corner.
    split: true,
    async prepare({ page }) {
      await openFeaturedThread(page);
    },
    // A palette has nothing to point at: the whole window is the change.
    highlights: () => [],
    // Framed from the top of the sidebar,
    // where the palette repaints the most per pixel and the diagonal still has
    // two surfaces to divide.
    focus: (page) => [bbSidebar(page)],
    focusAlign: "start",
    // A palette covers every surface, so its card should hold as many of them
    // as it can. bb's default window puts most of a thread's height into empty
    // space, so the card comes from a smaller window with a narrower sidebar,
    // which brings the composer into the same frame as the sidebar and the
    // header without changing how large any of them are drawn.
    card: {
      viewport: { width: 900, height: 400 },
      style: '[data-sidebar="panel"], [data-sidebar="gap"] { --sidebar-width: 220px !important; }',
    },
  },
  {
    id: "thread-titles",
    plugin: "bb-plugin-thread-titles",
    outputs: THEME_FILES,
    setup: seedTitleShowcase,
    async prepare({ fixture, page }) {
      await selectSidebar(page, SIDEBAR_PROVIDER);
      const thread = fixture.titleShowcase;
      await openFeaturedThread(page, `/projects/${thread.projectId}/threads/${thread.id}`, {
        title: TITLE_SHOWCASE.title,
        reply: TITLE_SHOWCASE.reply.split("\n\n")[0],
      });
      // This is the plugin's actual first-turn result, not a preassigned title.
      await page.locator("[data-ribbon-sidebar-root]").getByRole("link", { name: new RegExp(`^Open ${TITLE_SHOWCASE.title}`) }).waitFor({ timeout: 120000 });
      await page.getByText(TITLE_SHOWCASE.title, { exact: true }).last().waitFor();
      await page.getByText("All 12 webhook tests pass.", { exact: false }).waitFor();
      await settleAnimations(page);
    },
    highlights: (page) => [
      { locator: page.getByText(TITLE_SHOWCASE.title, { exact: true }).last(), padding: 8 },
      { locator: page.locator("[data-ribbon-sidebar-root]").getByRole("link", { name: new RegExp(`^Open ${TITLE_SHOWCASE.title}`) }), padding: 4 },
      { locator: page.locator("#thread-detail-timeline-panel").getByText(/^Investigate https:/), padding: 8 },
    ],
    focus: (page) => [
      page.getByText(TITLE_SHOWCASE.title, { exact: true }).last(),
      page.locator("#thread-detail-timeline-panel"),
    ],
    focusAlign: "start",
    card: {
      viewport: { width: 800, height: 440 },
      style: '[data-sidebar="panel"], [data-sidebar="gap"] { --sidebar-width: 240px !important; }',
    },
    teardown({ fixture }) {
      fixture.run(["thread", "archive", fixture.titleShowcase.id]);
    },
  },
  {
    id: "thread-stages",
    plugin: "bb-plugin-thread-stages",
    outputs: THEME_FILES,
    async prepare({ fixture, page }) {
      const featured = fixture.threads.get(FEATURED_THREAD);
      const href = `/projects/${encodeURIComponent(featured.projectId)}/threads/${encodeURIComponent(featured.id)}`;
      await selectSidebar(page, SIDEBAR_PROVIDER);
      await openFeaturedThread(page, href);
      await page
        .locator(
          "[data-ribbon-sidebar-root][data-ribbon-sidebar-ready]",
        )
        .waitFor({ timeout: 120000 });
      await settleAnimations(page);
      await page.locator("[data-ribbon-sidebar-root]").getByRole("button", { name: `Review in ${FEATURED_THREAD}`, exact: true }).waitFor();
      await page.locator("[data-ribbon-sidebar-root]").getByRole("link", { name: /^Open Trace the backoff timer/ }).waitFor();
    },
    // The plugin owns every stage band, ring, and heading icon in the list,
    // so the shade lifts the whole list out of the window.
    highlights: (page) => [
      { locator: page.locator("[data-ribbon-sidebar-root]"), padding: 6 },
    ],
    // A sidebar is read from its top, so the card starts at the top of the list.
    focus: (page) => [page.locator("[data-ribbon-sidebar-root]")],
    focusAlign: "start",
  },
];
