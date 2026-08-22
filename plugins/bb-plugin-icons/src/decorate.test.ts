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
};

/** Stands in for a real placement: bb's own glyph, to be replaced. */
const replacing: Placement = {
  id: "replacing",
  setting: "showInComposer",
  find: (root) =>
    Array.from(root.querySelectorAll<HTMLElement>("[data-bb-glyph]")).map(
      (node) => ({
        owner: { kind: "project", id: node.dataset.project ?? "proj_a" },
        className: "size-4",
        replaces: node,
      }),
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

function start(placements: readonly Placement[]) {
  const seen: Array<readonly Decoration[]> = [];
  running = observeDecorations({
    placements,
    context: () => context,
    onChange: (decorations) => seen.push(decorations),
  });
  return seen;
}

function glyph() {
  return document.querySelector<HTMLElement>("[data-bb-glyph]")!;
}

function target() {
  return document.querySelector<HTMLElement>("[data-icons-decoration]");
}

describe("observeDecorations", () => {
  it("stands in for bb's own glyph rather than crowding in beside it", () => {
    document.body.innerHTML = `<div><svg data-bb-glyph></svg><span>Storefront</span></div>`;

    const [decorations] = start([replacing]);

    expect(decorations).toHaveLength(1);
    expect(target()).toBe(decorations![0]!.target);
    expect(target()?.nextElementSibling).toBe(glyph());
    expect(glyph().style.display).toBe("none");
  });

  it("carries the markers a node outside the plugin's own mount needs", () => {
    document.body.innerHTML = `<div><svg data-bb-glyph></svg></div>`;

    start([replacing]);

    expect(target()?.hasAttribute("data-bb-plugin-root")).toBe(true);
    expect(target()?.className).toBe("size-4");
  });

  it("goes at the head of the row when bb drew nothing to replace", () => {
    document.body.innerHTML = `<div data-bb-row><span>Storefront</span></div>`;

    start([prepending]);

    const row = document.querySelector("[data-bb-row]")!;
    expect(row.firstElementChild).toBe(target());
  });

  it("reports the owner each placement worked out", () => {
    document.body.innerHTML = `
      <svg data-bb-glyph data-project="proj_b"></svg>
      <div data-bb-row></div>
    `;

    const [decorations] = start([replacing, prepending]);

    expect(decorations?.map(({ owner }) => owner.id)).toEqual([
      "proj_b",
      "proj_a",
    ]);
  });

  it("mounts once when a re-render leaves the node in place", async () => {
    document.body.innerHTML = `<div><svg data-bb-glyph></svg></div>`;
    start([replacing]);

    document.body.append(document.createElement("p"));
    await vi.waitFor(() => expect(document.querySelector("p")).not.toBeNull());

    expect(document.querySelectorAll("[data-icons-decoration]")).toHaveLength(1);
  });

  it("says nothing when a mutation changes none of its spots", async () => {
    document.body.innerHTML = `<div><svg data-bb-glyph></svg></div>`;
    const seen = start([replacing]);
    const reported = seen.length;

    document.body.append(document.createElement("p"));
    await vi.waitFor(() => expect(document.querySelector("p")).not.toBeNull());
    await new Promise((resolve) => requestAnimationFrame(resolve));

    expect(seen.length).toBe(reported);
  });

  it("keeps a spot's key across passes, so its icon is never remounted", async () => {
    document.body.innerHTML = `<div><svg data-bb-glyph></svg></div>`;
    const seen = start([replacing]);
    const first = seen.at(-1)![0]!.key;

    document.body.insertAdjacentHTML(
      "afterbegin",
      `<svg data-bb-glyph data-project="proj_b"></svg>`,
    );
    await vi.waitFor(() => expect(seen.at(-1)).toHaveLength(2));

    expect(seen.at(-1)!.map(({ key }) => key)).toContain(first);
    expect(new Set(seen.at(-1)!.map(({ key }) => key)).size).toBe(2);
  });

  it("gives bb its glyph back when the spot stops being one", async () => {
    document.body.innerHTML = `<div><svg data-bb-glyph style="display: inline"></svg></div>`;
    const seen = start([replacing]);
    const hidden = glyph();

    hidden.removeAttribute("data-bb-glyph");
    await vi.waitFor(() => expect(seen.at(-1)).toHaveLength(0));

    expect(hidden.style.display).toBe("inline");
    expect(target()).toBeNull();
  });

  it("takes its own nodes back out and unhides bb's on the way", () => {
    document.body.innerHTML = `<div><svg data-bb-glyph></svg></div>`;
    start([replacing]);
    const hidden = glyph();

    running?.stop();
    running = undefined;

    expect(hidden.style.display).toBe("");
    expect(target()).toBeNull();
  });
});
