import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { AGENT, FEATURED_PROJECT } from "../../screenshots/fixture.mjs";
import { carryTo, heading, launch, link, openContext, pickUp, section, sidebar } from "./sidebar.mjs";

export async function verifyEnvironmentGroups({ stack, fixture }) {
  const project = fixture.projects.get(FEATURED_PROJECT);
  const worktree = join(dirname(project.root), "stage-group-worktree");
  const name = "Stage group worktree";
  const preferences = fixture.runJson(["thread-stages", "prefs", "list"]);
  const overrides = {
    organizationMode: "chronological", environmentGrouping: true,
    chronologicalSort: "alpha", sortDirection: "ascending",
    threadLifecycles: ["active"], hiddenGroups: [],
    collapsedProjects: [], collapsedMachines: [],
    collapsedThreadSections: [], collapsedEnvironments: [],
  };
  const roots = [];
  const destination = fixture.runJson(["thread", "section", "create", "Environment group destination"]);
  execFileSync("git", ["worktree", "add", "--detach", worktree], { cwd: project.root });
  const browser = await launch();
  try {
    for (const stage of ["Active", "Deferred", "Completed"]) {
      for (const number of [1, 2]) {
        const thread = fixture.runJson([
          "thread", "spawn", "--project", project.id,
          "--machine", "screenshots", "--environment", worktree,
          "--provider", `acp-${AGENT.id}`, "--model", AGENT.modelId,
          "--title", `AAA ${stage} environment member ${number}`,
          "--permission-mode", "accept-edits", "--prompt", "Check environment grouping.",
        ]);
        roots.push({ ...thread, stage });
        fixture.run(["thread", "wait", thread.id, "--status", "idle"]);
        fixture.run(["thread", "update", thread.id, "--section", fixture.section.id]);
        fixture.run(["thread-stages", "stage", stage, thread.id]);
      }
    }
    const { environment } = fixture.runJson(["thread", "show", roots[0].id]);
    fixture.run(["environment", "update", environment.id, "--name", name]);
    for (const [key, value] of Object.entries(overrides)) {
      fixture.run(["thread-stages", "prefs", "set", key, JSON.stringify(value)]);
    }
    const rootIds = roots.map(({ id }) => id);
    for (const organization of ["chronological", "project", "machine"]) {
      console.log(`Checking ${organization} environment stage bands`);
      fixture.run(["thread-stages", "prefs", "set", "organizationMode", organization]);
      fixture.run(["thread-stages", "prefs", "set", "chronologicalSort", "alpha"]);
      const context = await openContext(browser, { organization, viewport: { width: 1280, height: 1400 } });
      context.setDefaultTimeout(30_000);
      try {
        const page = await context.newPage();
        await page.goto(stack.serverUrl);
        const list = sidebar(page);
        await list.waitFor({ timeout: 120_000 });
        async function verify(direction = "descending") {
          for (const stage of ["deferred", "completed"]) {
            const more = list.getByRole("button", { name: new RegExp(`^Show \\d+ more ${stage}$`) });
            while (await more.count()) await more.first().click();
          }
          for (const id of rootIds) await link(list, id).waitFor();
          await page.waitForFunction(({ pairs, direction }) => {
            const list = document.querySelector("[data-ribbon-sidebar-root]");
            return pairs.every(([a, b]) => {
              const first = list.querySelector(`[data-thread-id="${a}"]`);
              const second = list.querySelector(`[data-thread-id="${b}"]`);
              if (!first || !second) return false;
              return direction === "ascending"
                ? first.getBoundingClientRect().top < second.getBoundingClientRect().top
                : first.getBoundingClientRect().top > second.getBoundingClientRect().top;
            });
          }, { pairs: [rootIds.slice(0, 2), rootIds.slice(2, 4), rootIds.slice(4, 6)], direction });
          const groups = list.getByText(name, { exact: true })
            .locator('xpath=ancestor::*[@data-sidebar-sticky-group][1]');
          await page.waitForFunction(({ name, rootIds }) => {
            const list = document.querySelector("[data-ribbon-sidebar-root]");
            const names = [...list.querySelectorAll("span")].filter((node) =>
              node.textContent === name && node.children.length === 0);
            return names.length === 3 && names.every((node) => {
              const group = node.closest("[data-sidebar-sticky-group]");
              return rootIds.filter((id) => group.querySelector(`[data-thread-id="${id}"]`)).length === 2;
            });
          }, { name, rootIds });
          const members = await groups.evaluateAll((groups) => groups.map((group) =>
            [...group.querySelectorAll("[data-thread-id]")].map((node) => node.dataset.threadId)));
          assert.equal(members.length, 3);
          for (const ids of members) {
            assert.equal(ids.length, 2);
            assert.equal(new Set(ids.map((id) => roots.find((root) => root.id === id)?.stage)).size, 1);
          }
          const bounds = await Promise.all(roots.map(async (root) => ({
            stage: root.stage, box: await link(list, root.id).boundingBox(),
          })));
          const top = (stage) => Math.min(...bounds.filter((row) => row.stage === stage).map((row) => row.box.y));
          const bottom = (stage) => Math.max(...bounds.filter((row) => row.stage === stage).map((row) => row.box.y + row.box.height));
          assert.ok(bottom("Active") < top("Deferred"));
          assert.ok(bottom("Deferred") < top("Completed"));
        }
        for (const direction of ["ascending", "descending"]) {
          fixture.run(["thread-stages", "prefs", "set", "sortDirection", direction]);
          await verify(direction);
        }
        await page.reload({ waitUntil: "domcontentloaded" });
        await list.waitFor({ timeout: 120_000 });
        await verify();
        if (organization === "chronological") {
          const activeGroup = link(list, roots[0].id)
            .locator('xpath=ancestor::*[@data-sidebar-sticky-group][.//span[text()="Stage group worktree"]][1]');
          await pickUp(page, activeGroup.getByText(name, { exact: true }));
          await carryTo(page, heading(section(page, destination.id)));
          const saved = roots.filter((thread) => thread.stage === "Active").map((thread) =>
            page.waitForResponse((response) => response.url().endsWith("/rpc/updatePlacementV1") &&
              response.request().postDataJSON().threadId === thread.id));
          await page.mouse.up();
          for (const response of await Promise.all(saved)) assert.equal((await response.json()).result.ok, true);
          for (const thread of roots.filter((thread) => thread.stage === "Active")) {
            await link(section(page, destination.id), thread.id).waitFor();
          }
          for (const thread of roots) {
            assert.equal(fixture.runJson(["thread-stages", "show", thread.id]).section.id,
              thread.stage === "Active" ? destination.id : fixture.section.id);
          }
          for (const thread of roots.filter((thread) => thread.stage === "Active")) {
            fixture.run(["thread", "update", thread.id, "--section", fixture.section.id]);
          }
        }
      } finally {
        await context.close();
      }
    }
  } catch (error) {
    console.error(error);
    throw error;
  } finally {
    await browser.close();
    for (const thread of roots) fixture.run(["thread", "archive", thread.id]);
    fixture.run(["thread", "section", "delete", destination.id, "--yes"]);
    for (const key of Object.keys(overrides)) {
      fixture.run(["thread-stages", "prefs", "set", key, JSON.stringify(preferences[key])]);
    }
    execFileSync("git", ["worktree", "remove", "--force", worktree], { cwd: project.root });
  }
}
