import assert from "node:assert/strict";
import { chromium } from "playwright";
import { applyPluginState, FEATURED_PROJECT, FEATURED_THREAD } from "../../screenshots/fixture.mjs";

export async function verifyThreadActions({ stack, fixture }) {
  await applyPluginState({ stack, ...fixture });
  const browser = await chromium.launch({ args: ["--mute-audio"] });
  let cleanup = null;
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await context.addInitScript(() => {
      localStorage.setItem("bb.sidebar.threadListProvider", JSON.stringify("ribbon-sidebar/ribbon-sidebar"));
    });
    const page = await context.newPage();
    const thread = fixture.threads.get(FEATURED_THREAD);
    cleanup = async () => {
      const response = await page.request.post(
        new URL("/api/v1/plugins/ribbon-sidebar/rpc/saveThreadActionsV1", stack.serverUrl).href,
        { data: { threadId: thread.id, actions: [], hideTitle: false } },
      );
      assert.equal(response.status(), 200, "The action fixture is removed after the test");
    };
    const project = fixture.projects.get(FEATURED_PROJECT);
    await page.goto(new URL(`/projects/${project.id}/threads/${thread.id}`, stack.serverUrl).href);
    const sidebar = page.locator("[data-ribbon-sidebar-root][data-ribbon-sidebar-ready]");
    await sidebar.waitFor({ timeout: 120_000 });
    const row = sidebar.locator(`li[data-thread-id="${thread.id}"]`).first();
    await row.hover();
    await row.getByRole("button", { name: "Thread actions" }).click();
    await page.getByRole("menuitem", { name: "Edit actions" }).click();
    const dialog = page.getByRole("dialog", { name: "Edit thread actions" });
    const hideTitle = dialog.getByRole("checkbox", { name: "Hide thread title" });
    assert.equal(await hideTitle.isDisabled(), true);
    const labels = [
      "Review",
      "Run every relevant test",
      "Summarize changes across this thread",
      "Update documentation and release notes",
      "Check the pull request status",
    ];
    for (const [index, label] of labels.entries()) {
      await dialog.getByRole("button", { name: "Add action" }).click();
      await dialog.getByRole("textbox", { name: `Action ${index + 1} button label` }).fill(label);
      await dialog.getByRole("textbox", { name: `Action ${index + 1} prompt` }).fill(`${label} in this thread.`);
    }
    assert.equal(await hideTitle.isDisabled(), false);
    await dialog.getByRole("button", { name: "Save actions" }).click();
    await dialog.waitFor({ state: "hidden" });
    const action = row.getByRole("button", { name: `Review in ${thread.title}` });
    await action.waitFor();
    assert.equal(await row.getByRole("button", { name: / in / }).count(), labels.length);
    await row.evaluate((node) => { node.style.width = "1100px"; });
    await page.waitForFunction(({ id, title }) => {
      const row = document.querySelector(`li[data-thread-id="${id}"]`);
      const titleNode = [...(row?.querySelectorAll("span") ?? [])]
        .find((node) => node.children.length === 0 && node.textContent === title);
      const button = row?.querySelector('button[aria-label^="Review in "]');
      return titleNode && button && Math.abs(titleNode.getBoundingClientRect().top - button.getBoundingClientRect().top) < 3;
    }, { id: thread.id, title: thread.title });
    const roomy = await row.evaluate((node, title) => {
      const label = [...node.querySelectorAll("span")]
        .find((candidate) => candidate.children.length === 0 && candidate.textContent === title);
      const buttons = [...node.querySelectorAll("button")]
        .filter((button) => button.getAttribute("aria-label")?.endsWith(` in ${title}`));
      return {
        titleRight: label.getBoundingClientRect().right,
        firstButtonLeft: buttons[0].getBoundingClientRect().left,
        lastButtonRight: buttons.at(-1).getBoundingClientRect().right,
        contentRight: buttons[0].parentElement.parentElement.getBoundingClientRect().right,
      };
    }, thread.title);
    assert.ok(roomy.firstButtonLeft > roomy.titleRight + 8, "Actions align right when the title is short");
    assert.ok(Math.abs(roomy.lastButtonRight - roomy.contentRight) < 1,
      "Without PR information, actions use the full title lane");
    await row.evaluate((node) => { node.style.width = "230px"; });
    const positions = await row.evaluate((node, threadTitle) => {
      const title = [...node.querySelectorAll("span")]
        .find((candidate) => candidate.children.length === 0 && candidate.textContent === threadTitle);
      const buttons = [...node.querySelectorAll("button")]
        .filter((button) => button.getAttribute("aria-label")?.endsWith(` in ${threadTitle}`));
      const longLabel = [...buttons[1].querySelectorAll("span")]
        .find((candidate) => candidate.children.length === 0 && candidate.textContent === "Run every relevant test");
      return {
        titleTop: title?.getBoundingClientRect().top,
        buttonTops: buttons.map((button) => button.getBoundingClientRect().top),
        buttonRights: buttons.map((button) => button.getBoundingClientRect().right),
        labelWidth: longLabel?.getBoundingClientRect().width,
        clipWidth: longLabel?.closest(".overflow-hidden")?.getBoundingClientRect().width,
        mask: longLabel && getComputedStyle(longLabel.closest(".overflow-hidden")).maskImage,
      };
    }, thread.title);
    assert.ok(positions.titleTop !== undefined);
    assert.ok(positions.buttonTops.every((top) => Math.abs(top - positions.titleTop) < 3),
      "All actions stay on the title's row at narrow widths");
    assert.ok(positions.buttonRights.every((right, index) =>
      index === 0 || right > positions.buttonRights[index - 1]),
    "Actions retain their order and do not overlap");
    assert.ok(positions.labelWidth > positions.clipWidth,
      "Long action labels clip inside shrinking buttons");
    assert.notEqual(positions.mask, "none", "Clipped action labels fade at the end");
    await page.mouse.move(1000, 700);
    const longButton = row.getByRole("button", { name: `Run every relevant test in ${thread.title}` });
    await longButton.hover();
    await page.waitForFunction(({ id, title }) => {
      const row = document.querySelector(`li[data-thread-id="${id}"]`);
      const label = [...(row?.querySelectorAll("span") ?? [])]
        .find((candidate) => candidate.children.length === 0 && candidate.textContent === title);
      return label?.getAnimations().length > 0;
    }, { id: thread.id, title: "Run every relevant test" });
    const marquee = await longButton.evaluate((button) => {
      const label = [...button.querySelectorAll("span")]
        .find((candidate) => candidate.children.length === 0 && candidate.textContent === "Run every relevant test");
      label.getAnimations()[0].finish();
      return new DOMMatrixReadOnly(getComputedStyle(label).transform).m41;
    });
    assert.ok(marquee < 0, "Hover pans a clipped action label to reveal its end");
    await page.reload();
    await sidebar.waitFor({ timeout: 120_000 });
    await action.waitFor();
    const colors = await row.evaluate((node) => {
      const button = node.querySelector('button[aria-label^="Review in "]');
      const group = node.querySelector('[data-ribbon-icons-section]');
      if (!button || !group) throw new Error("Action button or section color owner missing");
      const picked = getComputedStyle(group).getPropertyValue("--ribbon-icons-section-color-light").trim();
      const tinted = getComputedStyle(button).backgroundColor;
      group.style.setProperty("--ribbon-icons-section-color-light", "oklch(0.5 0 0)");
      const neutral = getComputedStyle(button).backgroundColor;
      return { picked, tinted, neutral };
    });
    assert.ok(colors.picked, "The Icons plugin supplies this section's color");
    assert.notEqual(colors.tinted, colors.neutral, "The painted button follows its group color");
    const restColor = await action.evaluate((button) => getComputedStyle(button).backgroundColor);
    await action.hover();
    const hoverColor = await action.evaluate((button) => getComputedStyle(button).backgroundColor);
    assert.notEqual(hoverColor, restColor, "The action has a distinct hover fill");

    await row.hover();
    await row.getByRole("button", { name: "Thread actions" }).click();
    await page.getByRole("menuitem", { name: "Edit actions" }).click();
    await hideTitle.check();
    await dialog.getByRole("button", { name: "Save actions" }).click();
    await dialog.waitFor({ state: "hidden" });
    await row.getByText(thread.title, { exact: true }).waitFor({ state: "hidden" });
    assert.equal(await action.isVisible(), true, "Actions remain visible without the title");

    const before = page.url();
    await page.mouse.move(1000, 700);
    const submissions = [];
    await page.route("**/plugins/ribbon-sidebar/rpc/runThreadActionV1", (route) => {
      submissions.push(route.request().postDataJSON());
      return route.fulfill({ json: { ok: true, result: { ok: true } } });
    });
    const response = page.waitForResponse((candidate) =>
      candidate.url().endsWith("/plugins/ribbon-sidebar/rpc/runThreadActionV1"));
    await action.click();
    assert.equal((await response).status(), 200);
    assert.equal(submissions.length, 1, "A real click dispatches one action");
    assert.equal(page.url(), before, "Running an action does not open another thread");

    await page.route("**/api/v1/environments/*/pull-request*", (route) => route.fulfill({
      json: {
        outcome: "available",
        pullRequest: {
          number: 12345,
          title: "Action button placement fixture",
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
    await page.reload();
    await sidebar.waitFor({ timeout: 120_000 });
    await action.waitFor();
    await row.hover();
    await row.getByRole("button", { name: "Thread actions" }).click();
    await page.getByRole("menuitem", { name: "Edit actions" }).click();
    await hideTitle.uncheck();
    await dialog.getByRole("button", { name: "Save actions" }).click();
    await dialog.waitFor({ state: "hidden" });
    await row.getByText(thread.title, { exact: true }).waitFor();
    await row.evaluate((node) => { node.style.width = "230px"; });
    const prNumber = row.getByText("#12345", { exact: true });
    await prNumber.waitFor();
    const prLayout = await row.evaluate((node, title) => {
      const buttons = [...node.querySelectorAll("button")]
        .filter((button) => button.getAttribute("aria-label")?.endsWith(` in ${title}`));
      const pr = [...node.querySelectorAll("span")]
        .find((candidate) => candidate.textContent === "#12345");
      return {
        actionRight: buttons.at(-1).getBoundingClientRect().right,
        prLeft: pr.getBoundingClientRect().left,
        prRight: pr.getBoundingClientRect().right,
        indicatorLeft: node.querySelector("[data-ribbon-sidebar-icon-indicator-space]")?.getBoundingClientRect().left,
        titleClipWidth: [...node.querySelectorAll("span")]
          .find((candidate) => candidate.children.length === 0 && candidate.textContent === title)
          ?.closest(".overflow-hidden")?.getBoundingClientRect().width,
      };
    }, thread.title);
    assert.ok(prLayout.actionRight + 3 <= prLayout.prLeft,
      "Actions stay to the left of PR information");
    assert.ok(prLayout.indicatorLeft === undefined || prLayout.prRight <= prLayout.indicatorLeft,
      "PR information stays clear of the indicator lane");
    assert.ok(prLayout.titleClipWidth <= 1,
      "The title yields all of its width before actions shrink beside PR information");

    const crowded = Array.from({ length: 12 }, (_, index) => ({
      id: `crowded-${index}`,
      label: `Long action label ${index + 1}`,
      prompt: `Do action ${index + 1}.`,
    }));
    const saved = await page.request.post(
      new URL("/api/v1/plugins/ribbon-sidebar/rpc/saveThreadActionsV1", stack.serverUrl).href,
      { data: { threadId: thread.id, actions: crowded, hideTitle: false } },
    );
    assert.equal(saved.status(), 200);
    await row.getByRole("button", { name: `Long action label 12 in ${thread.title}` }).waitFor();
    const crowdedLayout = await row.evaluate((node, title) => {
      const buttons = [...node.querySelectorAll("button")]
        .filter((button) => button.getAttribute("aria-label")?.endsWith(` in ${title}`));
      return buttons.map((button) => ({
        top: button.getBoundingClientRect().top,
        left: button.getBoundingClientRect().left,
        right: button.getBoundingClientRect().right,
      }));
    }, thread.title);
    assert.equal(crowdedLayout.length, crowded.length);
    assert.ok(crowdedLayout.every((box) => box.top === crowdedLayout[0].top && box.right > box.left),
      "Many actions remain on one row with positive button widths");
    assert.ok(crowdedLayout.every((box, index) => index === 0 || box.left >= crowdedLayout[index - 1].right),
      "Crowded action buttons do not overlap");

    await page.unroute("**/api/v1/environments/*/pull-request*");
    const oneAction = await page.request.post(
      new URL("/api/v1/plugins/ribbon-sidebar/rpc/saveThreadActionsV1", stack.serverUrl).href,
      { data: { threadId: thread.id, actions: [{ id: "update", label: "Update", prompt: "Update this thread." }], hideTitle: false } },
    );
    assert.equal(oneAction.status(), 200);
    await page.reload();
    await sidebar.waitFor({ timeout: 120_000 });
    const update = row.getByRole("button", { name: `Update in ${thread.title}` });
    await update.waitFor();
    await row.evaluate((node) => { node.style.width = "230px"; });
    const singleLayout = await row.evaluate((node) => {
      const button = node.querySelector('button[aria-label^="Update in "]');
      const label = [...button.querySelectorAll("span")]
        .find((candidate) => candidate.children.length === 0 && candidate.textContent === "Update");
      return {
        labelWidth: label.getBoundingClientRect().width,
        clipWidth: label.closest(".overflow-hidden").getBoundingClientRect().width,
        indicatorGap: node.getBoundingClientRect().right - button.getBoundingClientRect().right,
      };
    });
    assert.ok(singleLayout.clipWidth >= singleLayout.labelWidth - 0.5,
      "A single action keeps its full label by shrinking the title first");
    assert.ok(singleLayout.indicatorGap >= 28,
      "Actions leave the indicator lane clear even when no indicator is present");
  } finally {
    try {
      await cleanup?.();
    } finally {
      await browser.close();
    }
  }
}
