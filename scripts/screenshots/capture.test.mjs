import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { ASPECT_RATIO, cropRectangle, unionBox } from "./capture.mjs";
import { KEY_GLYPHS } from "./key-glyphs.mjs";
import {
  setupScreenshots,
  SHOTS,
  SIDEBAR_PROVIDER,
} from "./shots.mjs";

const viewport = { width: 1280, height: 720 };

test("the screenshot suite uses the ChatGPT theme", () => {
  const commands = [];
  setupScreenshots({ fixture: { run: (command) => commands.push(command) } });
  assert.deepEqual(commands, [
    ["theme", "set", "plugin:chatgpt-theme:chatgpt"],
  ]);
});

test("Ribbon sidebar's dedicated shot runs last", () => {
  assert.equal(SHOTS.at(-1)?.id, "ribbon-sidebar");
});

test("every screenshot uses Ribbon's sole thread-list replacement", () => {
  assert.equal(SIDEBAR_PROVIDER, "Ribbon sidebar");
});

test("the shortcut shot stops retrying when the late plugin handles the key", async () => {
  const events = [];
  const replyWaits = [];
  let requestAttempts = 0;
  const timeout = () => {
    const error = new Error("Timeout");
    error.name = "TimeoutError";
    return error;
  };
  const locator = (name = "locator") => ({
    click: async () => {},
    elementHandle: async () => ({}),
    evaluateAll: async () => {},
    filter: () => locator(name),
    first: () => locator(name),
    getAttribute: async () => "/projects/proj_atlas/threads/thr_featured",
    innerText: async () => SIDEBAR_PROVIDER,
    waitFor: async (options) => {
      if (name === "reply") {
        replyWaits.push(options);
        if (requestAttempts < 4) throw timeout();
      }
    },
  });
  const request = (method) => ({
    method: () => "POST",
    url: () =>
      `http://127.0.0.1/api/v1/plugins/missing-keyboard-shortcuts/rpc/${method}`,
  });
  const response = (method) => ({
    ok: () => true,
    request: () => request(method),
    status: () => 200,
    url: () =>
      `http://127.0.0.1/api/v1/plugins/missing-keyboard-shortcuts/rpc/${method}`,
  });
  const page = {
    evaluate: async () => 0,
    getByRole(role, options) {
      return locator(
        role === "textbox" && options?.name === "Reply…" ? "reply" : role,
      );
    },
    getByText: () => locator("text"),
    keyboard: {
      press: async (keys) => events.push(["keyboard.press", keys]),
      type: async () => {},
    },
    locator: () => locator(),
    goto: async () => {},
    url: () => "http://127.0.0.1/",
    waitForFunction: async () => {},
    waitForRequest: async (predicate, options) => {
      const createRequest = request("createSideChat");
      assert.ok(
        predicate(createRequest),
        "the shot waited for an unexpected request",
      );
      requestAttempts += 1;
      events.push(["createSideChat.waitForRequest", options]);
      if (requestAttempts < 4) throw timeout();
      return createRequest;
    },
    waitForResponse: async (predicate, options) => {
      const listResponse = response("listAppKeybindings");
      if (predicate(listResponse)) return listResponse;
      const createResponse = response("createSideChat");
      assert.ok(
        predicate(createResponse),
        "the shot waited for an unexpected response",
      );
      events.push(["createSideChat.waitForResponse", options]);
      if (options?.timeout === 10000) throw timeout();
      return createResponse;
    },
  };
  const shot = SHOTS.find(({ id }) => id === "missing-keyboard-shortcuts");
  assert.ok(shot, "the shortcut shot is missing");

  await shot.prepare({ page });

  assert.equal(requestAttempts, 4);
  assert.deepEqual(
    events.filter(
      ([event, keys]) =>
        event === "createSideChat.waitForRequest" ||
        event === "createSideChat.waitForResponse" ||
        (event === "keyboard.press" && keys === "Shift+Meta+KeyL"),
    ),
    [
      ["createSideChat.waitForResponse", { timeout: 120000 }],
      ["createSideChat.waitForRequest", { timeout: 10000 }],
      ["keyboard.press", "Shift+Meta+KeyL"],
      ["createSideChat.waitForResponse", { timeout: 120000 }],
      ["createSideChat.waitForRequest", { timeout: 10000 }],
      ["keyboard.press", "Shift+Meta+KeyL"],
      ["createSideChat.waitForResponse", { timeout: 120000 }],
      ["createSideChat.waitForRequest", { timeout: 10000 }],
      ["keyboard.press", "Shift+Meta+KeyL"],
      ["createSideChat.waitForResponse", { timeout: 120000 }],
      ["createSideChat.waitForRequest", { timeout: 10000 }],
      ["keyboard.press", "Shift+Meta+KeyL"],
    ],
  );
  assert.deepEqual(replyWaits, [{ timeout: 120000 }]);
});

