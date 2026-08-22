// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  observeDecorations,
  type Decorating,
  type Decoration,
  type Placement,
  type PlacementContext,
} from "./decorate";
import { projectLookup } from "./project-lookup";

const context: PlacementContext = {
  projects: projectLookup([{ id: "proj_a", name: "Storefront" }]),
  unresolved: () => {},
};

/** Stands in for a real placement: bb's own folder, to be replaced. */
const replacing: Placement = {
  id: "replacing",
  setting: "showInComposer",
  find: (root) =>
    Array.from(
      root.querySelectorAll<HTMLElement>('svg[data-icon="Folder"]'),
    ).map((node) => ({
      owner: { kind: "project", id: node.dataset.project ?? "proj_a" },
      className: "size-4",
      replaces: node,
    })),
};

/** Stands in for the rows that carry a project's name and nothing else. */
const resolving: Placement = {
  id: "resolving",
  setting: "showInComposer",
  find: (root, { projects }) =>
    Array.from(root.querySelectorAll<HTMLElement>("[data-bb-named]")).flatMap(
      (node) => {
        const owner = projects.byName(node.getAttribute("data-bb-named") ?? "");
        const folder = node.querySelector<HTMLElement>('svg[data-icon="Folder"]');
        return owner === null || folder === null ? [] : [{ owner, replaces: folder }];
      },
    ),
};

/** Stands in for a placement with nothing of bb's to replace. */
const prepending: Placement = {
  id: "prepending",
  setting: "showInSidebar",
  find: (root) =>
    Array.from(root.querySelectorAll<HTMLElement>("[data-bb-row]")).map(
      (node) => ({
        owner: { kind: "project", id: "proj_a" },
        className: "mr-1",
        prepends: node,
      }),
    ),
};

let running: Decorating | undefined;

afterEach(() => {
  running?.stop();
  running = undefined;
  document.body.innerHTML = "";
});

/**
 * Starts a pass and waits for the first frame, since nothing is written into
 * bb's chrome until one arrives.
 */
async function start(placements: readonly Placement[]) {
  const seen: Array<readonly Decoration[]> = [];
  running = observeDecorations({
    placements,
    context: () => context,
    onChange: (decorations) => seen.push(decorations),
  });
  await vi.waitFor(() => expect(seen.length).toBeGreaterThan(0));
  return seen;
}

function glyph() {
  return document.querySelector<HTMLElement>("svg")!;
}

function target() {
  return document.querySelector<HTMLElement>("[data-icons-decoration]");
}

