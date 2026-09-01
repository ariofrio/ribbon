import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";
import { AGENT } from "../../screenshots/fixture.mjs";

async function openScopedComposer({ browser, stack, group, path = "/" }) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    reducedMotion: "reduce",
  });
  await context.addInitScript(
    ({ groupingKey, groupId, providerId, modelId }) => {
      window.localStorage.setItem(
        "bb.plugin.ribbon-sidebar.preferences.v1",
        JSON.stringify({
          view: {
            scope: { kind: "group", group: { groupingKey, groupId } },
            groupingKey: null,
          },
          collapsed: [],
        }),
      );
      window.localStorage.setItem(
        "bb.sidebar.threadListProvider",
        JSON.stringify("ribbon-sidebar/ribbon-sidebar"),
      );
      window.localStorage.setItem("bb.promptbox.provider", providerId);
      window.localStorage.setItem(
        `bb.promptbox.model-${encodeURIComponent(providerId)}-1`,
        modelId,
      );
      window.__routingE2e = { composers: 0 };
      document.addEventListener(
        "DOMContentLoaded",
        () => {
          const seen = new WeakSet();
          const record = (node) => {
            if (!(node instanceof Element)) return;
            const candidates = [
              ...(node.matches('[data-app-composer-role="primary"]')
                ? [node]
                : []),
              ...node.querySelectorAll('[data-app-composer-role="primary"]'),
            ];
            for (const candidate of candidates) {
              if (seen.has(candidate)) continue;
              seen.add(candidate);
              window.__routingE2e.composers += 1;
            }
          };
          record(document.documentElement);
          new MutationObserver((records) => {
            for (const mutation of records) {
              for (const node of mutation.addedNodes) record(node);
            }
          }).observe(document.documentElement, { childList: true, subtree: true });
        },
        { once: true },
      );
    },
    {
      ...group,
      providerId: `acp-${AGENT.id}`,
      modelId: AGENT.modelId,
    },
  );
  const page = await context.newPage();
  await page.goto(new URL(path, stack.serverUrl).href, {
    waitUntil: "domcontentloaded",
  });
  await page
    .locator("[data-ribbon-sidebar-root][data-ribbon-sidebar-ready]")
    .waitFor({ timeout: 120_000 });
  const composer = page.locator('[data-app-composer-role="primary"]');
  await composer.waitFor({ timeout: 120_000 });
  return { context, page, composer };
}

async function verifyProjectComposerIsStable({ browser, stack, fixture }) {
  const project = fixture.projects.get("atlas-api");
  const { context, page, composer } = await openScopedComposer({
    browser,
    stack,
    group: { groupingKey: "builtin:projects", groupId: project.id },
  });
  try {
    await composer
      .getByRole("button", { name: "Project" })
      .filter({ hasText: "atlas-api" })
      .waitFor();
    const mounts = await page.evaluate(
      () =>
        new Promise((resolve) => {
          requestAnimationFrame(() =>
            requestAnimationFrame(() => resolve(window.__routingE2e.composers)),
          );
        }),
    );
    assert.equal(
      mounts,
      2,
      `Project-scoped New thread mounted its composer ${mounts} times instead of once before and once after project selection`,
    );
  } finally {
    await context.close();
  }
}

async function verifyStagePlacement({ browser, stack, fixture }) {
  const groupingKey = "plugin:thread-stages:stages";
  const groupId = "Deferred";
  const project = fixture.projects.get("atlas-api");
  assert.ok(project, "The routing fixture is missing atlas-api");
  const { context, page, composer } = await openScopedComposer({
    browser,
    stack,
    group: { groupingKey, groupId },
    path: `/projects/${encodeURIComponent(project.id)}`,
  });
  try {
    const environmentButton = composer.getByRole("button", {
      name: "Environment",
    });
    const environmentChoice = page.getByRole("menuitem", {
      name: /^Work (locally|remotely)/,
    });
    await environmentButton.click();
    await environmentChoice.click();
    await environmentChoice.waitFor({ state: "hidden" });
    await environmentButton
      .filter({ hasText: /Work (locally|remotely)/ })
      .waitFor();
    const modelButton = composer.getByRole("button", {
      name: /Provider, model and reasoning/,
    });
    await modelButton.filter({ hasText: AGENT.modelName }).waitFor();
    await composer.getByRole("button", { name: "Submit (Enter)" }).waitFor();
    const editor = composer.locator('[contenteditable="true"]');
    const prompt =
      "Investigate why webhook retries stall after the third attempt.";
    await editor.click();
    await editor.pressSequentially(prompt, { delay: 10 });
    assert.equal(await editor.textContent(), prompt);
    await composer
      .locator('[data-promptbox-submit-action][type="submit"]')
      .click({ timeout: 120_000 });
    await page.waitForURL(/\/threads\/[^/]+/, { timeout: 120_000 });
    const threadId = new URL(page.url()).pathname.match(/\/threads\/([^/]+)/)?.[1];
    assert.ok(threadId, `Could not read the created thread ID from ${page.url()}`);

    const deadline = Date.now() + 30_000;
    let stage = null;
    while (Date.now() <= deadline) {
      const placements = fixture.runJson([
        "sidebar",
        "show",
        threadId,
        "--json",
      ]);
      stage = placements.find(
        ({ placement }) => placement.groupingKey === groupingKey,
      )?.placement.groupId;
      if (stage === groupId) return;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    assert.equal(
      stage,
      groupId,
      `Stage-scoped New thread was placed in ${stage ?? "no stage"}`,
    );
  } finally {
    await context.close();
  }
}

export async function verifyNewThreadRouting({
  stack,
  fixture,
  cases = ["project", "stage"],
}) {
  const browser = await chromium.launch();
  try {
    if (cases.includes("project")) {
      await verifyProjectComposerIsStable({ browser, stack, fixture });
    }
    if (cases.includes("stage")) {
      await verifyStagePlacement({ browser, stack, fixture });
    }
  } finally {
    await browser.close();
  }
}

export async function waitForStageCatalog({ bb, cliEnv }) {
  const deadline = Date.now() + 120_000;
  for (;;) {
    try {
      const output = execFileSync(
        bb,
        ["sidebar", "groupings", "--json"],
        { env: cliEnv, encoding: "utf8" },
      );
      if (
        JSON.parse(output).some(
          ({ groupingKey }) => groupingKey === "plugin:thread-stages:stages",
        )
      ) {
        return;
      }
    } catch {
      // Both plugins are loaded; the provider announcement may still be in flight.
    }
    if (Date.now() > deadline) {
      throw new Error("Timed out waiting for the Thread stages catalog");
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}