function aspectOf(rectangle) {
  return rectangle.width / rectangle.height;
}

test("a wide box keeps its width and gains height", () => {
  const clip = cropRectangle({
    box: { x: 400, y: 300, width: 400, height: 100 },
    padding: 0,
    viewport,
  });
  assert.equal(clip.width, 400);
  assert.ok(Math.abs(aspectOf(clip) - ASPECT_RATIO) < 0.01);
});

test("a tall box keeps its height and gains width", () => {
  const clip = cropRectangle({
    box: { x: 0, y: 100, width: 320, height: 400 },
    padding: 0,
    viewport,
  });
  assert.equal(clip.height, 400);
  assert.ok(Math.abs(aspectOf(clip) - ASPECT_RATIO) < 0.01);
});

test("padding grows the crop around the box", () => {
  const tight = cropRectangle({
    box: { x: 400, y: 300, width: 200, height: 100 },
    padding: 0,
    viewport,
  });
  const padded = cropRectangle({
    box: { x: 400, y: 300, width: 200, height: 100 },
    padding: 40,
    viewport,
  });
  assert.ok(padded.width > tight.width);
});

test("a crop never leaves the viewport", () => {
  const clip = cropRectangle({
    box: { x: 0, y: 0, width: 320, height: 700 },
    padding: 80,
    viewport,
  });
  assert.ok(clip.x >= 0 && clip.y >= 0);
  assert.ok(clip.x + clip.width <= viewport.width);
  assert.ok(clip.y + clip.height <= viewport.height);
});

test("an explicit width overrides the box's own size", () => {
  const clip = cropRectangle({
    box: { x: 0, y: 200, width: 320, height: 500 },
    padding: 0,
    width: 720,
    viewport,
  });
  assert.equal(clip.width, 720);
  assert.equal(clip.height, Math.round(720 / ASPECT_RATIO));
});

test("a union covers every box", () => {
  assert.deepEqual(
    unionBox([
      { x: 10, y: 20, width: 30, height: 40 },
      { x: 5, y: 50, width: 10, height: 10 },
    ]),
    { x: 5, y: 20, width: 35, height: 40 },
  );
});

/**
 * A key with no outline falls back to whatever font the capturing machine
 * offers, which is the whole reason these outlines exist — and it does it
 * quietly, in one chip, in one shot. Adding a chord with a modifier nobody has
 * traced yet should fail here instead.
 */
test("every modifier a shot presses has an outline", () => {
  const symbols = new Set();
  for (const shot of SHOTS) {
    for (const highlight of shot.highlights?.(stubPage) ?? []) {
      for (const key of (highlight.keys ?? "").split(/\s+/u)) {
        if (key !== "" && !/^[A-Za-z0-9]+$/u.test(key)) symbols.add(key);
      }
    }
  }
  assert.ok(symbols.size > 0, "no shot draws a key chip");
  for (const symbol of symbols) {
    assert.ok(
      KEY_GLYPHS[symbol] !== undefined,
      `${symbol} is drawn on a chip but has no outline`,
    );
  }
});

/** Locators are never resolved here; only the keys beside them are read. */
const stubPage = new Proxy(
  {},
  {
    get() {
      return () => stubPage;
    },
  },
);

/**
 * The outlines are Apple's and the repository's licence does not cover them;
 * NOTICE.md says so, and this says so in a way that fails. They are here to
 * draw a screenshot. `scripts/` is never published and no plugin can package a
 * file from outside its own directory, so the only way they reach something a
 * user installs is if someone copies them there.
 */
test("no plugin source carries the borrowed glyph outlines", () => {
  const plugins = new URL("../../plugins/", import.meta.url).pathname;
  const outlines = Object.values(KEY_GLYPHS).map(({ path }) => path.slice(0, 60));
  const walk = (directory) =>
    readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      if (entry.name === "node_modules" || entry.name === "dist") return [];
      const child = join(directory, entry.name);
      return entry.isDirectory() ? walk(child) : [child];
    });
  for (const file of walk(plugins)) {
    const contents = readFileSync(file, "latin1");
    for (const outline of outlines) {
      assert.ok(
        !contents.includes(outline),
        `${file} carries a glyph outline that is not this project's to ship`,
      );
    }
  }
});
