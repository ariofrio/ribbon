import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";
import { verifyStageShortcuts } from "./e2e/stage-shortcuts.mjs";
import { FEATURED_PROJECT } from "./screenshots/fixture.mjs";

function harness(t, { failAt } = {}) {
  const contexts = [];
  const sent = [];
  const resets = [];
  let closed = false;
  const stages = ["Completed", "Active", "Waiting", "Deferred", "BlockedOnOtherAgent", "BlockedOnThirdParty", "Completed"];
  const keys = {
    "Control+.": 0, "Meta+.": 0,
    "Control+Shift+.": 1, "Meta+Shift+.": 1,
    "Control+Shift+,": 2, "Meta+Shift+,": 2,
    "Control+Alt+,": 3, "Control+Meta+.": 3,
    "Control+Alt+Shift+.": 4, "Control+Alt+Meta+.": 4,
    "Control+Alt+Shift+,": 5, "Control+Meta+Shift+.": 5,
    "Control+Alt+.": 6, "Meta+Alt+.": 6,
  };
  t.mock.method(chromium, "launch", async () => ({
    async newContext() {
      const context = { closed: false, on() {}, async close() { this.closed = true; } };
      contexts.push(context);
      context.addInitScript = async (_script, value) => {
        if (typeof value === "string") context.platform = value;
      };
      context.newPage = async () => {
        let url;
        let reply;
        const locator = {
          async waitFor() {}, async fill() {}, async isVisible() { return true; },
          async click() { url = "http://isolated/projects/project/threads/owned"; },
          async elementHandle() { return {}; },
          locator() { return this; }, getByLabel() { return this; }, first() { return this; },
        };
        return {
          async goto(value) { url = value; }, url() { return url; },
          locator() { return locator; }, getByRole() { return locator; }, getByText() { return locator; },
          async waitForFunction() {}, async waitForURL() {},
          waitForResponse() { return new Promise((resolve) => { reply = resolve; }); },
          keyboard: { async press(key) {
            if (!(key in keys)) return;
            if (sent.length === failAt) throw new Error("keyboard failure");
            const body = { threadId: "owned", workflowStage: stages[keys[key]] };
            sent.push({ platform: context.platform, body });
            reply({ request: () => ({ postData: () => JSON.stringify(body), postDataJSON: () => body }),
              async json() { return { ok: true, result: { destination: { kind: "stay" } } }; } });
          } },
        };
      };
      return context;
    },
    async close() { closed = true; },
  }));
  const fixture = {
    projects: new Map([[FEATURED_PROJECT, { id: "project" }]]),
    runJson: () => ({ id: "owned" }),
    run(args) { if (args[0] === "thread-stages" && args[1] === "stage") resets.push(args); },
  };
  return { fixture, stack: { serverUrl: "http://isolated" }, contexts, sent, resets, isClosed: () => closed, stages };
}

test("shortcut checks reuse one client per platform while resetting every interaction", async (t) => {
  const h = harness(t);
  await verifyStageShortcuts(h);
  assert.deepEqual(h.contexts.map((c) => c.platform), ["Linux x86_64", "Win32", "MacIntel"]);
  for (const platform of h.contexts.map((c) => c.platform)) {
    assert.deepEqual(h.sent.filter((s) => s.platform === platform).map((s) => s.body.workflowStage), h.stages);
  }
  assert.equal(h.resets.length, 21);
  assert.ok(h.resets.every((args) => args.at(-1) === "owned"));
  h.resets.forEach((args, index) => assert.notEqual(args[2], h.sent[index].body.workflowStage));
  assert.ok(h.contexts.every((c) => c.closed));
  assert.ok(h.isClosed());
});

test("a failing shortcut closes its platform context and browser", async (t) => {
  const h = harness(t, { failAt: 2 });
  await assert.rejects(verifyStageShortcuts(h), /keyboard failure/);
  assert.ok(h.contexts.every((c) => c.closed));
  assert.ok(h.isClosed());
});
