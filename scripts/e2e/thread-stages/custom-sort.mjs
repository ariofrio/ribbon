import assert from "node:assert/strict";
import { FEATURED_PROJECT, FEATURED_THREAD, THREADS } from "../../screenshots/fixture.mjs";
import {
  heading, launch, link, openContext, project, rowOrder, section, sidebar, STAGES,
  withPreferenceSaved,
} from "./sidebar.mjs";

export async function verifyCustomSort({ stack, fixture, cases }) {
  const preferences = fixture.runJson(["thread-stages", "prefs", "list"]);
  const stages = fixture.runJson(["thread-stages", "list"]);
  for (const thread of fixture.threads.values()) {
    fixture.run(["thread-stages", "place", thread.id, "--to", `${STAGES}/Active`]);
  }
  const browser = await launch();
  try {
    fixture.run(["thread-stages", "prefs", "set", "environmentGrouping", "false"]);
    for (const testCase of cases) {
      for (const organization of ["chronological", "project"]) {
        console.log(`Checking Custom sort: ${testCase}/${organization}`);
        fixture.run(["thread-stages", "prefs", "set", "organizationMode", organization]);
        const compact = testCase === "compact";
        const context = await openContext(browser, {
          organization,
          viewport: compact ? { width: 600, height: 900 } : { width: 1280, height: 900 },
        });
        try {
          const page = await context.newPage();
          const featured = fixture.threads.get(FEATURED_THREAD);
          const featuredProject = fixture.projects.get(FEATURED_PROJECT);
          await page.goto(new URL(`/projects/${featuredProject.id}/threads/${featured.id}`, stack.serverUrl).href);
          async function openSidebar() {
            await sidebar(page).waitFor({ timeout: 120_000 });
            if (compact) {
              const exposed = await sidebar(page).evaluate((root) => {
                const box = root.getBoundingClientRect();
                return root.contains(document.elementFromPoint(box.x + 40, box.y + box.height / 2));
              });
              if (!exposed) await page.getByRole("button", { name: /^Toggle sidebar/ }).click();
            }
          }
          await openSidebar();
          const group = organization === "project"
            ? project(page, featuredProject.id)
            : section(page, fixture.section.id);
          await link(group, featured.id).waitFor({ timeout: 120_000 });
          await group.locator("[data-thread-id]").nth(1).waitFor({ timeout: 120_000 });
          const original = await rowOrder(group);
          assert.ok(original.length >= 2);
          const titles = new Map([...fixture.threads].map(([title, thread]) => [thread.id, title]));
          const alphabetical = [...original].sort((left, right) => titles.get(left).localeCompare(titles.get(right)));

          async function openSort() {
            await openSidebar();
            const header = heading(group);
            await header.hover();
            await header.getByRole("button", { name: / actions$/ }).click();
            const trigger = page.getByRole("menuitem", { name: "Sort by", exact: true });
            if (compact) await trigger.click();
            else {
              await trigger.focus();
              await page.keyboard.press("ArrowRight");
            }
            return page.getByRole("group", { name: "Sort", exact: true });
          }

          async function closeSort() {
            await page.keyboard.press("Escape");
            if (!compact) await page.keyboard.press("Escape");
            await page.getByRole("group", { name: "Sort", exact: true }).waitFor({ state: "hidden" });
          }

          async function assertCustom(menu) {
            const custom = menu.getByRole("menuitemradio", { name: "Custom", exact: true });
            await custom.waitFor({ timeout: 3_000 });
            const check = custom.locator("svg");
            assert.ok(await check.evaluate((node) => {
              const style = getComputedStyle(node);
              const box = node.getBoundingClientRect();
              return style.visibility === "visible" && box.width > 0 && box.height > 0;
            }), "Custom has a visible selection mark");
            assert.equal(await menu.getByRole("menuitemradio", { name: "Updated at", exact: true }).locator("svg").count(), 0);
          }

          let menu = await openSort();
          await assertCustom(menu);
          await withPreferenceSaved(page, "chronologicalSort", () => menu.getByRole("menuitemradio", { name: "Alphabetical", exact: true }).click());
          await page.waitForFunction(({ groupId, byProject, alphabetical }) => {
            const root = document.querySelector(`[data-ribbon-sidebar-root] [${byProject ? "data-sidebar-project-id" : "data-sidebar-section-id"}="${groupId}"]`);
            const ids = [...root.querySelectorAll("[data-thread-id]")].map((node) => node.dataset.threadId);
            return JSON.stringify(ids) === JSON.stringify(alphabetical);
          }, { groupId: organization === "project" ? featuredProject.id : fixture.section.id, byProject: organization === "project", alphabetical });
          await closeSort();
          menu = await openSort();
          await withPreferenceSaved(page, "chronologicalSort", () => menu.getByRole("menuitemradio", { name: "Custom", exact: true }).click());
          await assertCustom(menu);
          await closeSort();
          assert.deepEqual(await rowOrder(group), original, "Custom restores saved positions");
          await page.reload();
          await openSidebar();
          await assertCustom(await openSort());
          assert.deepEqual(await rowOrder(group), original, "Custom survives reload");
        } finally {
          await context.close();
        }
      }
    }
  } finally {
    await browser.close();
    for (const key of ["organizationMode", "environmentGrouping", "chronologicalSort", "sortDirection"]) {
      fixture.run(["thread-stages", "prefs", "set", key, JSON.stringify(preferences[key])]);
    }
    for (const spec of THREADS) {
      const thread = fixture.threads.get(spec.title);
      const stage = stages.find((row) => row.id === thread.id)?.pluginGroups
        .find((group) => group.pluginId === "thread-stages" && group.groupingId === "stages")?.groupId;
      if (stage) fixture.run(["thread-stages", "place", thread.id, "--to", `${STAGES}/${stage}`]);
    }
  }
}
