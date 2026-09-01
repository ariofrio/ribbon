import { chromium } from "playwright";
import {
  AGENT,
  FEATURED_PROJECT,
  FEATURED_THREAD,
} from "../../screenshots/fixture.mjs";

const PLUGIN_ID = "breadcrumbs";
const CHILD_TITLE = "Check native child badge";

/**
 * Renders one child thread first with bb alone and then with Breadcrumbs, both
 * against the bb version pinned by the E2E runner. The native control proves
 * the targeted bb still owns the badge this plugin removes.
 */
export async function verifyBreadcrumbChildBadge({ stack, fixture }) {
  const parent = fixture.threads.get(FEATURED_THREAD);
  const project = fixture.projects.get(FEATURED_PROJECT);
  if (parent === undefined || project === undefined) {
    throw new Error("The Breadcrumbs E2E fixture is missing its parent thread");
  }

  fixture.run([
    "plugin",
    "config",
    PLUGIN_ID,
    "set",
    "showAncestors",
    "true",
  ]);
  fixture.run(["plugin", "disable", PLUGIN_ID]);

  const child = fixture.runJson([
    "thread",
    "spawn",
    "--project",
    project.id,
    "--machine",
    "screenshots",
    "--environment",
    project.root,
    "--parent-thread",
    parent.id,
    "--provider",
    `acp-${AGENT.id}`,
    "--model",
    AGENT.modelId,
    "--title",
    CHILD_TITLE,
    "--permission-mode",
    "accept-edits",
    "--prompt",
    "Confirm the native child-thread header treatment.",
  ]);
  fixture.run(["thread", "wait", child.id, "--status", "idle"]);

  let browser;
  let context;
  try {
    browser = await chromium.launch();
    context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    const diagnostics = [];
    page.on("console", (message) => {
      if (message.type() !== "error" && message.type() !== "warning") return;
      diagnostics.push(`${message.type()}: ${message.text()}`);
    });
    page.on("pageerror", (error) => {
      diagnostics.push(`pageerror: ${error.stack ?? error.message}`);
    });
    const href = `/projects/${encodeURIComponent(project.id)}/threads/${encodeURIComponent(child.id)}`;
    await page.goto(new URL(href, stack.serverUrl).href, {
      waitUntil: "domcontentloaded",
    });

    const childBadge = page.locator("header").getByText("child", { exact: true });
    try {
      await childBadge.waitFor({ state: "visible", timeout: 120_000 });
      const count = await childBadge.count();
      if (count !== 1) {
        throw new Error(`Expected one native child badge, found ${count}`);
      }

      fixture.run(["plugin", "enable", PLUGIN_ID]);
      await page.reload({ waitUntil: "domcontentloaded" });
      await page
        .locator("[data-breadcrumbs-root]")
        .getByTitle(FEATURED_THREAD)
        .waitFor({ state: "visible", timeout: 120_000 });
      await childBadge.waitFor({ state: "hidden", timeout: 15_000 });
    } catch (error) {
      const details =
        diagnostics.length === 0
          ? ""
          : `\n${diagnostics.slice(-20).join("\n")}`;
      throw new Error(`Breadcrumbs child-badge E2E failed${details}`, {
        cause: error,
      });
    }
  } finally {
    await context?.close();
    await browser?.close();
    try {
      fixture.run(["plugin", "enable", PLUGIN_ID]);
    } finally {
      fixture.run(["thread", "delete", child.id, "--yes"]);
    }
  }
}
