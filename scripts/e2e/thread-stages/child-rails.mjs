import assert from "node:assert/strict";
import { AGENT } from "../../screenshots/fixture.mjs";
import { launch, link, openContext, sidebar, spawnChild, STAGES } from "./sidebar.mjs";

const PARENT = "Replace the legacy filter drawer";

// Child threads hang from their parent by a bar in their own ring column,
// which stands in for a hidden Active ring and parts around a shown one, or by a
// tree whose branches reach each ring, or a small hollow node while it hides.
export async function verifyChildRails({ stack, fixture, cases }) {
  const parent = fixture.threads.get(PARENT);
  const project = fixture.projects.get("atlas-web");
  fixture.run(["sidebar", "place", parent.id, "--to", `${STAGES}/Active`]);
  const setLines = (value) => fixture.run(["plugin", "config", "thread-stages", "set", "childThreadLines", value]);
  setLines("Bar");
  const children = ["First child rail", "Last child rail"].map((title) =>
    spawnChild(fixture, { parent, project, title, AGENT }));
  const browser = await launch();
  try {
    const context = await openContext(browser);
    const page = await context.newPage();
    page.setDefaultTimeout(15_000);
    await page.goto(new URL(`/projects/${project.id}/threads/${parent.id}`, stack.serverUrl).href);
    const list = sidebar(page);
    await list.waitFor({ timeout: 120_000 });
    await page.waitForFunction((ids) => ids.every((id) =>
      document.querySelector(`[data-ribbon-sidebar-root] [data-thread-id="${id}"] [data-ribbon-sidebar-rail]`)),
    children.map((child) => child.id));
    const [first, last] = await page.evaluate((ids) => ids
      .map((id) => ({ id, top: document.querySelector(`[data-ribbon-sidebar-root] [data-thread-id="${id}"]`).getBoundingClientRect().top }))
      .sort((a, b) => a.top - b.top), children.map((child) => child.id));
    // Selecting the last child shows its Active ring, while the first child's
    // stays hidden at rest.
    await link(list, last.id).click();
    await page.mouse.move(1200, 780);
    await page.waitForFunction((id) => getComputedStyle(
      document.querySelector(`[data-ribbon-sidebar-root] [data-thread-id="${id}"] [data-ribbon-sidebar-icon-slot]`),
    ).opacity === "1", last.id);
    const threads = { page, list, fixture, parent, first, last, setLines };
    if (cases.includes("bar")) await verifyBar(threads);
    if (cases.includes("tree")) await verifyTree(threads);
    await context.close();
  } finally {
    await browser.close();
    for (const child of children) fixture.run(["thread", "archive", child.id]);
    fixture.run(["sidebar", "place", parent.id, "--to", `${STAGES}/Deferred`]);
    setLines("Tree");
  }
}

async function verifyBar({ page, list, parent, first, last }) {
  const measure = () => page.evaluate(({ parentId, ids }) => {
    const box = (node) => {
      const { top, bottom, left, right } = node.getBoundingClientRect();
      return { top, bottom, left, right };
    };
    const row = (id) => {
      const li = document.querySelector(`[data-ribbon-sidebar-root] [data-thread-id="${id}"]`);
      const slot = li.querySelector("[data-ribbon-sidebar-icon-slot]");
      const icon = box(slot.querySelector("svg"));
      const x = (icon.left + icon.right) / 2;
      const y = (icon.top + icon.bottom) / 2;
      // The stage ring's outer edge: radius 8.75 plus half its 2-unit stroke, on a 24-unit grid.
      const radius = ((icon.right - icon.left) * 9.75) / 24;
      return {
        row: box(li),
        ring: { top: y - radius, bottom: y + radius },
        ringCenter: { x, y },
        ringOpacity: Number(getComputedStyle(slot).opacity),
        bars: [...li.querySelectorAll("[data-ribbon-sidebar-rail]")]
          .filter((bar) => Number(getComputedStyle(bar).opacity) > 0)
          .map(box),
      };
    };
    return { parent: row(parentId), first: row(ids[0]), last: row(ids[1]) };
  }, { parentId: parent.id, ids: [first.id, last.id] });
  // Whether the drawn segments, joined end to end, run unbroken from top to bottom.
  const covers = (bars, top, bottom) => {
    let reach = top;
    for (const bar of [...bars].sort((a, b) => a.top - b.top)) {
      if (bar.top <= reach + 0.01) reach = Math.max(reach, bar.bottom);
    }
    return reach >= bottom;
  };
  // Drawn bars stop at least 2px short of a shown ring, and reach within 3px of it.
  const clearOf = (bars, ring) => bars.every((bar) => bar.bottom <= ring.top - 2 || bar.top >= ring.bottom + 2);

  await page.mouse.move(1200, 780);
  const rest = await measure();
  assert.equal(rest.parent.bars.length, 0, "The parent row draws no bar of its own");
  assert.equal(rest.first.ringOpacity, 0, "The unselected Active child hides its ring at rest");
  assert.equal(rest.last.ringOpacity, 1, "The selected child shows its ring");
  for (const child of [rest.first, rest.last]) {
    for (const bar of child.bars) {
      assert.ok(
        Math.abs((bar.left + bar.right) / 2 - child.ringCenter.x) <= 0.75,
        `The bar sat at ${(bar.left + bar.right) / 2}px, not in the ring column at ${child.ringCenter.x}px`,
      );
    }
  }
  assert.ok(covers(rest.first.bars, rest.first.ringCenter.y - 6.5, rest.first.ringCenter.y + 6.5), "The bar runs through the hidden ring's slot");
  assert.ok(Math.min(...rest.first.bars.map((bar) => bar.top)) >= rest.first.ringCenter.y - 9.5,
    "The bar starts at the first child's ring, not above it toward the parent");
  assert.ok(covers(rest.first.bars, rest.first.ringCenter.y, rest.last.row.top), "The bar crosses the gap from the first child into the last");
  assert.ok(clearOf(rest.last.bars, rest.last.ring), "The bar parts around the selected child's ring");
  assert.ok(covers(rest.last.bars, rest.last.row.top, rest.last.ring.top - 3), "The bar reaches the last child's ring");
  assert.ok(Math.max(...rest.last.bars.map((bar) => bar.bottom)) <= rest.last.ring.top, "The bar ends at the last child's ring");

  await link(list, first.id).hover();
  const hovered = await measure();
  assert.equal(hovered.first.ringOpacity, 1, "Hover reveals the Active ring");
  assert.ok(clearOf(hovered.first.bars, hovered.first.ring), "The bar parts around the revealed ring");
  assert.ok(covers(hovered.first.bars, hovered.first.ring.bottom + 3, hovered.last.row.top),
    "Below the revealed ring the bar still runs on to the last child");

  await page.mouse.move(1200, 780);
  assert.ok(await tabToChild(page, list, parent, first), "Keyboard navigation reaches the first child");
  const keyboard = await measure();
  assert.equal(keyboard.first.ringOpacity, 1, "Keyboard focus reveals the Active ring");
  assert.ok(clearOf(keyboard.first.bars, keyboard.first.ring), "The bar parts around the focused row's ring");
  await page.evaluate(() => document.activeElement?.blur());
}

