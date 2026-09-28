import assert from "node:assert/strict";
import { chromium } from "playwright";
import { applyPluginState, FEATURED_PROJECT, FEATURED_THREAD } from "../../screenshots/fixture.mjs";
import { reportBackgroundCommand } from "./background-command.mjs";

export async function verifyThreadIcons({ stack, fixture }) {
  const thread = fixture.threads.get(FEATURED_THREAD);
  // Earlier filing and placement cases can move this shared thread out of Idle.
  fixture.run(["sidebar", "place", thread.id, "--to", "plugin:thread-stages:stages/Idle"]);
  await applyPluginState({ stack, ...fixture });
  fixture.run([
    "plugin",
    "config",
    "ribbon-sidebar",
    "set",
    "showMessagePreviews",
    "false",
  ]);
  const browser = await chromium.launch({ args: ["--mute-audio"] });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await context.addInitScript(() => {
      localStorage.setItem("bb.sidebar.threadListProvider", JSON.stringify("ribbon-sidebar/ribbon-sidebar"));
    });
    const page = await context.newPage();
    const workingThread = fixture.threads.get("Investigate webhook retries");
    await reportBackgroundCommand(page, workingThread.id);
    const project = fixture.projects.get(FEATURED_PROJECT);
    await page.goto(new URL(`/projects/${project.id}/threads/${thread.id}`, stack.serverUrl).href);
    const sidebar = page.locator("[data-ribbon-sidebar-root][data-ribbon-sidebar-ready]");
    await sidebar.waitFor({ timeout: 120_000 });
    const row = sidebar.locator("li").filter({ has: page.locator(`a[data-sidebar-thread-id="${thread.id}"]`) });
    await page.waitForFunction(({ threadId, title }) => {
      const rowNode = document.querySelector(`[data-ribbon-sidebar-root] li[data-thread-id="${threadId}"]`);
      const icon = rowNode?.querySelector("[data-ribbon-sidebar-icon-slot] > *");
      const titleNode = rowNode?.querySelector(`[title="${CSS.escape(title)}"] > span`);
      if (!(icon instanceof HTMLElement) || !(titleNode instanceof HTMLElement)) return false;
      return Math.abs(titleNode.getBoundingClientRect().left - icon.getBoundingClientRect().right - 8) <= 0.5;
    }, { threadId: thread.id, title: thread.title }, { timeout: 30_000 });

    const alignment = await row.evaluate((rowNode, title) => {
      const icon = rowNode.querySelector("[data-ribbon-sidebar-icon-slot] > *");
      const titleNode = rowNode.querySelector(`[title="${CSS.escape(title)}"] > span`);
      if (!(icon instanceof HTMLElement) || !(titleNode instanceof HTMLElement)) {
        throw new Error("Could not find the thread icon and title");
      }
      const iconBox = icon.getBoundingClientRect();
      const titleBox = titleNode.getBoundingClientRect();
      return {
        centerDelta:
          iconBox.top + iconBox.height / 2 -
          (titleBox.top + titleBox.height / 2),
        horizontalGap: titleBox.left - iconBox.right,
      };
    }, thread.title);
    assert.ok(
      Math.abs(alignment.centerDelta) <= 0.5,
      `Without previews, the thread icon/title centers differed by ${alignment.centerDelta}px`,
    );
    assert.ok(
      Math.abs(alignment.horizontalGap - 8) <= 0.5,
      `Without previews, the thread icon/title gap was ${alignment.horizontalGap}px instead of 8px`,
    );

    async function paintedIcon(selector, mask) {
      await page.waitForFunction(({ threadId, selector, mask }) => {
        const row = document.querySelector(`[data-ribbon-sidebar-root] a[data-sidebar-thread-id="${threadId}"]`)?.closest("li");
        const icon = row?.querySelector(selector);
        if (!icon) return false;
        const style = getComputedStyle(icon);
        const bounds = icon.getBoundingClientRect();
        return style.display !== "none" && bounds.width === 16 && bounds.height === 16 &&
          (!mask || style.maskImage !== "none");
      }, { threadId: thread.id, selector, mask });
    }

    await paintedIcon('[aria-label="Idle stage"] svg', false);
    await page.reload();
    await sidebar.waitFor({ timeout: 120_000 });
    await paintedIcon('[aria-label="Idle stage"] svg', false);
    const workingRow = sidebar.locator("li").filter({
      has: page.locator(`a[data-sidebar-thread-id="${workingThread.id}"]`),
    });
    // Its turn never ends, so its stage ring turns in place of bb's spinner,
    // carried by the box around it so the compositor can turn it.
    const ring = await workingRow.locator('[aria-label$=" stage, working"] svg').first().evaluate((node) => ({
      animation: getComputedStyle(node.parentElement).animationName,
      width: getComputedStyle(node).width,
    }));
    assert.deepEqual(ring, { animation: "spin", width: "16px" });
    await workingRow.locator("[data-sidebar-thread-trailing-indicator]").getByLabel("Background command running").waitFor();
    const indicatorGap = await workingRow.evaluate((node) => {
      const space = node.querySelector("[data-ribbon-sidebar-icon-indicator-space]");
      const title = space.previousElementSibling;
      return space.getBoundingClientRect().left - title.getBoundingClientRect().right;
    });
    assert.ok(
      Math.abs(indicatorGap - 4) < 0.5,
      `With stage icons, the title-to-indicator gap was ${indicatorGap}px instead of 4px`,
    );
    const view = await page.evaluate(() => JSON.parse(localStorage.getItem("bb.plugin.ribbon-sidebar.preferences.v1")).view);
    assert.equal(view.iconGroupingKey, "plugin:thread-stages:stages");
    assert.equal(view.groupingKey, "builtin:sections");
    assert.equal(view.filterGroupingKey, null);

    const iconOpacity = (target) =>
      target.locator("[data-ribbon-sidebar-icon-slot]").evaluate((node) =>
        getComputedStyle(node).opacity);
    await page.mouse.move(1200, 780);
    assert.equal(await iconOpacity(row), "1", "The selected Idle thread keeps its stage icon");
    assert.equal(await iconOpacity(workingRow), "1", "A working thread keeps its stage icon");

    const home = await context.newPage();
    try {
      await home.goto(stack.serverUrl);
      const homeSidebar = home.locator("[data-ribbon-sidebar-root][data-ribbon-sidebar-ready]");
      await homeSidebar.waitFor({ timeout: 120_000 });
      const idleRow = homeSidebar.locator(`li[data-thread-id="${thread.id}"]`);
      await idleRow.locator('[aria-label="Idle stage"]').waitFor();
      await home.mouse.move(1200, 780);
      assert.equal(await iconOpacity(idleRow), "0", "An unselected Idle icon is hidden at rest");
      const titleLeft = await idleRow.getByText(thread.title, { exact: true }).evaluate((node) =>
        node.getBoundingClientRect().left);
      await idleRow.hover();
      assert.equal(await iconOpacity(idleRow), "1", "Hover reveals the Idle icon");
      assert.equal(await idleRow.getByText(thread.title, { exact: true }).evaluate((node) =>
        node.getBoundingClientRect().left), titleLeft, "Hover does not shift the title");
      await home.mouse.move(1200, 780);
      assert.equal(await iconOpacity(idleRow), "0", "Leaving the row hides the Idle icon again");

      const link = idleRow.locator(`a[data-sidebar-thread-id="${thread.id}"]`);
      let focused = false;
      for (let index = 0; index < 100; index += 1) {
        await home.keyboard.press("Tab");
        focused = await link.evaluate((node) => document.activeElement === node);
        if (focused) break;
      }
      assert.ok(focused, "Keyboard navigation reaches the Idle thread");
      assert.equal(await iconOpacity(idleRow), "1", "Keyboard focus reveals the Idle icon");
    } finally {
      await home.close();
    }

    // A section with a picked color fills its heading with that color's hue,
    // at the lightness and chroma headings share in the current mode, and
    // turns the heading's text and icon to the color the Icons plugin pairs
    // with it.
    const atlas = sidebar.locator('[data-sidebar="group-label"]').filter({
      has: page.getByRole("button", { name: /^(Collapse|Expand) Atlas section$/ }),
    });
    const painted = await atlas.evaluate(async (node) => {
      // The heading eases between colors; read it once it has settled.
      await Promise.all(node.getAnimations({ subtree: true }).map((animation) => animation.finished));
      const resolve = (value) => {
        const probe = document.createElement("span");
        probe.style.color = value;
        node.append(probe);
        const color = getComputedStyle(probe).color;
        probe.remove();
        return color;
      };
      const style = getComputedStyle(node);
      return {
        scheme: getComputedStyle(document.documentElement).colorScheme,
        background: style.backgroundColor,
        palette: resolve(style.getPropertyValue("--ribbon-icons-section-color-light")),
        label: getComputedStyle(node.querySelector('span[title="Atlas"]')).color,
        icon: getComputedStyle(node.querySelector("[data-ribbon-sidebar-icon]")).backgroundColor,
      };
    });
    const oklch = (value) => {
      const match = /^oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)$/.exec(value);
      assert.ok(match, `Expected an oklch() color, got ${value}`);
      return match.slice(1).map(Number);
    };
    const dark = painted.scheme.includes("dark");
    const [, , paletteHue] = oklch(painted.palette);
    for (const [part, value, expected] of [
      ["fill", painted.background, dark ? [0.28, 0.035] : [0.95, 0.025]],
      ["label", painted.label, dark ? [0.82, 0.11] : [0.47, 0.13]],
      ["icon", painted.icon, dark ? [0.82, 0.11] : [0.47, 0.13]],
    ]) {
      const [lightness, chroma, hue] = oklch(value);
      assert.deepEqual([lightness, chroma], expected, `The Atlas heading's ${part} should use the ${painted.scheme} heading tone`);
      assert.ok(Math.abs(hue - paletteHue) < 0.5, `The Atlas heading's ${part} should keep its color's hue (${hue} vs ${paletteHue})`);
    }

    const headingButtons = [
      atlas.getByRole("button", { name: "New thread in Atlas" }),
      atlas.getByRole("button", { name: "Atlas options" }),
    ];
    for (const scheme of ["light", "dark"]) {
      await page.evaluate((value) => {
        document.documentElement.style.colorScheme = value;
      }, scheme);
      await atlas.hover();
      const labelColor = await atlas.locator('span[title="Atlas"]').evaluate((node) =>
        getComputedStyle(node).color);
      const [labelLightness, , labelHue] = oklch(labelColor);
      for (const button of headingButtons) {
        await button.hover();
        const hover = await button.evaluate((node) => {
          for (const animation of node.getAnimations()) animation.finish();
          const style = getComputedStyle(node);
          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d");
          context.fillStyle = style.backgroundColor;
          context.fillRect(0, 0, 1, 1);
          const fill = [...context.getImageData(0, 0, 1, 1).data];
          context.clearRect(0, 0, 1, 1);
          context.fillStyle = style.color;
          context.fillRect(0, 0, 1, 1);
          return {
            color: style.color,
            fill,
            ink: [...context.getImageData(0, 0, 1, 1).data],
          };
        });
        const [lightness, , hue] = oklch(hover.color);
        assert.ok(scheme === "light" ? lightness < labelLightness : lightness > labelLightness,
          `${scheme} heading button ink should move away from the heading fill`);
        assert.ok(Math.abs(hue - labelHue) < 0.5,
          `${scheme} heading button ink should keep the section hue`);
        assert.ok(hover.fill.slice(0, 3).every((channel, index) =>
          Math.abs(channel - hover.ink[index]) <= 3),
        `${scheme} heading button fill should use its hover ink's hue: ${JSON.stringify(hover)}`);
        assert.equal(hover.fill[3], 38,
          `${scheme} heading button hover should use a 15% ink tint`);
      }
    }
    await page.evaluate(() => {
      document.documentElement.style.removeProperty("color-scheme");
    });

    // A heading is laid out like a thread row: the same height, padding, and
    // icon and label positions, 4px above its first row.
    const layout = await atlas.evaluate((node) => {
      const group = node.closest("[data-sidebar-sticky-group]");
      const row = group.querySelector("ul > li .group\\/thread-row");
      const box = (element) => element.getBoundingClientRect();
      const label = (element) => [...element.querySelectorAll("span")]
        .find((span) => span.childElementCount === 0 && span.textContent.trim().length > 0 && !span.closest("[data-ribbon-sidebar-icon-slot]"));
      return {
        heading: {
          height: box(node).height,
          padding: getComputedStyle(node).paddingLeft,
          radius: getComputedStyle(node).borderRadius,
          icon: box(node.querySelector("[data-ribbon-sidebar-icon]")).left - box(node).left,
          label: box(label(node)).left - box(node).left,
        },
        row: {
          height: box(row).height,
          padding: getComputedStyle(row).paddingLeft,
          radius: getComputedStyle(row).borderRadius,
          icon: box(row.querySelector("[data-ribbon-sidebar-icon-slot] > *")).left - box(row).left,
          label: box(label(row.querySelector("[title]"))).left - box(row).left,
        },
        headingGap: box(row).top - box(node).bottom,
        rowGap: (() => {
          const [first, second] = group.querySelectorAll("ul > li .group\\/thread-row");
          return second ? box(second).top - box(first).bottom : null;
        })(),
      };
    });
    assert.deepEqual(layout.heading, layout.row, "A heading should be laid out like a thread row");
    assert.equal(layout.headingGap, 4, "A heading should sit 4px above its first row");

    // Folding the group that holds the open thread keeps that thread's row in
    // view throughout: the other rows fold away around it, and it ends up
    // where the folded group previews it, right under the heading.
    {
      const collapse = sidebar.getByRole("button", { name: "Collapse Atlas section", exact: true });
      const openRow = sidebar.locator('li:has(a[aria-current="page"])').first();
      await openRow.waitFor();
      const box = await collapse.boundingBox();
      // Click, then watch the open thread's row on every frame of the fold.
      const watchOpenRow = (point) => page.evaluate(async ([x, y]) => {
        const samples = [];
        const group = document.querySelector('[data-ribbon-sidebar-root] a[aria-current="page"]')
          .closest("[data-sidebar-sticky-group]");
        document.elementFromPoint(x, y)
          .dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: x, clientY: y }));
        const start = performance.now();
        while (performance.now() - start < 450) {
          await new Promise((resolve) => requestAnimationFrame(resolve));
          const row = document.querySelector('[data-ribbon-sidebar-root] li:has(a[aria-current="page"])');
          let opacity = 1;
          for (let node = row; node && node !== document.body; node = node.parentElement) {
            opacity *= Number(getComputedStyle(node).opacity);
          }
          samples.push(row ? {
            height: row.getBoundingClientRect().height,
            opacity,
            group: group.getBoundingClientRect().height,
            folding: group.querySelector("[data-ribbon-group-body]") !== null,
          } : null);
        }
        return samples;
      }, point);
      // The group ends the fold as tall as the folded group, so nothing below
      // it jumps when the folded rows leave.
      const settles = (frames) => {
        const lastFolding = frames.filter((frame) => frame?.folding).at(-1);
        const firstFolded = frames.find((frame) => frame && !frame.folding);
        return !lastFolding || !firstFolded || Math.abs(lastFolding.group - firstFolded.group) < 0.5;
      };
      const stays = (frames) => frames.every((frame) => frame !== null && frame.height >= 27 && frame.opacity > 0.99);
      const point = [box.x + 40, box.y + box.height / 2];
      const folding = await watchOpenRow(point);
      assert.ok(stays(folding), `The open thread's row should stay in view while its group folds: ${JSON.stringify(folding)}`);
      assert.ok(settles(folding), `The group should not jump when its folded rows leave: ${JSON.stringify(folding)}`);
      const [headingBox, rowBox] = [
        await sidebar.getByRole("button", { name: "Expand Atlas section", exact: true }).boundingBox(),
        await openRow.boundingBox(),
      ];
      assert.equal(rowBox.y - (headingBox.y + headingBox.height), 4, "The folded group should preview the open thread right under its heading");
      const unfolding = await watchOpenRow(point);
      assert.ok(stays(unfolding), `The open thread's row should stay in view while its group unfolds: ${JSON.stringify(unfolding)}`);
      await collapse.waitFor();
    }

    // Standardized heading icons: a book for a section, open while the
    // section is, in the heading's own ink.
    {
      fixture.run(["plugin", "config", "ribbon-sidebar", "set", "groupHeaderIcons", "Standardized"]);
      const standard = (name) => atlas.locator(`svg[data-icon="${name}"]`);
      await standard("BookOpen").waitFor();
      const glyph = await standard("BookOpen").evaluate((svg) => {
        const box = svg.getBoundingClientRect();
        const label = svg.closest('[data-sidebar="group-label"]').querySelector('span[title="Atlas"]');
        return { width: box.width, height: box.height, color: getComputedStyle(svg).color, ink: getComputedStyle(label).color };
      });
      assert.deepEqual(
        { width: glyph.width, height: glyph.height, color: glyph.color },
        { width: 16, height: 16, color: glyph.ink },
        "A standardized section icon should be a 16px glyph in the heading's ink",
      );
      // The shut book reads as the open one folded: exactly as tall.
      const drawnHeight = (name) => standard(name).evaluate((svg) => {
        const boxes = [...svg.querySelectorAll("path")].map((path) => path.getBoundingClientRect());
        return Math.max(...boxes.map((box) => box.bottom)) - Math.min(...boxes.map((box) => box.top));
      });
      const openHeight = await drawnHeight("BookOpen");
      await atlas.getByRole("button", { name: "Collapse Atlas section", exact: true }).click();
      await standard("BookClosed").waitFor();
      const shutHeight = await drawnHeight("BookClosed");
      // Both books are as tall as the folders: 18 of 24 units, 12px at 16px.
      assert.ok(Math.abs(openHeight - 12) < 0.25, `The open book should be 12px tall: ${openHeight}`);
      assert.ok(Math.abs(shutHeight - 12) < 0.25, `The shut book should be 12px tall: ${shutHeight}`);
      await atlas.getByRole("button", { name: "Expand Atlas section", exact: true }).click();
      await standard("BookOpen").waitFor();
      fixture.run(["plugin", "config", "ribbon-sidebar", "set", "groupHeaderIcons", "On"]);
      await atlas.locator("[data-ribbon-sidebar-icon]").waitFor();
    }

    // A heading with no color of its own is a gray bar of the same family.
    const unorganized = await sidebar
      .locator('[data-sidebar="group-label"]')
      .filter({ has: page.getByRole("button", { name: /^(Collapse|Expand) Unorganized section$/ }) })
      .evaluate((node) => ({
        background: getComputedStyle(node).backgroundColor,
        label: getComputedStyle(node.querySelector('span[title="Unorganized"]')).color,
      }));
    assert.equal(unorganized.background, dark ? "oklch(0.28 0 0)" : "oklch(0.95 0 0)", "An uncolored heading should be gray");
    assert.equal(unorganized.label, dark ? "oklch(0.82 0 0)" : "oklch(0.47 0 0)", "An uncolored heading's label should be gray ink");

    // Groups keep their spacing, and nothing from the next heading covers the
    // one above it. With no thread open, a collapsed group
    // previews nothing, so its heading sits right above the next one.
    {
      const home = await context.newPage();
      await home.goto(stack.serverUrl);
      const homeSidebar = home.locator("[data-ribbon-sidebar-root][data-ribbon-sidebar-ready]");
      await homeSidebar.waitFor({ timeout: 120_000 });
      const collapse = homeSidebar.getByRole("button", { name: "Collapse Atlas section", exact: true });
      const box = await collapse.boundingBox();
      await home.mouse.click(box.x + 40, box.y + box.height / 2);
      const expand = homeSidebar.getByRole("button", { name: "Expand Atlas section", exact: true });
      await expand.waitFor();
      // Wait for the fold to finish: its rows leave once they are shut.
      await homeSidebar
        .getByRole("region", { name: "Atlas group", exact: true })
        .locator("[data-ribbon-group-body]")
        .waitFor({ state: "detached" });
      // A sticky heading paints a sidebar-colored shield above itself, which
      // lets the pointer through, so measure what it paints, not what it hits.
      const overlap = await expand.evaluate((toggle) => {
        const node = toggle.closest('[data-sidebar="group-label"]');
        const headings = [...document.querySelectorAll('[data-ribbon-sidebar-root] [data-sidebar="group-label"]')];
        const next = headings[headings.indexOf(node) + 1];
        if (!next) return "no heading follows Atlas";
        const shield = parseFloat(getComputedStyle(next, "::before").height) || 0;
        return {
          gap: next.getBoundingClientRect().top - node.getBoundingClientRect().bottom,
          covered: Math.max(0, node.getBoundingClientRect().bottom - (next.getBoundingClientRect().top - shield)),
        };
      });
      assert.deepEqual(overlap, { gap: 16, covered: 0 }, "Collapsed groups should keep their 16px spacing, uncovered");
      await home.mouse.click(box.x + 40, box.y + box.height / 2);
      await collapse.waitFor();
      await home.close();
    }

    let prState = "open";
    await page.route("**/api/v1/environments/*/pull-request", (route) => route.fulfill({
      json: {
        outcome: "available",
        pullRequest: prState === null ? null : {
          number: 123, title: "Sidebar pull request", state: prState,
          url: "https://github.com/example/project/pull/123",
          baseRefName: "main", headRefName: "feature", updatedAt: "2026-09-18T00:00:00Z",
          checks: { state: "no_checks", totalCount: 0, passedCount: 0, failedCount: 0, pendingCount: 0 },
          review: { state: "none", reviewRequestCount: 0 },
          mergeability: { state: "mergeable", mergeStateStatus: null, mergeable: null },
          attention: "none",
        },
      },
    }));
    for (const state of ["open", "draft", "merged", "closed"]) {
      prState = state;
      await page.reload();
      await sidebar.waitFor({ timeout: 120_000 });
      await row.getByText("#123", { exact: true }).waitFor();
      await page.waitForFunction(({ threadId, state }) => {
        const row = document.querySelector(`[data-ribbon-sidebar-root] a[data-sidebar-thread-id="${threadId}"]`)?.closest("li");
        const badge = row?.querySelector('[title="Sidebar pull request"]');
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
    await page.reload();
    await sidebar.waitFor({ timeout: 120_000 });
    assert.equal(await row.getByText("#123", { exact: true }).count(), 0);
    await context.close();
  } finally {
    await browser.close();
  }
}
