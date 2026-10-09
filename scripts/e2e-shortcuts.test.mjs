import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";
import { verifyStageShortcuts } from "./e2e/stage-shortcuts.mjs";
import { FEATURED_PROJECT } from "./screenshots/fixture.mjs";

function harness(t, { failAt, navigateAway = false } = {}) {
  const contexts = [];
  const sent = [];
  const resets = [];
  const returns = [];
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
        let previousUrl;
        let titleClicks = 0;
        const locator = {
          async waitFor() {}, async fill() {}, async isVisible() { return true; },
          async click() { url = "http://isolated/projects/project/threads/owned"; },
          async elementHandle() { return {}; },
          locator(selector) {
            if (!selector.startsWith("a[data-sidebar-thread-id=")) return this;
            return { ...this, async click() {
              // Rapid repeated title clicks intentionally start renaming.
              if (!navigateAway || titleClicks++ === 0) url = "http://isolated/projects/project/threads/owned";
            } };
          }, getByLabel() { return this; }, first() { return this; },
        };
        return {
          async goto(value) { url = value; }, url() { return url; },
          async goBack() { url = previousUrl; returns.push(url); },
          locator() { return locator; }, getByRole() { return locator; }, getByText() { return locator; },
          async waitForFunction() {}, async waitForURL(expected) {
            assert.ok(typeof expected === "function" ? expected(new URL(url)) : url.endsWith(expected.replace("**", "")),
              `Expected ${expected}, got ${url}`);
          },
          waitForResponse() { return new Promise((resolve) => { reply = resolve; }); },
          keyboard: { async press(key) {
            if (!(key in keys)) return;
            if (sent.length === failAt) throw new Error("keyboard failure");
            assert.ok(url.endsWith("/threads/owned"), "the shortcut acts on the selected owned thread");
            const body = { threadId: "owned", workflowStage: stages[keys[key]] };
            sent.push({ platform: context.platform, body });
            const destination = !navigateAway || body.workflowStage === "Active" ? { kind: "stay" }
              : keys[key] % 2 ? { kind: "compose" } : { kind: "thread", threadId: "other" };
            if (destination.kind !== "stay") {
              previousUrl = url;
              url = destination.kind === "compose" ? "http://isolated/new" : "http://isolated/threads/other";
            }
            reply({ request: () => ({ postData: () => JSON.stringify(body), postDataJSON: () => body }),
              async json() { return { ok: true, result: { destination } }; } });
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
  return { fixture, stack: { serverUrl: "http://isolated" }, contexts, sent, resets, returns, isClosed: () => closed, stages };
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

test("shortcut setup restores selection after thread and compose navigation without repeated title clicks", async (t) => {
  const h = harness(t, { navigateAway: true });
  await verifyStageShortcuts(h);
  assert.equal(h.sent.length, 21);
  assert.equal(h.returns.length, 15);
  assert.ok(h.returns.every((url) => url.endsWith("/threads/owned")));
});
