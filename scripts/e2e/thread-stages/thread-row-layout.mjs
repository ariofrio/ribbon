import assert from "node:assert/strict";
import { AGENT, FEATURED_PROJECT, FEATURED_THREAD } from "../../screenshots/fixture.mjs";
import { launch, openContext, parentAnswered, row, sidebar, spawnChild, withPreferenceSaved } from "./sidebar.mjs";
import { pullRequest } from "./pr-status.mjs";

export async function verifyThreadRowLayout({ stack, fixture, cases }) {
  const thread = fixture.threads.get(FEATURED_THREAD);
  const project = fixture.projects.get(FEATURED_PROJECT);
  const previous = fixture.runJson(["thread-stages", "prefs", "get", "rowActions"]);
  fixture.run(["thread-stages", "prefs", "set", "rowActions", '["pin","copyLink","archive"]']);
  fixture.run(["thread", "read", thread.id]);
  const browser = await launch();
  try {
    for (const testCase of cases) {
      const child = testCase.endsWith("-parent")
        ? spawnChild(fixture, { parent: thread, project, title: "Row layout child", AGENT })
        : null;
      if (child) {
        await parentAnswered(fixture, thread, child);
        fixture.run(["thread", "read", thread.id]);
      }
      const compact = testCase.startsWith("compact");
      const colorScheme = testCase === "desktop" || testCase === "desktop-parent" ? "dark" : "light";
      const context = await openContext(browser, {
        viewport: compact ? { width: 390, height: 844 } : { width: 1280, height: 800 },
        colorScheme, hasTouch: compact,
      });
      await context.addInitScript((mode) => localStorage.setItem("bb.theme", mode), colorScheme);
      const page = await context.newPage();
      const rpc = (method) => new URL(`/api/v1/plugins/thread-stages/rpc/${method}`, stack.serverUrl).href;
      let showPr = false;
      const pr = pullRequest("merged");
      pr.pullRequest.state = "merged";
      await page.route("**/api/v1/environments/*/pull-request*", (route) => route.fulfill({
        json: showPr ? pr : { outcome: "absent" },
      }));
      const save = async (actions) => {
        const response = await page.request.post(rpc("saveThreadActionsV1"), { data: { threadId: thread.id, actions } });
        assert.equal(response.status(), 200);
      };
      try {
        await save([{ id: "review", label: "Review", prompt: "Review this thread." }]);
        await page.goto(new URL(`/projects/${project.id}/threads/${thread.id}`, stack.serverUrl).href);
        if (compact) await page.getByTestId("app-sidebar-trigger-overlay").getByRole("button").tap();
        const list = sidebar(page);
        await list.waitFor({ timeout: 120_000 });
        const target = row(list, thread.id);
        const action = target.getByRole("button", { name: `Review in ${thread.title}` });
        await action.waitFor();
        await page.mouse.move(1000, 700);
        const metrics = () => target.evaluate((node) => {
          const box = (element) => {
            if (!element) return null;
            const rect = element.getBoundingClientRect();
            return { left: rect.left, right: rect.right, top: rect.top, width: rect.width, height: rect.height };
          };
          const controls = node.querySelector("[data-sidebar-row-controls]");
          const menu = node.querySelector('button[aria-label="Thread actions"]');
          const chevron = node.querySelector('button[aria-label$=" threads"]');
          const chevronStyle = chevron ? getComputedStyle(chevron) : null;
          return {
            row: box(node), title: box(node.querySelector(".bb-thread-title")),
            prompt: box(node.querySelector("[data-ribbon-thread-actions]")),
            controls: box(controls),
            controlsLane: box(controls.parentElement.parentElement),
            chevron: box(chevron),
            chevronSlotWidth: chevron ? chevron.getBoundingClientRect().width + parseFloat(chevronStyle.marginLeft) + parseFloat(chevronStyle.marginRight) : 0,
            menu: { ...box(menu), radius: getComputedStyle(menu).borderRadius },
            buttons: [...controls.querySelectorAll("button")].map((button) => ({
              ...box(button), label: button.getAttribute("aria-label"),
              radius: getComputedStyle(button).borderRadius,
              fill: getComputedStyle(button).backgroundColor,
            })),
            pr: node.querySelector("[data-ribbon-pull-request]") ? box(node.querySelector("[data-ribbon-pull-request]")) : null,
            indicator: node.querySelector("[data-sidebar-thread-trailing-indicator]") !== null,
          };
        });
        const rest = await metrics();
        assert.equal(rest.indicator, false);
        assert.equal(rest.controlsLane.width, 0, "Hidden row controls reserve no title space");
        assert.ok(Math.abs(rest.row.right - rest.prompt.right - 36) < 1,
          "Saved prompts leave the indicator slot clear even on rows without an indicator");
        if (compact) assert.equal(rest.controls.width, 0, "Hidden desktop controls take no touch-layout space");
        const verifyParentToggle = async (persistentItem) => {
          const collapse = target.getByRole("button", { name: `Collapse ${thread.title} threads`, exact: true });
          if (!(await collapse.count())) return;
          const resting = await metrics();
          if (!compact) await target.hover();
          await withPreferenceSaved(page, "collapsedThreads", () => compact ? collapse.tap() : collapse.click());
          const expand = target.getByRole("button", { name: `Expand ${thread.title} threads`, exact: true });
          await expand.waitFor();
          await page.mouse.move(1000, 700);
          const collapsed = await metrics();
          assert.equal(collapsed[persistentItem].right, resting[persistentItem].right,
            "Collapsing children keeps persistent row items stationary");
          assert.ok(collapsed.chevron.right <= collapsed.prompt.left,
            "The child toggle precedes saved prompts and PR information");
          if (!compact) {
            await target.hover();
            const hovered = await metrics();
            assert.equal(hovered[persistentItem].right, resting[persistentItem].right,
              "Collapsed parent items stay stationary when controls appear");
            assert.ok(hovered.chevron.right <= hovered.controls.left,
              "The child toggle's hit area stays separate from the row controls");
          }
          await withPreferenceSaved(page, "collapsedThreads", () => compact ? expand.tap() : expand.click());
          await collapse.waitFor();
          await page.mouse.move(1000, 700);
        };
        await verifyParentToggle("prompt");
        if (!compact) {
          await target.hover();
          const hover = await metrics();
          assert.ok(hover.controls.right <= hover.prompt.left,
            "Global row controls precede the per-thread prompt buttons");
          assert.ok(hover.title.right <= hover.controls.left + 4,
            "The title yields space to visible row controls");
          assert.equal(hover.prompt.right, rest.prompt.right,
            "Saved prompt buttons keep their position when row controls appear");
          const menu = hover.menu;
          assert.ok(Math.abs(hover.row.right - menu.right - 4) < 1,
            "The ellipsis stays in the trailing indicator slot");
          assert.ok(hover.buttons.every((button) => button.width === menu.width && button.height === menu.height && button.radius === menu.radius),
            "Every row control shares the ellipsis button's dimensions and rounding");
          assert.equal(menu.width, 20);
          const pin = target.getByRole("button", { name: "Pin", exact: true });
          await pin.hover();
          assert.equal(await pin.evaluate((node) => {
            const box = node.getBoundingClientRect();
            return document.elementFromPoint(box.left - 3, box.top + box.height / 2)?.closest("button") === node;
          }), true, "Compact control backgrounds retain the full 28px click target");
          await pin.evaluate(async (node) => { await Promise.all(node.getAnimations().map((animation) => animation.finished)); });
          const pinStyle = await pin.evaluate((node) => ({ fill: getComputedStyle(node).backgroundColor, color: getComputedStyle(node).color }));
          const more = target.getByRole("button", { name: "Thread actions", exact: true });
          await more.hover();
          await more.evaluate(async (node) => { await Promise.all(node.getAnimations().map((animation) => animation.finished)); });
          assert.deepEqual(await more.evaluate((node) => ({ fill: getComputedStyle(node).backgroundColor, color: getComputedStyle(node).color })), pinStyle,
            "Row controls share the ellipsis hover treatment");
          const pinBox = await pin.boundingBox();
          await page.mouse.click(pinBox.x - 3, pinBox.y + pinBox.height / 2);
          const unpin = target.getByRole("button", { name: "Unpin", exact: true });
          await unpin.waitFor();
          await target.hover();
          await unpin.click();
          await pin.waitFor();
          await action.focus();
          await page.keyboard.press("Shift+Tab");
          assert.equal(await target.getByRole("button", { name: "Archive thread", exact: true }).evaluate((node) => document.activeElement === node), true,
            "Keyboard order follows the row controls then saved prompts");
          await page.keyboard.press("Tab");
          await page.keyboard.press("Tab");
          assert.equal(await more.evaluate((node) => document.activeElement === node), true,
            "The trailing ellipsis follows saved prompts in keyboard order");
          await page.keyboard.press("Enter");
          await page.getByRole("menuitem", { name: "Edit thread actions", exact: true }).waitFor();
          await page.getByRole("menuitem", { name: "Customize row actions", exact: true }).waitFor();
          await page.keyboard.press("Escape");
          await more.evaluate((node) => node.blur());
          await page.mouse.move(1000, 700);
        }
        showPr = true;
        await page.reload();
        if (compact) await page.getByTestId("app-sidebar-trigger-overlay").getByRole("button").tap();
        await list.waitFor({ timeout: 120_000 });
        await target.getByText("#12345", { exact: true }).waitFor();
        const withPr = await metrics();
        assert.ok(withPr.prompt.right <= withPr.pr.left, "Prompt buttons precede the PR number");
        await verifyParentToggle("pr");
        if (!compact) {
          await target.hover();
          const hoveredPr = await metrics();
          assert.ok(hoveredPr.controls.right <= hoveredPr.prompt.left, "Row controls stay before both prompts and PR information");
          assert.equal(hoveredPr.pr.right, withPr.pr.right, "The PR number remains stationary on hover");
        }
        const sent = [];
        await page.route(`**/rpc/runThreadActionV1`, (route) => {
          sent.push(route.request().postDataJSON());
          return route.fulfill({ json: { ok: true, result: { ok: true } } });
        });
        await Promise.all([
          page.waitForResponse((candidate) => candidate.url() === rpc("runThreadActionV1")),
          compact ? action.tap() : action.click(),
        ]);
        assert.deepEqual(sent, [{ threadId: thread.id, actionId: "review" }]);
        showPr = false;
        await save([]);
        await page.reload();
        if (compact) await page.getByTestId("app-sidebar-trigger-overlay").getByRole("button").tap();
        await list.waitFor({ timeout: 120_000 });
        await page.mouse.move(1000, 700);
        const quiet = await metrics();
        assert.equal(quiet.indicator, false);
        assert.ok(Math.abs(quiet.row.right - quiet.title.right - 8 - quiet.chevronSlotWidth) < 1,
          "With no PR, prompt, or indicator, the title uses all space up to any visible child toggle");
        if (!compact) {
          await target.hover();
          const hoveredQuiet = await metrics();
          assert.ok(hoveredQuiet.title.right < quiet.title.right - 100,
            "Configured row controls take title space only when revealed");
          await target.getByRole("button", { name: "Thread actions", exact: true }).click();
          await page.getByRole("menuitem", { name: "Mark unread", exact: true }).click();
          await target.locator("[data-sidebar-thread-trailing-indicator]").waitFor();
          await page.mouse.move(1000, 700);
          const unread = await metrics();
          assert.ok(Math.abs(unread.row.right - unread.title.right - 36) < 1,
            "An indicator reserves only its own slot, without reserving row controls");
          fixture.run(["thread", "read", thread.id]);
        }
        console.log(`${testCase}: shared row controls and per-thread prompts compose correctly`);
      } finally {
        await save([]);
        await context.close();
        if (child) fixture.run(["thread", "delete", child.id, "--yes"]);
      }
    }
  } finally {
    await browser.close();
    fixture.run(["thread-stages", "prefs", "set", "rowActions", JSON.stringify(previous.value)]);
  }
}
