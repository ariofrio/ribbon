import assert from "node:assert/strict";
import { applyPluginState, FEATURED_PROJECT, FEATURED_THREAD, SECTION } from "../../screenshots/fixture.mjs";
import { heading, launch, link, openContext, row, section, sidebar, sidebarRoot, STAGES } from "./sidebar.mjs";

// A working thread shows its turn on the stage ring, not in the trailing lane.
// Reporting a background command gives it a trailing indicator to lay out.
export async function reportBackgroundCommand(page, threadId) {
  function update(value) {
    if (!value || typeof value !== "object") return;
    if (value.id === threadId && value.activity) {
      value.activity.activeBackgroundCommandCount = 1;
    }
    for (const child of Object.values(value)) update(child);
  }
  await page.route(/\/api\/v1\/(sidebar-bootstrap|threads(?:\/[^/?]+)?)(\?|$)/, async (route) => {
    const response = await route.fetch({ maxRetries: route.request().method() === "GET" ? 2 : 0 });
    if (!response.headers()["content-type"]?.includes("application/json")) {
      await route.fulfill({ response });
      return;
    }
    const body = await response.json();
    update(body);
    await route.fulfill({ response, json: body });
  });
}

export async function verifyThreadIcons({ stack, fixture }) {
  const thread = fixture.threads.get(FEATURED_THREAD);
  // Earlier filing and placement cases can move this shared thread out of Active.
  fixture.run(["thread-stages", "place", thread.id, "--to", `${STAGES}/Active`]);
  await applyPluginState({ stack, ...fixture });
  const browser = await launch();
  try {
    const context = await openContext(browser, { viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    const workingThread = fixture.threads.get("Investigate webhook retries");
    await reportBackgroundCommand(page, workingThread.id);
    const project = fixture.projects.get(FEATURED_PROJECT);
    await page.goto(new URL(`/projects/${project.id}/threads/${thread.id}`, stack.serverUrl).href);
    const list = sidebar(page);
    await list.waitFor({ timeout: 120_000 });
    const target = row(list, thread.id);
    await page.waitForFunction(({ threadId, title }) => {
      const rowNode = document.querySelector(`[data-ribbon-sidebar-root] [data-thread-id="${threadId}"]`);
      const icon = rowNode?.querySelector("[data-ribbon-sidebar-icon-slot] svg");
      const titleNode = [...(rowNode?.querySelectorAll("span") ?? [])]
        .find((node) => node.childElementCount === 0 && node.textContent === title);
      if (!icon || !titleNode) return false;
      const iconBox = icon.getBoundingClientRect();
      const titleBox = titleNode.getBoundingClientRect();
      return Math.abs(iconBox.top + iconBox.height / 2 - (titleBox.top + titleBox.height / 2)) <= 0.5;
    }, { threadId: thread.id, title: thread.title }, { timeout: 30_000 });

    async function paintedIcon(selector, mask) {
      await page.waitForFunction(({ threadId, selector, mask }) => {
        const rowNode = document.querySelector(`[data-ribbon-sidebar-root] [data-thread-id="${threadId}"]`);
        const icon = rowNode?.querySelector(selector);
        if (!icon) return false;
        const style = getComputedStyle(icon);
        const bounds = icon.getBoundingClientRect();
        return style.display !== "none" && bounds.width === 16 && bounds.height === 16 && (!mask || style.maskImage !== "none");
      }, { threadId: thread.id, selector, mask });
    }

    await paintedIcon('[aria-label="Active stage"] svg', false);
    await page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 });
    await list.waitFor({ timeout: 120_000 });
    await paintedIcon('[aria-label="Active stage"] svg', false);
    const workingRow = row(list, workingThread.id);
    // Its turn never ends, so its stage ring turns in place of bb's spinner,
    // carried by the box around it so the compositor can turn it.
    const ring = await workingRow.locator('[aria-label$=" stage, working"] svg').first().evaluate((node) => ({
      animation: getComputedStyle(node.parentElement).animationName,
      width: getComputedStyle(node).width,
    }));
    assert.deepEqual(ring, { animation: "spin", width: "16px" });
    await workingRow.locator("[data-sidebar-thread-trailing-indicator]").getByLabel("Background command running").waitFor();

    const iconOpacity = (scope) =>
      scope.locator("[data-ribbon-sidebar-icon-slot]").evaluate((node) => getComputedStyle(node).opacity);
    await page.mouse.move(1200, 780);
    assert.equal(await iconOpacity(target), "1", "The selected Active thread keeps its stage icon");
    assert.equal(await iconOpacity(workingRow), "1", "A working thread keeps its stage icon");

    const home = await context.newPage();
    try {
      await home.goto(stack.serverUrl);
      const homeList = sidebar(home);
      await homeList.waitFor({ timeout: 120_000 });
      const idleRow = row(homeList, thread.id);
      await idleRow.locator('[aria-label="Active stage"]').waitFor();
      await home.mouse.move(1200, 780);
      assert.equal(await iconOpacity(idleRow), "0", "An unselected Active icon is hidden at rest");
      const titleLeft = await idleRow.getByText(thread.title, { exact: true }).evaluate((node) => node.getBoundingClientRect().left);
      await idleRow.hover();
      assert.equal(await iconOpacity(idleRow), "1", "Hover reveals the Active icon");
      assert.equal(await idleRow.getByText(thread.title, { exact: true }).evaluate((node) => node.getBoundingClientRect().left),
        titleLeft, "Hover does not shift the title");
      await home.mouse.move(1200, 780);
      assert.equal(await iconOpacity(idleRow), "0", "Leaving the row hides the Active icon again");

      const target = link(idleRow, thread.id);
      let focused = false;
      for (let index = 0; index < 100; index += 1) {
        await home.keyboard.press("Tab");
        focused = await target.evaluate((node) => document.activeElement === node);
        if (focused) break;
      }
      assert.ok(focused, "Keyboard navigation reaches the Active thread");
      assert.equal(await iconOpacity(idleRow), "1", "Keyboard focus reveals the Active icon");
    } finally {
      await home.close();
    }

    // A section with a picked color fills its heading with that color's hue,
    // at the lightness and chroma headings share in the current mode, and
    // turns the heading's text and icon to the color paired with it.
    const atlas = heading(section(page, fixture.section.id));
    const painted = await atlas.evaluate(async (node) => {
      // The heading eases between colors; read it once it has settled.
      await Promise.all(node.getAnimations({ subtree: true }).map((animation) => animation.finished));
      const style = getComputedStyle(node);
      const label = [...node.querySelectorAll("span")].find((span) => span.childElementCount === 0 && span.textContent === "Atlas");
      return {
        scheme: getComputedStyle(document.documentElement).colorScheme,
        background: style.backgroundColor,
        label: getComputedStyle(label).color,
        icon: getComputedStyle(node.querySelector("svg[data-icon]")).color,
      };
    });
    const oklch = (value) => {
      const match = /^oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)$/.exec(value);
      assert.ok(match, `Expected an oklch() color, got ${value}`);
      return match.slice(1).map(Number);
    };
    const dark = painted.scheme.includes("dark");
    const [, , labelHue] = oklch(painted.label);
    for (const [part, value, expected] of [
      ["fill", painted.background, dark ? [0.28, 0.035] : [0.95, 0.025]],
      ["label", painted.label, dark ? [0.82, 0.11] : [0.47, 0.13]],
      ["icon", painted.icon, dark ? [0.82, 0.11] : [0.47, 0.13]],
    ]) {
      const [lightness, chroma, hue] = oklch(value);
      assert.deepEqual([lightness, chroma], expected, `The Atlas heading's ${part} should use the ${painted.scheme} heading tone`);
      assert.ok(Math.abs(hue - labelHue) < 0.5, `The Atlas heading's ${part} should keep its color's hue (${hue} vs ${labelHue})`);
    }

    // A heading whose owner chose no icon carries a standard one that opens
    // and shuts with its group, in the heading's own ink. Threads has nothing
    // to choose, so it always carries its two messages.
    {
      const plain = sidebarRoot(page).locator('[data-sidebar="group-label"]').filter({
        has: page.getByRole("button", { name: /^(Collapse|Expand) Threads section$/ }),
      });
      const standard = (name) => plain.locator(`svg[data-icon="${name}"]`);
      await standard("MessagesOpen").waitFor();
      const glyph = await standard("MessagesOpen").evaluate((svg) => {
        const box = svg.getBoundingClientRect();
        const label = [...svg.closest('[data-sidebar="group-label"]').querySelectorAll("span")]
          .find((span) => span.childElementCount === 0 && span.textContent === "Threads");
        return { width: box.width, height: box.height, color: getComputedStyle(svg).color, ink: getComputedStyle(label).color };
      });
      assert.deepEqual(
        { width: glyph.width, height: glyph.height, color: glyph.color },
        { width: 16, height: 16, color: glyph.ink },
        "A standard heading icon should be a 16px glyph in the heading's ink",
      );
      // Where the second message's outline lies past the first one's.
      const past = (name) => standard(name).evaluate((svg) => {
        const [front, back] = [...svg.querySelectorAll("path:not(mask path)")].map((path) => path.getBoundingClientRect());
        return { right: back.right - front.right, bottom: back.bottom - front.bottom };
      });
      const open = await past("MessagesOpen");
      assert.ok(open.right > 1 && open.bottom > 1.5,
        `Open, the second message should be out to the bottom right of the first: ${JSON.stringify(open)}`);
      // The messages shut as their group folds, frame by frame, from open.
      const shutting = plain.evaluate((group) => new Promise((resolve) => {
        const frames = [];
        const start = performance.now();
        requestAnimationFrame(function sample() {
          const svg = group.querySelector('svg[data-icon="MessagesClosed"]');
          if (svg) frames.push(svg.getAttribute("data-ribbon-icon-opening"));
          if (frames.at(-1) === null || performance.now() - start > 2000) resolve(frames);
          else requestAnimationFrame(sample);
        });
      }));
      await plain.hover();
      await plain.getByRole("button", { name: "Collapse Threads section", exact: true }).click();
      const frames = await shutting;
      const drawn = frames.slice(0, -1).map(Number);
      assert.equal(frames.at(-1), null, `The shut messages should come to rest: ${JSON.stringify(frames)}`);
      assert.ok(
        drawn.length >= 3 && drawn.some((open) => open > 0.2 && open < 0.8) && drawn.every((open, index) => index === 0 || open <= drawn[index - 1]),
        `The messages should shut through frames between open and shut: ${JSON.stringify(frames)}`,
      );
      // Shut, the second message is tucked behind the first.
      const shut = await past("MessagesClosed");
      assert.ok(shut.right <= 0.5 && shut.bottom <= 0.5,
        `Shut, the second message should be behind the first: ${JSON.stringify(shut)}`);
      await plain.hover();
      await plain.getByRole("button", { name: "Expand Threads section", exact: true }).click();
      await standard("MessagesOpen").waitFor();
      // Atlas chose its own, which it keeps.
      await atlas.locator(`svg[data-icon="${SECTION.icon}"]`).waitFor();
    }

    let prState = "open";
    await page.route("**/api/v1/environments/*/pull-request", (route) => route.fulfill({
      json: {
        outcome: "available",
        pullRequest: prState === null ? null : {
          number: 123, title: "Sidebar pull request", state: prState,
          url: "https://github.com/example/project/pull/123",
          baseRefName: "main", headRefName: "feature", updatedAt: "2026-09-18T00:00:00Z",
          autoMerge: false, inMergeQueue: false,
          checks: { state: "no_checks", totalCount: 0, passedCount: 0, failedCount: 0, pendingCount: 0 },
          review: { state: "none", reviewRequestCount: 0 },
          mergeability: { state: "mergeable", mergeStateStatus: null, mergeable: null },
          attention: "none",
        },
      },
    }));
    for (const state of ["open", "draft", "merged", "closed"]) {
      prState = state;
      await page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 });
      await list.waitFor({ timeout: 120_000 });
      await target.getByText("#123", { exact: true }).waitFor();
      await page.waitForFunction(({ threadId, state }) => {
        const rowNode = document.querySelector(`[data-ribbon-sidebar-root] [data-thread-id="${threadId}"]`);
        const badge = rowNode?.querySelector('[title="Sidebar pull request"]');
        const icon = badge?.querySelector("svg");
        const statusTitle = `${state[0].toUpperCase()}${state.slice(1)} Pull Request`;
        const reference = [...document.querySelectorAll(`[title="${statusTitle}"] svg`)]
          .find((svg) => !svg.closest("[data-ribbon-sidebar-root]"));
        if (!icon || !reference) return false;
        const range = document.createRange();
        range.setStartAfter(icon);
        range.setEnd(badge, badge.childNodes.length);
        const iconBounds = icon.getBoundingClientRect();
        const numberBounds = range.getBoundingClientRect();
        return iconBounds.width === 16 && iconBounds.height === 16 &&
          iconBounds.right <= numberBounds.left && numberBounds.left - iconBounds.right <= 5 &&
          Math.abs(iconBounds.y + 8 - (numberBounds.y + numberBounds.height / 2)) <= 2 &&
          getComputedStyle(icon).color === getComputedStyle(reference).color &&
          icon.innerHTML === reference.innerHTML;
      }, { threadId: thread.id, state }, { timeout: 15_000 });
    }
    prState = null;
    await page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 });
    await list.waitFor({ timeout: 120_000 });
    assert.equal(await target.getByText("#123", { exact: true }).count(), 0);
    await context.close();
  } finally {
    await browser.close();
  }
}