async function verifyTree({ page, list, parent, first, last, setLines }) {
  setLines("Tree");
  await page.waitForFunction((ids) => ids.every((id) =>
    document.querySelector(`[data-ribbon-sidebar-root] [data-thread-id="${id}"] [data-ribbon-sidebar-tree] path`)),
  [first.id, last.id]);
  // Which rows have the tree draw a visible line or node through a point,
  // asked of the SVG's own geometry at that point on screen.
  const drawn = (points) => page.evaluate(({ parentId, ids, points }) => {
    const visible = (node) => {
      for (let current = node; current && current.tagName !== "svg"; current = current.parentElement) {
        if (Number(getComputedStyle(current).opacity) === 0) return false;
      }
      return true;
    };
    const rows = Object.fromEntries(["parent", "first", "last"].map((key, index) => {
      const li = document.querySelector(`[data-ribbon-sidebar-root] [data-thread-id="${[parentId, ...ids][index]}"]`);
      const icon = li.querySelector("[data-ribbon-sidebar-icon-slot] svg").getBoundingClientRect();
      return [key, { li, x: (icon.left + icon.right) / 2, y: (icon.top + icon.bottom) / 2, top: li.getBoundingClientRect().top }];
    }));
    return points.map(({ row, dx = 0, dy = 0, fromTop }) => {
      const at = rows[row];
      const x = at.x + dx;
      const y = fromTop === undefined ? at.y + dy : at.top + fromTop;
      return [...document.querySelectorAll("[data-ribbon-sidebar-root] [data-ribbon-sidebar-tree] :is(path, circle)")]
        .some((shape) => visible(shape) &&
          shape.isPointInStroke(new DOMPoint(x, y).matrixTransform(shape.getScreenCTM().inverse())));
    });
  }, { parentId: parent.id, ids: [first.id, last.id], points });
  // The ring's outer edge is 6.5px from its centre, and each line runs half a
  // pixel right of and below the centre it follows.
  const probes = [
    { row: "first", dx: -8, dy: 0.5 },   // 0: the branch just short of the first child's ring
    { row: "first", dx: -4, dy: 0.5 },   // 1: inside that ring, on to its hidden-ring node
    { row: "first", dx: -1.5, dy: 0.5 }, // 2: the node's left edge
    { row: "last", dx: -8, dy: 0.5 },    // 3: the branch just short of the selected ring
    { row: "last", dx: -4, dy: 0.5 },    // 4: inside the selected ring
    { row: "parent", dx: 0.5, dy: 10 },  // 5: the parent's line below its ring
  ];

  await page.mouse.move(1200, 780);
  const rest = await drawn(probes);
  assert.deepEqual(rest.slice(0, 5), [true, true, true, true, false],
    "At rest, branches reach each ring's edge, and on into a node where the ring is hidden");
  assert.equal(rest[5], true, "The parent's line drops from its ring");

  await link(list, first.id).hover();
  const hovered = await drawn(probes.slice(0, 3));
  assert.deepEqual(hovered, [true, false, false], "Hover reveals the ring where the branch stops, and the node gives way to it");

  await page.mouse.move(1200, 780);
  assert.ok(await tabToChild(page, list, parent, first), "Keyboard navigation reaches the first child");
  assert.deepEqual(await drawn(probes.slice(0, 3)), [true, false, false], "Keyboard focus reveals the ring where the branch stops");
  await page.evaluate(() => document.activeElement?.blur());
}

/**
 * Tabs from the parent's link to the first child's, past the parent's own
 * controls. Starting at the parent rather than the page keeps the walk short
 * however many rows other suites have added above.
 */
async function tabToChild(page, list, parent, first) {
  await link(list, parent.id).focus();
  const target = link(list, first.id);
  for (let index = 0; index < 20; index += 1) {
    await page.keyboard.press("Tab");
    if (await target.evaluate((node) => document.activeElement === node)) return true;
  }
  return false;
}
