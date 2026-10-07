import { chromium } from "playwright";

/** bb's key for the selected thread list, and this plugin's entry in it. */
export const PROVIDER = "thread-stages/thread-stages";
export const PREFERENCES_KEY = "bb.plugin.thread-stages.preferences.v1";
export const READY = "[data-ribbon-sidebar-root][data-ribbon-sidebar-ready]";

export function launch() {
  return chromium.launch({ args: ["--mute-audio"] });
}

/**
 * A browser context that opens on this plugin's list, organized by section
 * unless a test says otherwise. Every suite starts here so the choice bb
 * remembers from an earlier context never leaks into a later one.
 */
export async function openContext(
  browser,
  { organization = "chronological", viewport = { width: 1280, height: 900 }, ...options } = {},
) {
  const context = await browser.newContext({ viewport, ...options });
  // A beforeunload prompt would otherwise be dismissed, cancelling the reload
  // that raised it and hanging the test; say which page raised one.
  context.on("page", (page) => {
    page.on("dialog", (dialog) => {
      console.error(`dialog on ${page.url()}: ${dialog.type()} ${dialog.message()}`);
      void dialog.accept();
    });
  });
  await context.addInitScript(
    ({ provider, key, organization }) => {
      localStorage.setItem("bb.sidebar.threadListProvider", JSON.stringify(provider));
      // Seeded once: a reload keeps what the test chose since.
      if (localStorage.getItem(key) !== null) return;
      localStorage.setItem(
        key,
        JSON.stringify({
          view: {
            scope: { kind: "all" },
            groupingKey: organization === "project" ? "builtin:projects" : "builtin:sections",
          },
          collapsed: [],
        }),
      );
    },
    { provider: PROVIDER, key: PREFERENCES_KEY, organization },
  );
  return context;
}

/** The list once the plugin has drawn every row's stage. */
export function sidebar(page) {
  return page.locator(READY);
}

export function sidebarRoot(page) {
  return page.locator("[data-ribbon-sidebar-root]");
}

export function section(page, sectionId) {
  return sidebarRoot(page).locator(`[data-sidebar-section-id="${sectionId}"]`);
}

export function project(page, projectId) {
  return sidebarRoot(page).locator(`[data-sidebar-project-id="${projectId}"]`);
}

export function row(scope, threadId) {
  return scope.locator(`[data-thread-id="${threadId}"]`).first();
}

export function link(scope, threadId) {
  return scope.locator(`a[data-sidebar-thread-id="${threadId}"]`).first();
}

export function heading(scope) {
  return scope.locator('[data-sidebar="group-label"]').first();
}

/** The order of rows in a scope, by thread ID. */
export function rowOrder(scope) {
  return scope
    .locator("[data-thread-id]")
    .evaluateAll((nodes) => nodes.map((node) => node.dataset.threadId));
}

/** The chip dnd-kit draws under the pointer while a row is dragged. */
export function dragChip(page) {
  return page.locator('[data-sidebar-section-drag-overlay="true"]:visible');
}

/** The row that would receive the drop, marked before or after. */
export function dropMarker(scope) {
  return scope.locator("[data-sidebar-reorder-placement]");
}

/** Picks a row up with the mouse and holds it a few pixels away. */
export async function pickUp(page, target) {
  const box = await target.boundingBox();
  await page.mouse.move(box.x + 60, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 70, box.y + box.height / 2, { steps: 3 });
  await dragChip(page).waitFor({ timeout: 10_000 });
  return box;
}

/**
 * Carries a held row to the top or bottom sliver of another. The middle of a
 * row nests into it, so only its edges mean "beside".
 */
export async function carryTo(page, target, edge = "before") {
  const box = await target.boundingBox();
  const y = edge === "before" ? box.y + 2 : box.y + box.height - 2;
  await page.mouse.move(box.x + 60, y, { steps: 10 });
  return box;
}

/** Waits until `first` sits above `second` in the list. */
export function waitForOrder(page, first, second) {
  return page.waitForFunction(
    ([firstId, secondId]) => {
      const ids = [...document.querySelectorAll("[data-ribbon-sidebar-root] [data-thread-id]")]
        .map((node) => node.dataset.threadId);
      return ids.indexOf(firstId) >= 0 && ids.indexOf(firstId) < ids.indexOf(secondId);
    },
    [first, second],
  );
}

export function spawnChild(fixture, { parent, project, title, AGENT }) {
  const child = fixture.runJson([
    "thread", "spawn", "--project", project.id,
    "--machine", "screenshots", "--environment", project.root,
    "--parent-thread", parent.id, "--provider", `acp-${AGENT.id}`,
    "--model", AGENT.modelId, "--title", title,
    "--permission-mode", "accept-edits", "--prompt", `Check ${title}.`,
  ]);
  fixture.run(["thread", "wait", child.id, "--status", "idle"]);
  return child;
}

/**
 * Waits for the parent to finish answering its child's finish. bb tells the
 * parent a moment after the child idles, and the turn that starts leaves the
 * parent unread; a parent read before that turn ends is unread again after.
 */
export async function parentAnswered(fixture, parent, child) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const events = fixture.runJson(["thread", "log", parent.id, "--all"]);
    const request = events.find((event) => {
      const subject = event.type === "client/turn/requested" ? event.data.systemMessageSubject : null;
      return subject?.threadId === child.id || subject?.outcomes?.some((outcome) => outcome.threadId === child.id);
    });
    if (request && events.some((event) => event.type === "turn/completed" && event.seq > request.seq)) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`${parent.id} never finished answering ${child.id}`);
}

/**
 * Runs an action that changes a list preference and waits for the debounced
 * write to reach the server, so a reload finds it.
 */
export async function withPreferenceSaved(page, key, action) {
  const saved = page.waitForResponse(
    (response) =>
      response.url().endsWith("/rpc/setPreference") &&
      response.request().postDataJSON()?.key === key,
  );
  // A failing action is the error to report, not the wait it leaves behind.
  void saved.catch(() => undefined);
  await action();
  await saved;
}
