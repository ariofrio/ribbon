import assert from "node:assert/strict";
import { applyPluginState, FEATURED_PROJECT, FEATURED_THREAD } from "../../screenshots/fixture.mjs";
import { launch, openContext, row, sidebar } from "./sidebar.mjs";

/** The nearest ancestor that clips its contents. */
const CLIP = `(node) => {
  for (let each = node.parentElement; each; each = each.parentElement) {
    if (getComputedStyle(each).overflowX === "hidden") return each;
  }
  return null;
}`;

export async function verifyThreadActions({ stack, fixture }) {
  await applyPluginState({ stack, ...fixture });
  const browser = await launch();
  let cleanup = null;
  try {
    const context = await openContext(browser, { viewport: { width: 1280, height: 800 } });
    await context.addInitScript(`window.__clipOf = ${CLIP}`);
    const page = await context.newPage();
    const thread = fixture.threads.get(FEATURED_THREAD);
    const rpc = (method) => new URL(`/api/v1/plugins/thread-stages/rpc/${method}`, stack.serverUrl).href;
    cleanup = async () => {
      const response = await page.request.post(rpc("saveThreadActionsV1"), {
        data: { threadId: thread.id, actions: [], hideTitle: false },
      });
      assert.equal(response.status(), 200, "The action fixture is removed after the test");
    };
    const project = fixture.projects.get(FEATURED_PROJECT);
    await page.goto(new URL(`/projects/${project.id}/threads/${thread.id}`, stack.serverUrl).href);
    const list = sidebar(page);
    await list.waitFor({ timeout: 120_000 });
    const target = row(list, thread.id);
    await target.hover();
    await target.getByRole("button", { name: "Thread actions" }).click();
    await page.getByRole("menuitem", { name: "Edit actions" }).hover();
    const editor = page.getByRole("menu", { name: "Edit actions", exact: true });
    await editor.waitFor();
    assert.equal(await page.getByRole("dialog", { name: "Edit thread actions" }).count(), 0);
    assert.equal(await editor.getByRole("checkbox").count(), 0);
    assert.equal(await editor.getByRole("button", { name: "Add action" }).count(), 0);
    assert.equal(await editor.getByRole("button", { name: "Save actions" }).count(), 0);
    const labels = [
      "Review",
      "Run every relevant test",
      "Summarize changes across this thread",
      "Update documentation and release notes",
      "Check the pull request status",
    ];
    for (const [index, label] of labels.entries()) {
      await editor.getByRole("textbox", { name: `Action ${index + 1} button label` }).fill(label);
      await editor.getByRole("textbox", { name: `Action ${index + 1} prompt` }).fill(`${label} in this thread.`);
    }
    await editor.focus();
    const tableLayout = await editor.getByRole("table", { name: "Thread actions" }).evaluate((table) => {
      const fields = [...table.querySelectorAll("input, textarea")].map((field) => {
        const box = field.getBoundingClientRect();
        return { x: box.x, y: box.y, width: box.width, height: box.height };
      });
      return { fields, height: table.getBoundingClientRect().height };
    });
    assert.ok(tableLayout.height < 280, "Five actions fit in a compact table");
    for (let index = 0; index < labels.length; index++) {
      const label = tableLayout.fields[index * 2];
      const prompt = tableLayout.fields[index * 2 + 1];
      assert.ok(Math.abs(label.y - prompt.y) < 3 && prompt.x >= label.x + label.width,
        "Each label and prompt share one row");
      assert.equal(prompt.x, tableLayout.fields[1].x, "Prompt columns align across all rows");
      assert.ok(label.height <= 36 && prompt.height <= 36, "Fields start at compact heights");
    }
    const blankLabel = editor.getByRole("textbox", { name: "Action 6 button label" });
    await blankLabel.fill("Temporary");
    assert.equal(await editor.getByRole("textbox").count(), 14, "Editing the bottom row appends a new empty row");
    await blankLabel.fill("");
    assert.equal(await editor.getByRole("textbox").count(), 14, "Extra empty rows remain while the editor is focused");
    await editor.focus();
    assert.equal(await editor.getByRole("textbox").count(), 12, "Unfocusing the table collapses extra empty rows");
    const autosaved = page.waitForResponse((response) => response.url().endsWith("/rpc/saveThreadActionsV1") && response.status() === 200
      && response.request().postDataJSON().actions[4]?.prompt === `${labels[4]} in this thread. Again.`);
    await editor.getByRole("textbox", { name: "Action 5 prompt" }).fill(`${labels[4]} in this thread. Again.`);
    await page.keyboard.press("Escape");
    await editor.waitFor({ state: "hidden" });
    await autosaved;
    await page.keyboard.press("Escape");
    const action = target.getByRole("button", { name: `Review in ${thread.title}` });
    await action.waitFor().catch(async (cause) => {
      const records = await page.request.post(rpc("listThreadActionsV1"), { data: "null", headers: { "content-type": "application/json" } });
      console.error("Saved actions and rendered row", JSON.stringify(await records.json()), await target.innerText());
      throw cause;
    });
    assert.equal(await target.getByRole("button", { name: / in / }).count(), labels.length);
    await target.evaluate((node) => { node.style.width = "1100px"; });
    await page.waitForFunction(({ id, title }) => {
      const rowNode = document.querySelector(`[data-thread-id="${id}"]`);
      const titleNode = [...(rowNode?.querySelectorAll("span") ?? [])]
        .find((node) => node.children.length === 0 && node.textContent === title);
      const button = rowNode?.querySelector('button[aria-label^="Review in "]');
      return titleNode && button && Math.abs(titleNode.getBoundingClientRect().top - button.getBoundingClientRect().top) < 3;
    }, { id: thread.id, title: thread.title });
    const roomy = await target.evaluate((node, title) => {
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
    assert.ok(Math.abs(roomy.lastButtonRight - roomy.contentRight) < 1, "Without PR information, actions use the full title lane");
    await target.evaluate((node) => { node.style.width = "230px"; });
    const positions = await target.evaluate((node, threadTitle) => {
      const title = [...node.querySelectorAll("span")]
        .find((candidate) => candidate.children.length === 0 && candidate.textContent === threadTitle);
      const buttons = [...node.querySelectorAll("button")]
        .filter((button) => button.getAttribute("aria-label")?.endsWith(` in ${threadTitle}`));
      const longLabel = [...buttons[1].querySelectorAll("span")]
        .find((candidate) => candidate.children.length === 0 && candidate.textContent === "Run every relevant test");
      const clip = longLabel && window.__clipOf(longLabel);
      return {
        titleTop: title?.getBoundingClientRect().top,
        buttonTops: buttons.map((button) => button.getBoundingClientRect().top),
        buttonRights: buttons.map((button) => button.getBoundingClientRect().right),
        labelWidth: longLabel?.getBoundingClientRect().width,
        clipWidth: clip?.getBoundingClientRect().width,
        mask: clip && getComputedStyle(clip).maskImage,
      };
    }, thread.title);
    assert.ok(positions.titleTop !== undefined);
    assert.ok(positions.buttonTops.every((top) => Math.abs(top - positions.titleTop) < 3), "All actions stay on the title's row at narrow widths");
    assert.ok(positions.buttonRights.every((right, index) => index === 0 || right > positions.buttonRights[index - 1]),
      "Actions retain their order and do not overlap");
    assert.ok(positions.labelWidth > positions.clipWidth, "Long action labels clip inside shrinking buttons");
    assert.notEqual(positions.mask, "none", "Clipped action labels fade at the end");
    await page.mouse.move(1000, 700);
    const longButton = target.getByRole("button", { name: `Run every relevant test in ${thread.title}` });
    await longButton.hover();
    await page.waitForFunction(({ id, title }) => {
      const rowNode = document.querySelector(`[data-thread-id="${id}"]`);
      const label = [...(rowNode?.querySelectorAll("span") ?? [])]
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
    await page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 });
    await list.waitFor({ timeout: 120_000 });
    await action.waitFor();
    // The buttons take the section's color, which its icon carries.
    const colors = await target.evaluate((node) => {
      const button = node.querySelector('button[aria-label^="Review in "]');
      const fill = getComputedStyle(button).getPropertyValue("--ribbon-action-fill").trim();
      const tinted = getComputedStyle(button).backgroundColor;
      button.style.setProperty("--ribbon-action-fill", "oklch(0.5 0 0)");
      const neutral = getComputedStyle(button).backgroundColor;
      button.style.removeProperty("--ribbon-action-fill");
      return { fill, tinted, neutral };
    });
    assert.ok(colors.fill && !colors.fill.includes("oklch(0.5 0 0)"), "The section's color supplies the button fill");
    assert.notEqual(colors.tinted, colors.neutral, "The painted button follows its group color");
    const restColor = await action.evaluate((button) => getComputedStyle(button).backgroundColor);
    await action.hover();
    const hoverColor = await action.evaluate((button) => getComputedStyle(button).backgroundColor);
    assert.notEqual(hoverColor, restColor, "The action has a distinct hover fill");

    // Older saved display preferences cannot hide the title anymore.
    const legacySaved = await page.request.post(rpc("saveThreadActionsV1"), {
      data: {
        threadId: thread.id,
        actions: labels.map((label, index) => ({ id: `legacy-${index}`, label: label.slice(0, 24), prompt: `${label} in this thread.` })),
        hideTitle: true,
      },
    });
    assert.equal(legacySaved.status(), 200);
    await page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 });
    await list.waitFor({ timeout: 120_000 });
    await target.getByText(thread.title, { exact: true }).waitFor({ state: "attached" });
    assert.equal(await action.isVisible(), true, "Actions remain visible beside the title");

    const before = page.url();
    await page.mouse.move(1000, 700);
    const submissions = [];
    await page.route("**/plugins/thread-stages/rpc/runThreadActionV1", (route) => {
      submissions.push(route.request().postDataJSON());
      return route.fulfill({ json: { ok: true, result: { ok: true } } });
    });
    const response = page.waitForResponse((candidate) => candidate.url().endsWith("/plugins/thread-stages/rpc/runThreadActionV1"));
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
      autoMerge: false,
      inMergeQueue: false,
          checks: { failedCount: 0, passedCount: 1, pendingCount: 0, totalCount: 1, state: "passing" },
          mergeability: { mergeStateStatus: "CLEAN", mergeable: "MERGEABLE", state: "mergeable" },
          review: { reviewRequestCount: 0, state: "approved" },
        },
      },
    }));
    await page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 });
    await list.waitFor({ timeout: 120_000 });
    await action.waitFor();
    // Five actions beside a PR number can leave the title no width at all.
    await target.getByText(thread.title, { exact: true }).waitFor({ state: "attached" });
    await target.evaluate((node) => { node.style.width = "230px"; });
    const prNumber = target.getByText("#12345", { exact: true });
    await prNumber.waitFor();
    const prLayout = await target.evaluate((node, title) => {
      const buttons = [...node.querySelectorAll("button")]
        .filter((button) => button.getAttribute("aria-label")?.endsWith(` in ${title}`));
      const pr = [...node.querySelectorAll("span")].find((candidate) => candidate.textContent === "#12345");
      const label = [...node.querySelectorAll("span")]
        .find((candidate) => candidate.children.length === 0 && candidate.textContent === title);
      return {
        actionRight: buttons.at(-1).getBoundingClientRect().right,
        actionLefts: buttons.map((button) => Math.round(button.getBoundingClientRect().left)),
        prLeft: pr.getBoundingClientRect().left,
        prRight: pr.getBoundingClientRect().right,
        laneRight: pr.parentElement.getBoundingClientRect().right,
        rowRight: node.getBoundingClientRect().right,
        titleClipWidth: window.__clipOf(label)?.getBoundingClientRect().width,
      };
    }, thread.title);
    assert.ok(prLayout.actionRight + 3 <= prLayout.prLeft, `Actions stay to the left of PR information: ${JSON.stringify(prLayout)}`);
    assert.ok(prLayout.titleClipWidth <= 1, `The title yields all of its width before actions shrink beside PR information: ${JSON.stringify(prLayout)}`);

    const crowded = Array.from({ length: 12 }, (_, index) => ({
      id: `crowded-${index}`,
      label: `Long action label ${index + 1}`,
      prompt: `Do action ${index + 1}.`,
    }));
    const saved = await page.request.post(rpc("saveThreadActionsV1"), {
      data: { threadId: thread.id, actions: crowded, hideTitle: false },
    });
    assert.equal(saved.status(), 200);
    await target.getByRole("button", { name: `Long action label 12 in ${thread.title}` }).waitFor();
    const crowdedLayout = await target.evaluate((node, title) => {
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
    const oneAction = await page.request.post(rpc("saveThreadActionsV1"), {
      data: { threadId: thread.id, actions: [{ id: "update", label: "Update", prompt: "Update this thread." }], hideTitle: false },
    });
    assert.equal(oneAction.status(), 200);
    await page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 });
    await list.waitFor({ timeout: 120_000 });
    const update = target.getByRole("button", { name: `Update in ${thread.title}` });
    await update.waitFor();
    await target.evaluate((node) => { node.style.width = "230px"; });
    const singleLayout = await target.evaluate((node) => {
      const button = node.querySelector('button[aria-label^="Update in "]');
      const label = [...button.querySelectorAll("span")]
        .find((candidate) => candidate.children.length === 0 && candidate.textContent === "Update");
      const rect = (element) => {
        const { left, right, width } = element.getBoundingClientRect();
        return { left: Math.round(left), right: Math.round(right), width: Math.round(width) };
      };
      return {
        labelWidth: label.getBoundingClientRect().width,
        clipWidth: window.__clipOf(label).getBoundingClientRect().width,
        indicatorGap: node.getBoundingClientRect().right - button.getBoundingClientRect().right,
        button: rect(button),
        lane: rect(button.parentElement.parentElement),
        row: rect(node),
        siblings: [...button.parentElement.parentElement.children].map((child) => `${child.tagName}.${child.className.split(" ").slice(0, 3).join(".")} ${rect(child).width} flex=${getComputedStyle(child).flex} minw=${getComputedStyle(child).minWidth}`),
        buttonFlex: `${getComputedStyle(button).flex} basis=${getComputedStyle(button).flexBasis} inline=${button.style.flexBasis} minw=${getComputedStyle(button).minWidth} pad=${getComputedStyle(button).paddingInline}`,
        actionsSpanFlex: `${getComputedStyle(button.parentElement).flex}`,
      };
    });
    assert.ok(singleLayout.clipWidth >= singleLayout.labelWidth - 0.5, `A single action keeps its full label by shrinking the title first: ${JSON.stringify(singleLayout)}`);
    assert.ok(singleLayout.indicatorGap >= 28, `Actions leave the indicator lane clear even when no indicator is present: ${JSON.stringify(singleLayout)}`);
  } finally {
    try {
      await cleanup?.();
    } finally {
      await browser.close();
    }
  }
}
