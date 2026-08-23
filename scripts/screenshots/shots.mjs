import { FEATURED_THREAD, SIDE_CHAT_QUESTION } from "./fixture.mjs";
import { settleAnimations } from "./settle.mjs";

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

/**
 * Opens the thread every shot is framed around. It follows the sidebar link's
 * own target rather than clicking it, because clicking scrolls the row into
 * view, and a scrolled sidebar is not the top of a sidebar.
 */
async function openFeaturedThread(page) {
  const href = await page
    .getByRole("link", { name: new RegExp(`^Open ${FEATURED_THREAD}`) })
    .first()
    .getAttribute("href");
  // Not networkidle: bb holds a socket open, so idleness never arrives
  // reliably. The wait below is the real proof the thread rendered.
  await page.goto(new URL(href, page.url()).toString(), {
    waitUntil: "domcontentloaded",
  });
  // Exactly, because the sidebar row previews the same reply, at greater
  // length, and either match would otherwise be ambiguous.
  await page
    .getByText("Dashboard polish is in place.", { exact: true })
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
    .locator('#thread-detail-timeline-panel [title^="Copy branch name"]')
    .waitFor();
  // The crumbs arrive later still: their backend is asked for the trail after
  // the header has already painted, and they mount into a React root of their
  // own on an animation frame. Only the breadcrumbs shot clicks the crumb, so
  // every other shot framing this header would otherwise race it and capture
  // whichever title won — with the project before it, or bare.
  // Given the room the Thread stages sidebar is given, and for the same
  // reason: a freshly seeded bb is still settling while the first shots are
  // taken, and a plugin bundle can load well past Playwright's default minute.
  await projectCrumb(page).waitFor({ timeout: 120000 });
  // Every wait above proves a thing arrived. This one proves nothing is still
  // moving: the header reflows around the crumb once it lands.
  await settleAnimations(page);
}

/**
 * The crumb the featured thread's project draws, named by the container the
 * plugin installs rather than by the label alone.
 *
 * bb's own sidebar lists threads under a project heading whose menu carries
 * the same `Storefront actions` label, and it is on screen from the first
 * paint until Thread stages replaces the list — which happens just before the
 * crumb arrives. Waiting on the label alone is therefore answered immediately
 * by a control in the other half of the window, and the wait returns during
 * the one second when neither the heading nor the crumb is on screen.
 */
function projectCrumb(page) {
  return page.locator('[data-breadcrumbs-root] [aria-label="Storefront actions"]');
}

export const SHOTS = [
  {
    // The collection, not a plugin: one window with four of the five at work —
    // the stage sidebar, a project icon on every row and in the header, and the
    // project the thread belongs to before its title. Nothing is shaded here,
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
    },
    highlights: () => [],
  },
  {
    id: "breadcrumbs",
    plugin: "bb-plugin-breadcrumbs",
    outputs: THEME_FILES,
    async prepare({ page }) {
      await openFeaturedThread(page);
      // The open menu marks the header aria-hidden, so the trigger has to be
      // found by attribute rather than by role.
      await projectCrumb(page).click();
      await page.getByRole("menu").waitFor();
      await settleAnimations(page);
    },
    highlights: (page) => [
      { locator: projectCrumb(page) },
      { locator: page.getByRole("menu") },
    ],
  },
  {
    id: "icons",
    plugin: "bb-plugin-icons",
    outputs: THEME_FILES,
    async prepare({ page }) {
      await openFeaturedThread(page);
      await page.locator('[aria-label="Icon for Storefront"]').click();
      await page.getByRole("dialog").waitFor();
      // bb draws this dialog before its icons arrive: the catalog is a
      // separate request, and until it returns the picker reads "Loading
      // icons…". Waiting on the dialog alone caught that message about half
      // the time. An icon cannot render until the catalog has arrived and been
      // laid out, so wait for one.
      await page
        .getByRole("region", { name: "Icon catalog" })
        .getByRole("button")
        .first()
        .waitFor();
      await settleAnimations(page);
    },
    highlights: (page) => [
      { locator: page.locator('[aria-label="Icon for Storefront"]') },
      { locator: page.getByRole("dialog") },
    ],
    // The picker is taller than the card, so the card frames its top: the
    // header icon it belongs to, the colors, and the search field.
    focus: (page) => [
      page.locator('[aria-label="Icon for Storefront"]'),
      page.getByPlaceholder("Search icons"),
    ],
  },
  {
    id: "thread-stages",
    plugin: "bb-plugin-thread-stages",
    outputs: THEME_FILES,
    async prepare({ page }) {
      await openFeaturedThread(page);
      // The plugin mounts its sidebar after bb's own, so the shot waits for the
      // element it is about rather than for the thread alone. A freshly seeded
      // bb is still settling while the first shots are taken, and the plugin
      // bundle can load well past Playwright's default minute, so the wait is
      // given room rather than being allowed to fail the run.
      await page
        .locator("[data-thread-stages-sidebar-root]")
        .waitFor({ timeout: 120000 });
    },
    // The plugin owns the whole thread list rather than one control inside it,
    // so the shade lifts its entire sidebar out of the window.
    highlights: (page) => [
      { locator: page.locator("[data-thread-stages-sidebar-root]"), padding: 6 },
    ],
    // A sidebar is read from its top, so the card starts at the top of the one
    // the plugin manages, with bb's own rows just above it left in frame,
    // shaded, marking where bb stops and the plugin starts.
    focus: (page) => [page.locator("[data-thread-stages-sidebar-root]")],
    focusAlign: "start",
  },
  {
    id: "missing-keyboard-shortcuts",
    plugin: "bb-plugin-missing-keyboard-shortcuts",
    outputs: THEME_FILES,
    async prepare({ page }) {
      await openFeaturedThread(page);
      // ⇧⌘L opens a side chat and puts the cursor in its composer, so the
      // question can be typed without clicking anything.
      await page.keyboard.press("Shift+Meta+KeyL");
      const reply = page.getByRole("textbox", { name: "Reply…" });
      await reply.waitFor();
      // The next line types blind, so focus has to have arrived: the shortcut
      // moves it into this composer as the panel opens, and a keystroke sent
      // before that lands in whatever still holds it.
      await page.waitForFunction(
        (composer) => document.activeElement === composer,
        await reply.elementHandle(),
      );
      await settleAnimations(page);
      await page.keyboard.type(SIDE_CHAT_QUESTION);
      await page.keyboard.press("Enter");
      await page.getByText("Eighteen dashboard tests cover them.").waitFor();
      await settleAnimations(page);
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
    // The palette is server state, so it is switched on for this shot only and
    // switched back after it, leaving every other shot on bb's own default.
    setup({ fixture }) {
      fixture.run(["theme", "set", "plugin:chatgpt-theme:chatgpt"]);
    },
    teardown({ fixture }) {
      fixture.run(["theme", "reset"]);
    },
    async prepare({ page }) {
      await openFeaturedThread(page);
    },
    // A palette has nothing to point at: the whole window is the change.
    highlights: () => [],
    // Framed like the Thread stages card, from the top of the same sidebar,
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
];
