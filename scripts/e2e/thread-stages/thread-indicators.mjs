import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { FEATURED_PROJECT, FEATURED_THREAD } from "../../screenshots/fixture.mjs";
import { PREFERENCES_KEY, PROVIDER } from "./sidebar.mjs";

export async function verifyThreadIndicators({ stack, fixture }) {
  const { default: PencilEdit01Icon } = await import("@hugeicons/core-free-icons/PencilEdit01Icon");
  const thread = fixture.threads.get(FEATURED_THREAD);
  const project = fixture.projects.get(FEATURED_PROJECT);
  const pluginDir = resolve(".scratch/work/indicator-fixture");
  mkdirSync(pluginDir, { recursive: true });
  writeFileSync(`${pluginDir}/package.json`, JSON.stringify({
    name: "bb-plugin-indicator-fixture", version: "0.0.1", type: "module",
    bb: { name: "Indicator fixture", description: "Drive sidebar status parity checks.", branding: { icon: "Save" }, server: "./server.ts", app: "./app.ts" },
  }));
  writeFileSync(`${pluginDir}/server.ts`, "export default function() {}\n");
  writeFileSync(`${pluginDir}/app.ts`, `
    import { definePluginApp } from "@get-bb/plugin-sdk/app";
    export default definePluginApp(app => {
      app.contentScripts.register({ id: "indicator-fixture", mount(context) {
        const set = event => context.experimental_setThreadRowStatus(event.detail.threadId, event.detail.status);
        window.addEventListener("indicator-fixture-status", set);
        return () => window.removeEventListener("indicator-fixture-status", set);
      }});
    });
  `);
  fixture.run(["plugin", "install", pluginDir, "--yes"]);
  const browser = await chromium.launch({ args: ["--mute-audio"] });
  try {
    const results = [];
    for (const provider of ["__builtin__", PROVIDER]) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
      const preferencesUrl = new URL("/api/v1/preferences/ui", stack.serverUrl).href;
      const { preferences } = await (await context.request.get(preferencesUrl)).json();
      const selection = await context.request.put(`${preferencesUrl}/sidebar.threadListProvider`, {
        data: { expectedRevision: preferences["sidebar.threadListProvider"].revision, value: provider },
      });
      assert.equal(selection.status(), 200, await selection.text());
      await context.addInitScript(({ provider, key }) => {
        localStorage.setItem("bb.sidebar.threadListProvider", JSON.stringify(provider));
        localStorage.setItem(key, JSON.stringify({
          view: { scope: { kind: "all" }, groupingKey: "builtin:projects" }, collapsed: [],
        }));
      }, { provider, key: PREFERENCES_KEY });
      const page = await context.newPage();
      page.setDefaultTimeout(30_000);
      let queuedWork = "none";
      let runtime = "idle";
      function updateThread(value) {
        if (!value || typeof value !== "object") return;
        if (value.id === thread.id && value.runtime) {
          value.queuedWork = queuedWork;
          value.status = runtime;
          value.runtime.displayStatus = runtime;
          value.hasPendingInteraction = false;
          value.lastReadAt = value.latestAttentionAt;
          if (value.activity) for (const key of Object.keys(value.activity)) value.activity[key] = 0;
        }
        for (const child of Object.values(value)) updateThread(child);
      }
      await page.route(/\/api\/v1\/(sidebar-bootstrap|threads(?:\/[^/?]+)?)(\?|$)/, async (route) => {
        const response = await route.fetch({ maxRetries: route.request().method() === "GET" ? 2 : 0 });
        if (!response.headers()["content-type"]?.includes("application/json")) {
          await route.fulfill({ response });
          return;
        }
        const body = await response.json();
        updateThread(body);
        await route.fulfill({ response, json: body });
      });
      await page.goto(new URL(`/projects/${project.id}/threads/${thread.id}`, stack.serverUrl).href);
      const root = provider === "__builtin__"
        ? page.locator('[data-sidebar="sidebar"]')
        : page.locator("[data-ribbon-sidebar-root][data-ribbon-sidebar-ready]");
      const link = root.locator(`a[data-sidebar-thread-id="${thread.id}"]`).first();
      const row = link.locator('xpath=ancestor::*[contains(@class, "group/thread-row")][1]');
      const glyph = row.locator("[data-sidebar-thread-trailing-indicator]");
      const editor = page.locator('[data-app-composer-role="primary"] [contenteditable="true"]').first();
      const observations = [];
      async function ready() {
        await link.waitFor({ timeout: 120_000 });
        await editor.waitFor({ timeout: 120_000 });
        await page.mouse.move(1200, 850);
      }
      async function clearDraft() {
        // ProseMirror handles select-all synchronously. fill("") instead changes
        // DOM selection and sends Delete before selectionchange may reach it.
        await editor.press("ControlOrMeta+a");
        await editor.press("Backspace");
        await page.waitForFunction((node) => node.textContent === "", await editor.elementHandle());
      }
      async function observe(label) {
        console.log(`Checking ${provider}: ${label ?? "idle draft"}`);
        if (label) await row.getByLabel(label, { exact: true }).waitFor().catch(async (error) => {
          console.error(provider, label, await row.evaluate((node) => node.outerHTML));
          throw error;
        });
        await glyph.waitFor();
        await page.waitForFunction((node) => {
          const svg = node.querySelector("svg");
          return svg && svg.getBBox().width > 0;
        }, await glyph.elementHandle()).catch(async (error) => {
          console.error(await glyph.evaluate((node) => node.outerHTML));
          throw error;
        });
        if (provider !== "__builtin__" && (label === null || label === "Thread working with unsubmitted draft")) {
          const paths = await glyph.locator("svg path").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("d")));
          assert.deepEqual(paths, PencilEdit01Icon.map(([, attributes]) => attributes.d));
        }
        const observation = await glyph.evaluate((node) => {
          const svg = node.querySelector("svg");
          const style = getComputedStyle(svg);
          const rect = svg.getBoundingClientRect();
          // bb shines the glyph itself; Thread stages shines the whole row,
          // which masks a window around the glyph and slides it instead.
          // Either way it shimmers or not, and the row's slide is not the
          // glyph's own.
          const rowShimmer = "[data-ribbon-shine-window], [data-ribbon-shine-content]";
          let shimmers = false;
          for (let each = svg; each; each = each.parentElement) {
            if (getComputedStyle(each).maskImage !== "none") shimmers = true;
            if (each === node) break;
          }
          return {
            // The shimmer slides the glyph by a compositor transform, which
            // can land its box a hair off a whole pixel mid-frame.
            color: style.color,
            width: Math.round(rect.width * 100) / 100,
            height: Math.round(rect.height * 100) / 100,
            shimmers,
            glyphMasked: style.maskImage !== "none",
            shapes: [...svg.querySelectorAll("path, circle, rect, line, polyline, polygon")].map((shape) => {
              const b = shape.getBBox();
              return [b.x, b.y, b.width, b.height];
            }),
            animations: node.getAnimations({ subtree: true })
              .filter((animation) => !animation.effect.target.matches(rowShimmer))
              .map((animation) => ({
                duration: animation.effect.getTiming().duration,
                iterations: animation.effect.getTiming().iterations,
              })),
          };
        });
        if (provider !== "__builtin__") {
          assert.equal(observation.glyphMasked, false, `${label}: the glyph should not shimmer alone`);
        }
        delete observation.glyphMasked;
        observations.push({ label: label ?? "idle draft", ...observation });
      }
      await ready();
      for (const state of ["waiting", "failed"]) {
        queuedWork = state;
        await page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 });
        await ready();
        await observe(state === "waiting" ? "Thread has a message waiting to send" : "Queued message failed to send");
      }
      queuedWork = "none";
      await page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 });
      await ready();
      await editor.fill("An unsent draft");
      await observe(null); // bb places the idle draft label on the row's link.
      assert.match(await link.getAttribute("aria-label"), /unsubmitted draft/);
      // Make the CI race deterministic: the editor must clear even before the
      // browser delivers its asynchronous selectionchange notification.
      const resumeSelection = await page.evaluateHandle(() => {
        const hold = (event) => event.stopImmediatePropagation();
        document.addEventListener("selectionchange", hold, true);
        return () => document.removeEventListener("selectionchange", hold, true);
      });
      try {
        await clearDraft();
        await glyph.waitFor({ state: "detached" });
      } finally {
        await resumeSelection.evaluate((resume) => resume());
        await resumeSelection.dispose();
      }
      runtime = "active";
      await page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 });
      await ready();
      await editor.fill("A draft while working");
      await observe("Thread working with unsubmitted draft");
      if (provider !== "__builtin__") {
        const motion = await row.evaluate((node) => {
          const ring = node.querySelector('[class*="animate-spin"]');
          const wave = node.querySelector("[data-ribbon-shine] [data-ribbon-shine-window]");
          return {
            waveAnimation: wave ? getComputedStyle(wave).animationName : null,
            waveDelay: wave ? getComputedStyle(wave).animationDelay : null,
            ringDelay: ring ? getComputedStyle(ring).animationDelay : null,
            rowWidth: node.getBoundingClientRect().width,
            waveWidth: wave ? parseFloat(getComputedStyle(wave).maskSize) : null,
          };
        });
        assert.equal(motion.waveAnimation, "ribbon-shine-window");
        assert.equal(motion.ringDelay, motion.waveDelay);
        assert.ok(Math.abs(motion.waveWidth - motion.rowWidth * 2) < 1, `shimmer wave ${motion.waveWidth}px should span twice the ${motion.rowWidth}px row`);
      }
      runtime = "idle";
      await clearDraft();
      await page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 });
      await ready();
      for (const tone of ["default", "running", "success", "error"]) {
        await page.evaluate(({ threadId, tone }) => {
          window.dispatchEvent(new CustomEvent("indicator-fixture-status", {
            detail: { threadId, status: { icon: "Save", label: `Draft ${tone}`, tone } },
          }));
        }, { threadId: thread.id, tone });
        await observe(`Draft ${tone}`);
      }
      await row.hover();
      await page.waitForFunction((node) => {
        let opacity = 1;
        for (let parent = node; parent && parent.tagName !== "BODY"; parent = parent.parentElement) {
          const style = getComputedStyle(parent);
          if (style.visibility === "hidden" || style.display === "none") return true;
          opacity *= Number(style.opacity);
        }
        return opacity === 0;
      }, await glyph.elementHandle());
      console.log(`Checked hover for ${provider}`);
      const other = fixture.threads.get("Replace the legacy filter drawer");
      await root.locator(`a[data-sidebar-thread-id="${other.id}"]`).first().click({ modifiers: ["ControlOrMeta"] });
      await page.mouse.move(1200, 850);
      for (const tone of ["running", "success"]) {
        await page.evaluate(({ threadId, tone }) => {
          window.dispatchEvent(new CustomEvent("indicator-fixture-status", {
            detail: { threadId, status: { icon: "Save", label: `Draft ${tone}`, tone } },
          }));
        }, { threadId: thread.id, tone });
        const map = glyph.getByRole("img", { name: `${FEATURED_THREAD} — open in split; Draft ${tone}`, exact: true });
        await map.waitFor();
        await page.waitForFunction(({ node, running }) => {
          const lane = node.closest("[data-sidebar-thread-trailing-indicator]");
          let shimmers = false;
          for (let each = node; each; each = each.parentElement) {
            if (getComputedStyle(each).maskImage !== "none") shimmers = true;
            if (each === lane) break;
          }
          return running === shimmers;
        }, { node: await map.elementHandle(), running: tone === "running" });
      }
      console.log(`Checked split activity for ${provider}`);
      results.push(observations);
      await page.unrouteAll({ behavior: "ignoreErrors" });
      await context.close();
    }
    const pluginDraftShapes = results[1].find(({ label }) => label === "idle draft").shapes;
    for (let index = 0; index < results[0].length; index += 1) {
      const builtin = results[0][index];
      const plugin = results[1][index];
      const { shapes: builtinShapes, ...builtinAppearance } = builtin;
      const { shapes: pluginShapes, ...pluginAppearance } = plugin;
      assert.deepEqual(pluginAppearance, builtinAppearance, `${builtin.label}: color, size, and animation should match bb`);
      if (builtin.label === "idle draft" || builtin.label === "Thread working with unsubmitted draft") {
        assert.deepEqual(pluginShapes, pluginDraftShapes, `${builtin.label}: the draft glyph should keep the same geometry`);
      } else {
        assert.deepEqual(pluginShapes, builtinShapes, `${builtin.label}: glyph geometry should match bb`);
      }
    }
  } finally {
    await browser.close();
    fixture.run(["plugin", "disable", "indicator-fixture"]);
  }
}
