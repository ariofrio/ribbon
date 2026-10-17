import assert from "node:assert/strict";
import { SECTION } from "../../screenshots/fixture.mjs";
import { heading, launch, openContext, project, section, sidebar, withPreferenceSaved } from "./sidebar.mjs";

/**
 * With Default sections installed, a section heading sets the projects that
 * start there and a project heading sets its own default, through real menus.
 */
export async function verifyDefaultSectionMenus({ stack, fixture }) {
  const api = fixture.projects.get("atlas-api");
  assert.ok(api, "The fixture is missing atlas-api");
  const defaults = () => JSON.parse(fixture.run(["default-sections", "list", "--json"]));
  const browser = await launch();
  try {
    const context = await openContext(browser);
    const page = await context.newPage();
    await page.goto(stack.serverUrl);
    const list = sidebar(page);
    await list.waitFor({ timeout: 120_000 });

    async function openHeadingActions(scope, label) {
      const header = heading(scope);
      await header.hover();
      await header.getByRole("button", { name: `${label} actions`, exact: true }).click();
    }

    await openHeadingActions(section(page, fixture.section.id), `${SECTION.name} section`);
    await page.getByRole("menuitem", { name: "Default for", exact: true }).hover();
    const saved = page.waitForResponse((response) => response.url().endsWith("/rpc/setDefaultV1"));
    await page.getByRole("menuitemcheckbox", { name: api.name, exact: true }).click();
    assert.equal((await (await saved).json()).ok, true);
    // The menu stays open, so several projects can be ticked in a row.
    await page
      .getByRole("menuitemcheckbox", { name: api.name, exact: true })
      .and(page.locator('[aria-checked="true"]'))
      .waitFor();
    await page.keyboard.press("Escape");
    assert.deepEqual(
      defaults().map(({ projectId, sectionId }) => [projectId, sectionId]),
      [[api.id, fixture.section.id]],
    );

    await openHeadingActions(section(page, fixture.section.id), `${SECTION.name} section`);
    await page.getByRole("menuitem", { name: "Organize" }).hover();
    await withPreferenceSaved(page, "organizationMode", () =>
      page.getByRole("menuitemradio", { name: "By project", exact: true }).click());
    await page.keyboard.press("Escape");

    await openHeadingActions(project(page, api.id), api.name);
    await page.getByRole("menuitem", { name: "Default section", exact: true }).hover();
    const current = page.getByRole("menuitemradio", { name: SECTION.name, exact: true });
    assert.equal(await current.getAttribute("aria-checked"), "true");
    const cleared = page.waitForResponse((response) => response.url().endsWith("/rpc/setDefaultV1"));
    await page.getByRole("menuitemradio", { name: "Threads", exact: true }).click();
    assert.equal((await (await cleared).json()).ok, true);
    assert.deepEqual(defaults(), []);

    await openHeadingActions(project(page, api.id), api.name);
    await page.getByRole("menuitem", { name: "Organize" }).hover();
    await withPreferenceSaved(page, "organizationMode", () =>
      page.getByRole("menuitemradio", { name: "Custom", exact: true }).click());
    await page.keyboard.press("Escape");
    await context.close();
  } finally {
    await browser.close();
  }
}
