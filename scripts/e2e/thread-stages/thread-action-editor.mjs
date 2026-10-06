import assert from "node:assert/strict";
import { FEATURED_PROJECT, FEATURED_THREAD } from "../../screenshots/fixture.mjs";
import { launch, openContext, row, sidebar } from "./sidebar.mjs";

async function focused(page, target) {
  const node = await target.elementHandle();
  const description = await node.evaluate((element) => element.getAttribute("aria-label") ?? element.textContent);
  await page.waitForFunction((element) => document.activeElement === element, node, { timeout: 10000 }).catch(async (cause) => {
    throw new Error(`Expected focus on ${description}, got ${await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 400))}`, { cause });
  });
}

export async function verifyThreadActionEditor({ stack, fixture, cases = ["desktop", "compact"] }) {
  const thread = fixture.threads.get(FEATURED_THREAD);
  const project = fixture.projects.get(FEATURED_PROJECT);
  const browser = await launch();
  try {
    for (const testCase of cases) {
      const compact = testCase === "compact";
      const context = await openContext(browser, {
        viewport: compact ? { width: 390, height: 844 } : { width: 1280, height: 800 },
        hasTouch: compact,
        colorScheme: compact ? "light" : "dark",
      });
      const page = await context.newPage();
      const activate = (target) => compact ? target.tap() : target.click();
      const errors = [];
      const daemonPorts = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error" && !message.text().includes("Failed to load resource")) errors.push(message.text());
      });
      page.on("request", (request) => {
        const url = new URL(request.url());
        if (url.hostname === "127.0.0.1" && url.pathname === "/status") daemonPorts.push(url.port);
      });
      const rpc = (method) => new URL(`/api/v1/plugins/thread-stages/rpc/${method}`, stack.serverUrl).href;
      const setActions = async (actions) => {
        const response = await page.request.post(rpc("saveThreadActionsV1"), { data: { threadId: thread.id, actions } });
        assert.equal(response.status(), 200);
      };
      try {
        await setActions([]);
        const url = new URL(`/projects/${project.id}/threads/${thread.id}`, stack.serverUrl).href;
        await page.goto(url);
        assert.equal(page.url(), url);
        assert.ok(await page.title());
        if (compact) {
          await activate(page.getByRole("button", { name: /^Toggle sidebar/ }));
        }
        const list = sidebar(page);
        await list.waitFor({ timeout: 120_000 });
        const target = row(list, thread.id);
        const trigger = target.getByRole("button", { name: "Thread actions" });
        if (compact) {
          const box = await target.boundingBox();
          const input = await context.newCDPSession(page);
          await input.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: box.x + 48, y: box.y + box.height / 2 }] });
          await page.getByRole("dialog", { name: "Thread actions", exact: true }).waitFor();
          await input.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
          await input.detach();
        } else {
          await target.hover();
          await trigger.click();
        }
        const edit = page.getByRole("menuitem", { name: "Edit actions", exact: true });
        const menuMetrics = await edit.evaluate((node) => {
          const style = getComputedStyle(node);
          return { fontSize: style.fontSize, radius: style.borderRadius, padding: Number.parseFloat(style.paddingLeft), height: Number.parseFloat(style.height) };
        });
        if (compact) await activate(edit);
        else await edit.hover();
        const form = page.getByRole("form", { name: "Edit thread actions" });
        await form.waitFor();
        const label = (index) => form.getByRole("textbox", { name: `Action ${index} button label` });
        const prompt = (index) => form.getByRole("textbox", { name: `Action ${index} prompt` });
        const remove = (index) => form.getByRole("button", { name: `Remove action ${index}` });
        assert.equal(await form.getByRole("columnheader").count(), 0, "Placeholders replace the table header");
        assert.equal(await form.getByPlaceholder("Button label").inputValue(), "");
        assert.equal(await form.getByPlaceholder("Prompt to send").inputValue(), "");
        const appearance = await label(1).evaluate((field) => {
          const style = getComputedStyle(field);
          return { fontSize: style.fontSize, height: style.height, border: style.borderColor, background: style.backgroundColor };
        });
        assert.equal(appearance.fontSize, compact ? "16px" : menuMetrics.fontSize);
        assert.equal(appearance.height, compact ? "40px" : "24px");
        assert.equal(appearance.border, "rgba(0, 0, 0, 0)", "Idle fields use the menu's quiet border treatment");
        const clearEmpty = form.getByRole("button", { name: "Clear action 1" });
        await activate(clearEmpty);
        await focused(page, label(1));
        assert.equal(await form.getByRole("textbox").count(), 2, "Clearing the last row keeps one blank row");
        await page.keyboard.press("Tab");
        await page.keyboard.press("Shift+Tab");
        const focusedMetrics = await label(1).evaluate((field) => {
          const row = field.closest("tr");
          const first = row.cells[0];
          const last = row.cells[2];
          const style = getComputedStyle(field);
          return {
            radiusLeft: getComputedStyle(first).borderTopLeftRadius,
            radiusRight: getComputedStyle(last).borderTopRightRadius,
            background: getComputedStyle(first).backgroundColor,
            height: row.getBoundingClientRect().height,
            padding: field.getBoundingClientRect().left - first.getBoundingClientRect().left + Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.borderLeftWidth),
            borderWidth: style.borderLeftWidth,
            shadowDimensions: (style.boxShadow.match(/-?\d+(?:\.\d+)?px/g) ?? []).map(Number.parseFloat),
          };
        });
        assert.equal(focusedMetrics.radiusLeft, menuMetrics.radius);
        assert.equal(focusedMetrics.radiusRight, menuMetrics.radius);
        assert.notEqual(focusedMetrics.background, "rgba(0, 0, 0, 0)", "Focus highlights the rounded row");
        assert.equal(focusedMetrics.height, compact ? 40 : menuMetrics.height,
          compact ? "Touch rows keep bb's native input height" : "Desktop rows match the menu item height");
        assert.ok(Math.abs(focusedMetrics.padding - menuMetrics.padding) <= 1, "Text starts at the menu item inset");
        assert.equal(focusedMetrics.borderWidth, "1px");
        assert.ok(focusedMetrics.shadowDimensions.every((size) => size === 0), "A single border marks focus without a second outer ring");
        await page.keyboard.type("Review");
        await page.keyboard.press("Enter");
        await focused(page, prompt(1));
        await page.keyboard.type("Review this change.");
        await page.keyboard.press("Enter");
        await page.keyboard.type("Check the keyboard flow too.");
        const promptBox = await prompt(1).boundingBox();
        const labelBox = await label(1).boundingBox();
        assert.ok(promptBox.height > labelBox.height + 8, "Focused multiline prompts expand to expose their text");
        await page.keyboard.press("Tab");
        await focused(page, remove(1));
        await page.keyboard.press("Tab");
        await focused(page, label(2));
        await page.keyboard.type("Test");
        await page.keyboard.press("Tab");
        await page.keyboard.type("Run the tests.");
        await page.keyboard.press("Shift+Tab");
        await focused(page, label(2));
        await page.keyboard.press("ArrowRight");
        await page.keyboard.press("ArrowLeft");
        await page.keyboard.type("!");
        assert.equal(await label(2).inputValue(), "Tes!t");
        await activate(remove(1));
        await focused(page, label(1));
        assert.equal(await label(1).inputValue(), "Tes!t", "Removing a row focuses the next row without losing its draft");
        await activate(label(2));
        await page.keyboard.type("Temporary");
        assert.equal(await form.getByRole("textbox").count(), 6);
        await page.keyboard.press("ControlOrMeta+a");
        await page.keyboard.press("Backspace");
        await page.keyboard.press("Tab");
        await focused(page, prompt(2));
        assert.equal(await form.getByRole("textbox").count(), 4, "Leaving an empty row collapses redundant empty rows without losing focus");
        await page.keyboard.press("Tab");
        await focused(page, remove(2));
        if (compact) {
          await page.keyboard.press("Tab");
          await focused(page, page.getByRole("menuitem", { name: "Back" }));
          await page.keyboard.press("Enter");
          await activate(page.getByRole("menuitem", { name: "Edit actions", exact: true }));
        } else {
          await page.keyboard.press("Tab");
          await form.waitFor({ state: "hidden" });
          await focused(page, edit);
          await page.keyboard.press("ArrowRight");
          await form.waitFor();
          await focused(page, label(1));
          await page.keyboard.press("Shift+Tab");
          await form.waitFor({ state: "hidden" });
          await focused(page, edit);
          await page.keyboard.press("Enter");
          await form.waitFor();
          await page.keyboard.press("Escape");
          await form.waitFor({ state: "hidden" });
          await focused(page, edit);
          await page.keyboard.press("ArrowDown");
          await focused(page, page.getByRole("menuitem", { name: "Archive", exact: true }));
          await page.keyboard.press("Escape");
          await trigger.click();
          await edit.hover();
        }
        await form.waitFor();
        assert.equal(await label(1).inputValue(), "Tes!t");
        await activate(prompt(1));
        const autosaved = page.waitForResponse((response) => response.url() === rpc("saveThreadActionsV1") && response.status() === 200
          && response.request().postDataJSON().actions[0]?.prompt.startsWith("A longer prompt"));
        await page.keyboard.press("ControlOrMeta+a");
        await page.keyboard.insertText("A longer prompt to review carefully. ".repeat(15));
        const fieldMetrics = await prompt(1).evaluate((field) => ({
          fontSize: getComputedStyle(field).fontSize,
          resize: getComputedStyle(field).resize,
          height: field.getBoundingClientRect().height,
          scrollHeight: field.scrollHeight,
          clientHeight: field.clientHeight,
        }));
        assert.equal(fieldMetrics.resize, "none", "The compact editor has no textarea resize handles");
        assert.ok(fieldMetrics.height <= 160 && fieldMetrics.scrollHeight > fieldMetrics.clientHeight,
          "Long prompts have a bounded, scrollable editor");
        await prompt(1).hover();
        await page.mouse.wheel(0, 400);
        await page.waitForFunction((field) => field.scrollTop > 0, await prompt(1).elementHandle());
        await activate(label(1));
        assert.ok((await prompt(1).boundingBox()).height <= (compact ? 40 : 24), "Prompts collapse when focus leaves them");
        await activate(prompt(1));
        if (!compact) assert.equal(fieldMetrics.fontSize, menuMetrics.fontSize, "Editor text matches bb's menu typography");
        assert.equal(await form.evaluate((node) => node.scrollWidth > node.clientWidth), false, "The table fits without horizontal overflow");
        if (compact) await activate(page.getByRole("menuitem", { name: "Back" }));
        else await page.mouse.click(1000, 650);
        await autosaved;
        const records = await page.request.post(rpc("listThreadActionsV1"), { data: "null", headers: { "content-type": "application/json" } });
        assert.equal(records.status(), 200);
        const payload = await records.json();
        assert.equal(payload.ok, true);
        const saved = payload.result;
        assert.equal(saved.threads.find((record) => record.threadId === thread.id).actions.length, 1);
        if (!compact) {
          await target.click({ button: "right" });
          await page.getByRole("menu", { name: "Thread actions", exact: true }).getByRole("menuitem", { name: "Edit actions" }).hover();
          await label(1).click();
          await page.keyboard.press("ControlOrMeta+a");
          await page.keyboard.type("Check");
          await page.keyboard.press("Enter");
          await focused(page, prompt(1));
          const cleared = page.waitForResponse((response) => response.url() === rpc("saveThreadActionsV1") && response.status() === 200
            && response.request().postDataJSON().actions.length === 0);
          await page.keyboard.press("Tab");
          await focused(page, remove(1));
          await page.keyboard.press("Enter");
          await cleared;
          await focused(page, label(1));
          assert.equal(await form.getByRole("textbox").count(), 2);
          await form.getByRole("button", { name: "Clear action 1" }).click();
          await focused(page, label(1));
          assert.equal(await label(1).inputValue(), "");
          await page.mouse.click(1000, 650);
        }
        assert.deepEqual(errors, [], "The editor workflow raises no runtime errors");
        assert.ok(daemonPorts.length > 0 && daemonPorts.every((port) => port === stack.env.BB_HOST_DAEMON_PORT),
          "The isolated client probes only its own host daemon");
        console.log(`${testCase} action editor: keyboard, mouse, autosave, focus, prompt sizing passed (${page.url()})`);
      } finally {
        await setActions([]);
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
}
