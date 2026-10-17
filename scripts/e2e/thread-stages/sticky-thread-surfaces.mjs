import assert from "node:assert/strict";
import {
  AGENT,
  FEATURED_PROJECT,
  FEATURED_THREAD,
  THREADS,
} from "../../screenshots/fixture.mjs";
import {
  launch,
  openContext,
  parentAnswered,
  row,
  sidebar,
  spawnChild,
} from "./sidebar.mjs";

export async function verifyStickyThreadSurfaces({ stack, fixture, cases }) {
  const parent = fixture.threads.get(FEATURED_THREAD);
  const project = fixture.projects.get(FEATURED_PROJECT);
  fixture.run(["thread-stages", "stage", "Active", parent.id]);
  const children = [];
  const browser = await launch();
  try {
    for (let index = 0; index < 3; index++) {
      children.push(
        spawnChild(fixture, {
          parent,
          project,
          title: `Sticky surface child ${index}`,
          AGENT,
        }),
      );
    }
    await parentAnswered(fixture, parent, children.at(-1));
    for (const testCase of cases) {
      const colorScheme = testCase.endsWith("dark") ? "dark" : "light";
      const selected = testCase.startsWith("selected");
      const unselected = testCase.startsWith("unselected");
      const context = await openContext(browser, {
        viewport: { width: 1280, height: 400 },
        colorScheme,
        reducedMotion: "reduce",
      });
      await context.addInitScript(
        (theme) => localStorage.setItem("bb.theme", theme),
        colorScheme,
      );
      const page = await context.newPage();
      try {
        const otherRoot = THREADS.find(
          (spec) => spec.project && spec.project !== FEATURED_PROJECT,
        );
        const opened = unselected
          ? fixture.threads.get(otherRoot.title)
          : selected
            ? parent
            : children.at(-1);
        const openedProject = unselected
          ? fixture.projects.get(otherRoot.project)
          : project;
        await page.goto(
          new URL(
            `/projects/${openedProject.id}/threads/${opened.id}`,
            stack.serverUrl,
          ).href,
          { waitUntil: "domcontentloaded", timeout: 120_000 },
        );
        const list = sidebar(page);
        await list.waitFor({ timeout: 120_000 });
        const target = row(list, parent.id);
        if (unselected) {
          await revealWindowedRow(list, parent.id);
          await page.waitForFunction((parentId) => {
            const parent = document.querySelector(
              `[data-ribbon-sidebar-root] [data-thread-id="${parentId}"]`,
            );
            const wrapper = parent?.closest("[data-sidebar-windowed-item]");
            if (!wrapper) return false;
            const contain = getComputedStyle(wrapper).contain;
            // Browsers serialize layout + style + paint as "content".
            return (
              contain === "content" || contain.split(" ").includes("paint")
            );
          }, parent.id);
        }
        const childIds = children.map((child) => child.id);
        await page.waitForFunction(
          (ids) =>
            ids.every((id) =>
              document.querySelector(
                `[data-ribbon-sidebar-root] [data-thread-id="${id}"]`,
              ),
            ),
          childIds,
        );
        const overlapChildId = await list.evaluate(
          (node, ids) =>
            ids
              .map((id) => ({
                id,
                top: node
                  .querySelector(`[data-thread-id="${id}"]`)
                  .getBoundingClientRect().top,
              }))
              .sort((left, right) => left.top - right.top)[0].id,
          childIds,
        );
        // A translucent accent, as in the reported theme, must tint the
        // sidebar rather than revealing the scrolling child's text.
        await list.evaluate((node) => {
          node.style.setProperty("--sidebar-accent", "rgba(71, 82, 102, 0.25)");
        });
        await target.evaluate((node, childId) => {
          const scroller = node.closest('[data-sidebar="content"]');
          const child = scroller.querySelector(`[data-thread-id="${childId}"]`);
          const top =
            scroller.getBoundingClientRect().top +
            parseFloat(getComputedStyle(node).top);
          scroller.scrollTop += child.getBoundingClientRect().top - top - 4;
        }, overlapChildId);
        await page.waitForFunction(
          ([parentId, childId]) => {
            const root = document.querySelector("[data-ribbon-sidebar-root]");
            const parent = root
              .querySelector(`[data-thread-id="${parentId}"]`)
              .getBoundingClientRect();
            const child = root
              .querySelector(`[data-thread-id="${childId}"]`)
              .getBoundingClientRect();
            return child.top > parent.top && child.top < parent.bottom;
          },
          [parent.id, overlapChildId],
        );
        const verifySurface = async (state) => {
          const surface = await target.evaluate((node) => {
            const style = getComputedStyle(node);
            return {
              image: style.backgroundImage,
              color: style.backgroundColor,
            };
          });
          // Resolve the opaque sidebar token in the same browser, without
          // depending on a theme's color notation or on Tailwind classes.
          const base = await target.evaluate((node) => {
            const probe = document.createElement("span");
            probe.style.backgroundColor = "var(--sidebar)";
            node.append(probe);
            const color = getComputedStyle(probe).backgroundColor;
            probe.remove();
            return color;
          });
          assert.ok(
            surface.color === base ||
              surface.image.endsWith(`linear-gradient(${base}, ${base})`),
            `${testCase} ${state}: the sticky surface covers scrolling children (${JSON.stringify(surface)})`,
          );
        };
        if (selected) {
          await page.mouse.move(1000, 350);
          await verifySurface("selected");
        } else {
          await target.hover();
          await verifySurface("hovered");
          await target
            .getByRole("button", { name: "Thread actions", exact: true })
            .click();
          await page
            .getByRole("menuitem", { name: "Rename", exact: true })
            .waitFor();
          await page.mouse.move(1000, 350);
          await verifySurface("menu open");
          await page
            .getByRole("menuitem", { name: "Rename", exact: true })
            .click();
          const editor = target.getByRole("textbox");
          await editor.waitFor();
          await editor.focus();
          await page.mouse.move(1000, 350);
          await verifySurface("rename focused");
          await page.keyboard.press("Escape");
          await target.locator("a[data-sidebar-rename-anchor]").focus();
          await verifySurface("keyboard focus");
        }
        console.log(`${testCase}: scrolling descendants stay covered`);
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
    for (const child of children)
      fixture.run(["thread", "delete", child.id, "--yes"]);
  }
}


// Unselected rows can be unrealized. Bring the tested subtree into view
// before asserting its containment and the surface over its children.
async function revealWindowedRow(list, threadId) {
  await list.page().waitForFunction(id => {
    const root = document.querySelector("[data-ribbon-sidebar-root]");
    return root?.querySelector(`[data-thread-id="${id}"], [data-sidebar-windowed-nav*="${id}:"]`);
  }, threadId);
  const scroller = list.locator('xpath=ancestor::*[@data-sidebar="content"]');
  const step = await scroller.evaluate(node => Math.max(1, node.clientHeight / 2));
  const passes = await scroller.evaluate((node, step) => Math.ceil(node.scrollHeight / step) + 2, step);
  for (let pass = 0; pass < passes; pass++) {
    await scroller.evaluate((node, top) => new Promise(resolve => {
      const next = Math.min(top, node.scrollHeight - node.clientHeight);
      if (node.scrollTop === next) return requestAnimationFrame(resolve);
      node.addEventListener("scroll", () => requestAnimationFrame(resolve), { once: true });
      node.scrollTop = next;
    }), pass * step);
    const target = row(list, threadId);
    if (await target.count()) {
      await target.evaluate(node => node.closest("[data-sidebar-windowed-item]").scrollIntoView({ block: "start" }));
      return;
    }
  }
  throw new Error(`Could not reveal sticky parent ${threadId}`);
}
