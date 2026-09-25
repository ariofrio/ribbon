import assert from "node:assert/strict";
import { chromium } from "playwright";
import { FEATURED_PROJECT, FEATURED_THREAD } from "../../screenshots/fixture.mjs";

const url = "https://github.com/example/project/pull/12345";

function pullRequest(attention) {
  return {
    outcome: "available",
    pullRequest: {
      number: 12345,
      title: "Sidebar placement fixture",
      url,
      state: "open",
      attention,
      baseRefName: "main",
      headRefName: "feature",
      updatedAt: "2026-09-18T00:00:00Z",
      checks: { failedCount: 0, passedCount: 30, pendingCount: 5, totalCount: 35, state: "pending" },
      mergeability: { mergeStateStatus: "BLOCKED", mergeable: "MERGEABLE", state: "blocked" },
      review: { reviewRequestCount: 0, state: "approved" },
    },
  };
}

const autoMergeDetails = {
  url,
  autoMerge: true,
  inMergeQueue: false,
  mergeStateStatus: "BLOCKED",
  mergeable: "MERGEABLE",
  reviewDecision: "APPROVED",
  requestedReviewers: [],
  checks: { state: "pending", total: 35, passed: 30, failed: 0, pending: 5 },
};

async function open({ browser, stack, fixture, attention, details }) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.addInitScript(() => {
    localStorage.setItem("bb.sidebar.threadListProvider", JSON.stringify("ribbon-sidebar/ribbon-sidebar"));
  });
  const page = await context.newPage();
  // bb's own lookup answers at the host API; GitHub's answer for the plugin
  // server arrives through its RPC, since `gh` cannot be routed from here.
  await page.route("**/api/v1/environments/*/pull-request*", (route) =>
    route.fulfill({ json: pullRequest(attention) }));
  await page.route("**/api/v1/plugins/ribbon-sidebar/rpc/pullRequestDetailsV1", (route) =>
    details
      ? route.fulfill({ json: { ok: true, result: { details } } })
      : route.fulfill({ status: 500, json: { ok: false, error: { message: "gh unavailable" } } }));
  const thread = fixture.threads.get(FEATURED_THREAD);
  const project = fixture.projects.get(FEATURED_PROJECT);
  await page.goto(new URL(`/projects/${project.id}/threads/${thread.id}`, stack.serverUrl).href);
  await page.locator("[data-ribbon-sidebar-root][data-ribbon-sidebar-ready]").waitFor({ timeout: 120_000 });
  return { context, page, threadId: thread.id };
}

/** The mark drawn in this row's trailing slot, with its rendered colors. */
async function renderedStatus(page, threadId, label) {
  const handle = await page.waitForFunction(({ threadId, label }) => {
    const row = document
      .querySelector(`[data-ribbon-sidebar-root] a[data-sidebar-thread-id="${threadId}"]`)
      ?.closest("li");
    const mark = row?.querySelector(`[data-sidebar-thread-trailing-indicator] [aria-label="${CSS.escape(label)}"]`);
    const number = row && [...row.querySelectorAll("span")].find((node) => node.textContent === "#12345");
    if (!mark || !number) return null;
    const box = mark.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return null;
    const probe = document.createElement("span");
    row.append(probe);
    const token = (name) => {
      probe.style.color = `var(${name})`;
      return getComputedStyle(probe).color;
    };
    const tokens = {
      attention: token("--attention"),
      destructive: token("--destructive"),
      success: token("--success"),
    };
    probe.remove();
    const dot = mark.querySelector("span");
    // bb's unread dot, drawn in another row's indicator slot, is the circle a
    // pending mark sits beside.
    const unread = [...document.querySelectorAll(
      "[data-ribbon-sidebar-root] [data-sidebar-thread-trailing-indicator] [aria-label] > span",
    )].find((node) => node !== dot);
    const size = (node) => {
      const { width, height } = node.getBoundingClientRect();
      return { width, height };
    };
    if (dot && !unread) return null;
    return {
      dotSize: dot ? size(dot) : null,
      unreadSize: unread ? size(unread) : null,
      mark: dot ? getComputedStyle(dot).backgroundColor : getComputedStyle(mark).color,
      icon: getComputedStyle(number.querySelector("svg")).color,
      title: number.getAttribute("title"),
      tokens,
    };
  }, { threadId, label }, { timeout: 30_000 });
  return handle.jsonValue();
}

export async function verifyPrStatus({ stack, fixture, cases }) {
  const browser = await chromium.launch({ args: ["--mute-audio"] });
  try {
    if (cases.includes("auto-merge")) {
      const { context, page, threadId } = await open({
        browser, stack, fixture, attention: "blocked", details: [autoMergeDetails],
      });
      const label = "Auto-merge on · approved · waiting on CI (30/35)";
      const status = await renderedStatus(page, threadId, label);
      assert.equal(status.mark, status.tokens.attention, "waiting mark is amber");
      assert.equal(status.icon, status.tokens.attention, "auto-merge icon is amber");
      assert.equal(status.title, `Sidebar placement fixture — ${label}`);
      assert.deepEqual(status.dotSize, status.unreadSize, "waiting mark matches the unread dot's size");
      await context.close();
    }
    if (cases.includes("attention-fallback")) {
      const { context, page, threadId } = await open({
        browser, stack, fixture, attention: "checks_failed", details: null,
      });
      const status = await renderedStatus(page, threadId, "CI failing");
      assert.equal(status.mark, status.tokens.destructive, "failing mark is red");
      assert.equal(status.icon, status.tokens.success, "open icon stays green");
      await context.close();
    }
  } finally {
    await browser.close();
  }
}
