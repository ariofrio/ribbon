import assert from "node:assert/strict";
import { AGENT, FEATURED_PROJECT, FEATURED_THREAD } from "../../screenshots/fixture.mjs";
import { heading, launch, openContext, row, section, sidebar } from "./sidebar.mjs";

export async function verifyPrNumber({ stack, fixture }) {
  // Other suites give the featured thread children, whose toggle hover reveals
  // beside the number. Own a childless, read row for the indicator-lane checks.
  const featuredProject = fixture.projects.get(FEATURED_PROJECT);
  const laneThread = fixture.runJson([
    "thread", "spawn",
    "--project", featuredProject.id,
    "--machine", "screenshots",
    "--environment", featuredProject.root,
    "--provider", `acp-${AGENT.id}`,
    "--model", AGENT.modelId,
    "--permission-mode", "accept-edits",
    "--title", "Check PR number alignment",
    "--prompt", "Confirm the PR number alignment fixture is ready.",
  ]);
  const browser = await launch();
  try {
    fixture.run(["thread", "wait", laneThread.id, "--status", "idle"]);
    fixture.run(["thread", "update", laneThread.id, "--section", fixture.section.id]);
    fixture.run(["thread", "read", laneThread.id]);
    const context = await openContext(browser, { viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    const thread = fixture.threads.get(FEATURED_THREAD);
    const project = fixture.projects.get(FEATURED_PROJECT);
    // Supply GitHub's response at the host API boundary; exercise the real SDK hook.
    await page.route("**/api/v1/environments/*/pull-request*", (route) => route.fulfill({
      json: {
        outcome: "available",
        pullRequest: {
          number: 12345,
          title: "Sidebar placement fixture",
          url: "https://github.com/example/project/pull/12345",
          state: "merged",
          attention: "merged",
          baseRefName: "main",
          headRefName: "feature",
          updatedAt: "2026-09-18T00:00:00Z",
          checks: { failedCount: 0, passedCount: 1, pendingCount: 0, totalCount: 1, state: "passing" },
          mergeability: { mergeStateStatus: "CLEAN", mergeable: "MERGEABLE", state: "mergeable" },
          review: { reviewRequestCount: 0, state: "approved" },
        },
      },
    }));
    await page.goto(new URL(`/projects/${project.id}/threads/${thread.id}`, stack.serverUrl).href);
    const list = sidebar(page);
    await list.waitFor({ timeout: 120_000 });
    const target = row(list, thread.id);
    const header = heading(section(page, fixture.section.id));

    async function placement(position) {
      await page.waitForFunction(({ threadId, title, position }) => {
        const rowNode = document.querySelector(`[data-ribbon-sidebar-root] [data-thread-id="${threadId}"]`);
        if (!rowNode) return false;
        const number = [...rowNode.querySelectorAll("span")].find((node) => node.textContent === "#12345");
        if (position === "hidden") return !number;
        const label = [...rowNode.querySelectorAll("span")].find((node) => node.childElementCount === 0 && node.textContent === title);
        if (!number || !label) return false;
        const numberBox = number.getBoundingClientRect();
        // The title's text runs on under its clip; measure what is shown.
        let clip = label.parentElement;
        while (clip && getComputedStyle(clip).overflowX !== "hidden") clip = clip.parentElement;
        const labelBox = label.getBoundingClientRect();
        const clipBox = clip ? clip.getBoundingClientRect() : labelBox;
        const titleBox = {
          left: Math.max(labelBox.left, clipBox.left),
          right: Math.min(labelBox.right, clipBox.right),
          y: labelBox.y,
          height: labelBox.height,
          width: Math.min(labelBox.right, clipBox.right) - Math.max(labelBox.left, clipBox.left),
        };
        const style = getComputedStyle(number);
        return numberBox.width > 0 && numberBox.height > 0 && titleBox.width > 0 &&
          style.display !== "none" && style.visibility === "visible" && Number(style.opacity) > 0 &&
          Math.abs(numberBox.y + numberBox.height / 2 - (titleBox.y + titleBox.height / 2)) < 1 &&
          (position === "left"
            ? numberBox.right <= titleBox.left + 0.5
            // A right-hand number sits at the end of the title's lane, not
            // beside a title shorter than the lane. The title's box runs up
            // to the number, so its text is at most level with the number.
            : numberBox.left >= titleBox.right - 0.5 &&
              Math.abs(
                numberBox.right -
                  (number.parentElement.getBoundingClientRect().right -
                    parseFloat(getComputedStyle(number.parentElement).paddingRight)),
              ) < 1);
      }, { threadId: thread.id, title: FEATURED_THREAD, position });
    }

    async function openOptions() {
      await header.hover();
      await header.getByRole("button", { name: "Atlas section actions" }).click();
    }

    // The number is shown or hidden from Organize > Rows, like bb's own row options.
    async function togglePrNumber(keyboard = false) {
      await openOptions();
      const organize = page.getByRole("menuitem", { name: "Organize", exact: true });
      const box = page.getByRole("menuitemcheckbox", { name: "Pull requests", exact: true });
      if (keyboard) {
        await organize.focus();
        await page.keyboard.press("ArrowRight");
        await box.focus();
        await page.keyboard.press("Enter");
      } else {
        await organize.hover();
        await box.click();
      }
      await page.keyboard.press("Escape");
    }

    const setEqualWidthDigits = (value) =>
      fixture.run(["plugin", "config", "thread-stages", "set", "tabularPullRequestDigits", String(value)]);

    async function waitForDigitStyle(variant) {
      await page.waitForFunction(({ threadId, variant }) => {
        const rowNode = document.querySelector(`[data-ribbon-sidebar-root] [data-thread-id="${threadId}"]`);
        const number = [...(rowNode?.querySelectorAll("span") ?? [])].find((node) => node.textContent === "#12345");
        return number && getComputedStyle(number).fontVariantNumeric === variant;
      }, { threadId: thread.id, variant });
    }

    async function digitWidths() {
      return target.getByText("#12345", { exact: true }).evaluate((number) => {
        const walker = document.createTreeWalker(number, NodeFilter.SHOW_TEXT);
        let digits;
        while ((digits = walker.nextNode()) && !digits.textContent.includes("12345")) {}
        if (!digits) throw new Error("PR number text is missing");
        const start = digits.textContent.indexOf("12345");
        return Array.from({ length: 5 }, (_, index) => {
          const range = document.createRange();
          range.setStart(digits, start + index);
          range.setEnd(digits, start + index + 1);
          return range.getBoundingClientRect().width;
        });
      });
    }

    await placement("right");
    await waitForDigitStyle("tabular-nums");
    let widths = await digitWidths();
    assert.ok(Math.max(...widths) - Math.min(...widths) < 0.1, `PR digits should default to equal widths: ${widths.join(", ")}`);
    setEqualWidthDigits(false);
    await waitForDigitStyle("normal");
    widths = await digitWidths();
    assert.ok(Math.max(...widths) - Math.min(...widths) > 1, `PR digits should regain proportional widths: ${widths.join(", ")}`);
    await page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 });
    await list.waitFor({ timeout: 120_000 });
    await placement("right");
    await waitForDigitStyle("normal");
    setEqualWidthDigits(true);
    await waitForDigitStyle("tabular-nums");
    widths = await digitWidths();
    assert.ok(Math.max(...widths) - Math.min(...widths) < 0.1, `PR digits should return to equal widths: ${widths.join(", ")}`);
    // A right-aligned number keeps the indicator lane free at rest, so it
    // lines up with rows that draw an indicator and does not move on hover.
    await page.mouse.move(1000, 700);
    const laneRow = row(list, laneThread.id);
    await laneRow.getByText("#12345", { exact: true }).waitFor();
    const rightEdges = await page.evaluate((threadId) => {
      const rows = [...document.querySelectorAll("[data-ribbon-sidebar-root] [data-thread-id]")];
      const edge = (rowNode) => [...rowNode.querySelectorAll("span")]
        .find((node) => node.textContent === "#12345")?.getBoundingClientRect().right;
      const withIndicator = rows.find((rowNode) =>
        rowNode.querySelector("[data-sidebar-thread-trailing-indicator]") && edge(rowNode) !== undefined);
      const lane = rows.find((rowNode) => rowNode.dataset.threadId === threadId);
      return {
        indicatorless: lane.querySelector("[data-sidebar-thread-trailing-indicator]") ? null : edge(lane),
        withIndicator: withIndicator && edge(withIndicator),
      };
    }, laneThread.id);
    assert.equal(rightEdges.indicatorless !== null && rightEdges.withIndicator !== undefined, true,
      "fixture has a right-aligned number both with and without an indicator");
    assert.equal(rightEdges.indicatorless, rightEdges.withIndicator, "right-aligned numbers share one edge whether or not the row has an indicator");
    await laneRow.hover();
    const hoveredEdge = await laneRow.evaluate((node) => [...node.querySelectorAll("span")]
      .find((span) => span.textContent === "#12345").getBoundingClientRect().right);
    assert.equal(hoveredEdge, rightEdges.indicatorless, "hovering does not move the number");
    await togglePrNumber(true);
    await placement("hidden");
    await page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 });
    await list.waitFor({ timeout: 120_000 });
    await placement("hidden");
    const hiddenLabel = await target.getByRole("link").first().getAttribute("aria-label");
    assert.ok(hiddenLabel.startsWith(`Open ${FEATURED_THREAD}`));
    assert.doesNotMatch(hiddenLabel, /PR #12345/);
    await togglePrNumber();
    await placement("right");
    await page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 });
    await list.waitFor({ timeout: 120_000 });
    await placement("right");
    await context.close();
  } finally {
    try {
      await browser.close();
    } finally {
      fixture.run(["thread", "delete", laneThread.id, "--yes"]);
    }
  }
}
