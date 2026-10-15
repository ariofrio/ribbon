import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";
import { verifyRowActions } from "./e2e/thread-stages/row-actions.mjs";
import { FEATURED_PROJECT, FEATURED_THREAD } from "./screenshots/fixture.mjs";

test("row actions finish owned pin mutations before using the moved row", async (t) => {
  let pending = false;
  let pinned = false;
  const completed = [];
  t.mock.method(chromium, "launch", async () => ({
    async newContext(options) {
      const mobile = options.hasTouch;
      const locator = {
        async waitFor() {}, async hover() {}, async tap() {}, async count() { return 3; },
        locator() { return this; }, first() { return this; },
        getByText() { return this; },
        getByRole(_role, { name } = {}) {
          return { ...this, async click() {
            assert.equal(pending, false, "a late pin result can remount the row and detach its menu");
            if (name === "Pin" || name === "Unpin") {
              pinned = name === "Pin";
              pending = true; // The label already changed optimistically.
            }
          } };
        },
        async evaluate() {
          return mobile ? { pointer: true, padding: 36, actionWidth: 0, rowWidth: 600 }
            : { titleRight: 100, controlsLeft: 110, count: 4 };
        },
      };
      const page = {
        async goto() {}, async route() {}, on() {},
        locator() { return locator; }, getByRole: locator.getByRole.bind(locator),
        getByTestId() { return locator; },
        waitForResponse(predicate) {
          const response = (id, action) => ({
            url: () => `http://isolated/api/v1/threads/${id}/${action}`,
            request: () => ({ method: () => "POST" }), ok: () => true,
            async json() {
              assert.ok(pending, "observe the response after the pointer action");
              pending = false;
              completed.push(action);
              return { id, pinnedAt: pinned ? 123 : null };
            },
          });
          const action = pinned ? "unpin" : "pin";
          assert.equal(predicate(response("other", action)), false, "another thread cannot satisfy readiness");
          const owned = response("owned", action);
          assert.equal(predicate(owned), true);
          return Promise.resolve(owned);
        },
      };
      return { on() {}, async addInitScript() {}, async newPage() { return page; }, async close() {} };
    },
    async close() {},
  }));
  const fixture = {
    projects: new Map([[FEATURED_PROJECT, { id: "project" }]]),
    threads: new Map([[FEATURED_THREAD, { id: "owned" }]]),
    runJson() { return { value: [] }; }, run() {},
  };
  await verifyRowActions({ stack: { serverUrl: "http://isolated" }, fixture });
  assert.deepEqual(completed, ["pin", "unpin"]);
  assert.equal(pending, false);
});