describe("observeDecorations", () => {
  it("stands in for bb's own glyph rather than crowding in beside it", async () => {
    document.body.innerHTML = `<div><svg data-icon="Folder"></svg><span>Storefront</span></div>`;

    const [decorations] = await start([replacing]);

    expect(decorations).toHaveLength(1);
    expect(target()).toBe(decorations![0]!.target);
    expect(target()?.nextElementSibling).toBe(glyph());
    expect(glyph().style.display).toBe("none");
  });

  it("passes on whether a spot asked for the picker", async () => {
    document.body.innerHTML = `
      <div data-bb-picker><svg data-icon="Folder"></svg></div>
      <div><svg data-icon="Folder" data-project="proj_b"></svg></div>
    `;
    const asking: Placement = {
      id: "asking",
      setting: "showInComposer",
      find: (root) =>
        Array.from(
          root.querySelectorAll<HTMLElement>('svg[data-icon="Folder"]'),
        ).map((node) => ({
          owner: { kind: "project", id: node.dataset.project ?? "proj_a" },
          replaces: node,
          picker: node.parentElement?.hasAttribute("data-bb-picker") === true,
        })),
    };

    const [decorations] = await start([asking]);

    expect(decorations?.map((d) => d.picker)).toEqual([true, false]);
  });

  it("carries the markers a node outside the plugin's own mount needs", async () => {
    document.body.innerHTML = `<div><svg data-icon="Folder"></svg></div>`;

    await start([replacing]);

    expect(target()?.hasAttribute("data-bb-plugin-root")).toBe(true);
    expect(target()?.className).toBe("size-4");
  });

  // bb sizes its folder differently from one surface to the next and mutes it
  // on some; the icon standing in wears what bb chose, or it matches none of
  // them.
  it("hands on the classes bb had on the glyph it replaces", async () => {
    document.body.innerHTML = `
      <svg data-icon="Folder" class="size-3.5 shrink-0 text-muted-foreground"></svg>
    `;

    const [decorations] = await start([replacing]);

    expect(decorations?.[0]?.glyphClassName).toBe(
      "size-3.5 shrink-0 text-muted-foreground",
    );
  });

  it("re-hides bb's glyph when a re-render brings it back", async () => {
    document.body.innerHTML = `<div><svg data-icon="Folder"></svg></div>`;
    await start([replacing]);
    const hidden = glyph();

    // What React does when it re-renders the icon it still believes it owns.
    hidden.style.removeProperty("display");
    document.body.append(document.createElement("div"));
    await vi.waitFor(() => expect(hidden.style.display).toBe("none"));
  });

  it("goes at the head of the row when bb drew nothing to replace", async () => {
    document.body.innerHTML = `<div data-bb-row><span>Storefront</span></div>`;

    await start([prepending]);

    const row = document.querySelector("[data-bb-row]")!;
    expect(row.firstElementChild).toBe(target());
  });

  it("reports the owner each placement worked out", async () => {
    document.body.innerHTML = `
      <svg data-icon="Folder" data-project="proj_b"></svg>
      <div data-bb-row></div>
    `;

    const [decorations] = await start([replacing, prepending]);

    expect(decorations?.map(({ owner }) => owner.id)).toEqual([
      "proj_b",
      "proj_a",
    ]);
  });

  it("mounts once when a re-render leaves the node in place", async () => {
    document.body.innerHTML = `<div><svg data-icon="Folder"></svg></div>`;
    await start([replacing]);

    document.body.append(document.createElement("p"));
    await vi.waitFor(() => expect(document.querySelector("p")).not.toBeNull());

    expect(document.querySelectorAll("[data-icons-decoration]")).toHaveLength(1);
  });

  it("says nothing when a mutation changes none of its spots", async () => {
    document.body.innerHTML = `<div><svg data-icon="Folder"></svg></div>`;
    const seen = await start([replacing]);
    const reported = seen.length;

    document.body.append(document.createElement("p"));
    await vi.waitFor(() => expect(document.querySelector("p")).not.toBeNull());
    await new Promise((resolve) => requestAnimationFrame(resolve));

    expect(seen.length).toBe(reported);
  });

  it("keeps a spot's key across passes, so its icon is never remounted", async () => {
    document.body.innerHTML = `<div><svg data-icon="Folder"></svg></div>`;
    const seen = await start([replacing]);
    const first = seen.at(-1)![0]!.key;

    document.body.insertAdjacentHTML(
      "afterbegin",
      `<svg data-icon="Folder" data-project="proj_b"></svg>`,
    );
    await vi.waitFor(() => expect(seen.at(-1)).toHaveLength(2));

    expect(seen.at(-1)!.map(({ key }) => key)).toContain(first);
    expect(new Set(seen.at(-1)!.map(({ key }) => key)).size).toBe(2);
  });

  // bb turns the composer's folder into a FolderPlus when the project is
  // cleared, and React edits the icon in place rather than replacing it.
  it("gives bb its glyph back when it stops being a folder", async () => {
    document.body.innerHTML = `<div><svg data-icon="Folder" style="display: inline"></svg></div>`;
    const seen = await start([replacing]);
    const hidden = glyph();

    hidden.setAttribute("data-icon", "FolderPlus");
    await vi.waitFor(() => expect(seen.at(-1)).toHaveLength(0));

    expect(hidden.style.display).toBe("inline");
    expect(target()).toBeNull();
  });

  // Writing into bb's chrome from the call bb is watching is what costs the
  // neighbouring plugin its portal, so not even the first pass may do it.
  it("writes nothing into bb's chrome before a frame arrives", async () => {
    document.body.innerHTML = `<div><svg data-icon="Folder"></svg></div>`;

    running = observeDecorations({
      placements: [replacing],
      context: () => context,
      onChange: () => {},
    });

    expect(target()).toBeNull();
    await vi.waitFor(() => expect(target()).not.toBeNull());
  });

  // The project list lands after the first pass, and the rows that carry only
  // a name find nothing until it does.
  it("passes again when asked, for a change only the plugin knows about", async () => {
    document.body.innerHTML = `<span data-bb-named="Storefront"><svg data-icon="Folder"></svg></span>`;
    let known = projectLookup([]);
    running = observeDecorations({
      placements: [resolving],
      context: () => ({ projects: known, unresolved: () => {} }),
      onChange: () => {},
    });
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(target()).toBeNull();

    known = projectLookup([{ id: "proj_a", name: "Storefront" }]);
    running.refresh();

    await vi.waitFor(() => expect(target()).not.toBeNull());
  });

  // bb centres its glyph inside a pill that baseline-aligns everything else,
  // and it does that on the glyph, which is the flex item. Standing in front
  // of it makes the target the flex item instead, so the target has to carry
  // the same alignment or the icon rides above the word beside it.
  it("stands where bb's glyph stood in a row that aligns them differently", async () => {
    document.body.innerHTML = `
      <span style="display: inline-flex; align-items: baseline">
        <svg data-icon="Folder" style="align-self: center"></svg><span>Storefront</span>
      </span>
    `;

    await start([replacing]);

    expect(target()?.style.alignSelf).toBe("center");
  });

  it("leaves the row's own alignment alone when bb overrode nothing", async () => {
    document.body.innerHTML = `<div><svg data-icon="Folder"></svg></div>`;

    await start([replacing]);

    expect(target()?.style.alignSelf).toBe("");
  });

  it("takes its own nodes back out and unhides bb's on the way", async () => {
    document.body.innerHTML = `<div><svg data-icon="Folder"></svg></div>`;
    await start([replacing]);
    const hidden = glyph();

    running?.stop();
    running = undefined;

    expect(hidden.style.display).toBe("");
    expect(target()).toBeNull();
  });
});
