// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { observeSidebarIconAnchors, type SidebarAnchor } from "./sidebar-dom";

/**
 * bb's own sidebar group, as captured from a running bb. Every group is one of
 * these; what differs is the wrapper bb puts around it, if any.
 */
function stickyGroup(label: string) {
  return `
    <div data-sidebar-sticky-group="">
      <div role="button" data-sidebar="group-label" data-sidebar-sticky-tier="label">
        <span class="relative z-10 flex min-w-0 flex-1 items-center gap-1 text-left">
          <span class="min-w-0 truncate" title="${label}">${label}</span>
          <button type="button" aria-label="Collapse ${label} section"></button>
        </span>
        <span class="relative z-20 inline-flex h-6 shrink-0 items-center"></span>
      </div>
      <div class="mt-1"></div>
    </div>
  `;
}

/**
 * A project header and a section header differ only in which id attribute
 * their wrapper carries, and the icon goes at the head of the same label row
 * in both.
 */
function groupHeader(attribute: string, id: string, label: string) {
  return `<div ${attribute}="${id}">${stickyGroup(label)}</div>`;
}

/**
 * bb's Organize → By project list: one wrapper per project, and the personal
 * project's group left unwrapped among them, labelled "Threads".
 */
function projectList(...groups: string[]) {
  return `<div class="space-y-4">${groups.join("")}</div>`;
}

let stop: (() => void) | undefined;

afterEach(() => {
  stop?.();
  stop = undefined;
  document.body.innerHTML = "";
});

function start() {
  const seen: SidebarAnchor[][] = [];
  stop = observeSidebarIconAnchors((anchors) => seen.push(anchors));
  return seen;
}

describe("observeSidebarIconAnchors", () => {
  it("finds a project header and a section header, and names each owner", () => {
    document.body.innerHTML = `
      ${groupHeader("data-sidebar-project-id", "proj_a", "Storefront")}
      ${groupHeader("data-sidebar-section-id", "sec_b", "Example")}
    `;

    const seen = start();

    expect(seen.at(-1)?.map(({ owner, name }) => ({ ...owner, name }))).toEqual([
      { kind: "project", id: "proj_a", name: "Storefront" },
      { kind: "section", id: "sec_b", name: "Example" },
    ]);
  });

  it("mounts at the head of the label row, before the title", () => {
    document.body.innerHTML = groupHeader(
      "data-sidebar-project-id",
      "proj_a",
      "Storefront",
    );

    const [anchor] = start().at(-1)!;
    const row = document.querySelector(
      '[data-sidebar="group-label"] > span',
    ) as HTMLElement;

    expect(row.firstElementChild).toBe(anchor!.target);
    expect(anchor!.target.nextElementSibling?.getAttribute("title")).toBe(
      "Storefront",
    );
  });

  it("carries the scope markers a plugin needs outside its own mount", () => {
    document.body.innerHTML = groupHeader(
      "data-sidebar-project-id",
      "proj_a",
      "Storefront",
    );

    const [anchor] = start().at(-1)!;

    expect(anchor!.target.hasAttribute("data-bb-plugin-root")).toBe(true);
    expect(anchor!.target.hasAttribute("data-icons-sidebar-root")).toBe(true);
  });

  it("reports again when bb swaps the sidebar for another organize mode", async () => {
    document.body.innerHTML = groupHeader(
      "data-sidebar-project-id",
      "proj_a",
      "Storefront",
    );
    const seen = start();

    document.body.innerHTML = groupHeader(
      "data-sidebar-section-id",
      "sec_b",
      "Example",
    );
    await vi.waitFor(() =>
      expect(seen.at(-1)?.map(({ owner }) => owner)).toEqual([
        { kind: "section", id: "sec_b" },
      ]),
    );
  });

  it("mounts once when a re-render leaves the header in place", async () => {
    document.body.innerHTML = groupHeader(
      "data-sidebar-project-id",
      "proj_a",
      "Storefront",
    );
    const seen = start();
    const row = document.querySelector(
      '[data-sidebar="group-label"] > span',
    ) as HTMLElement;

    row.append(document.createElement("span"));
    await vi.waitFor(() => expect(seen.length).toBeGreaterThan(0));

    expect(row.querySelectorAll("[data-icons-sidebar-root]")).toHaveLength(1);
  });

  it("takes its own nodes back out", () => {
    document.body.innerHTML = groupHeader(
      "data-sidebar-project-id",
      "proj_a",
      "Storefront",
    );
    start();

    stop?.();
    stop = undefined;

    expect(document.querySelector("[data-icons-sidebar-root]")).toBeNull();
  });

  it("reads the group name from bb, not from a control this plugin drew", async () => {
    document.body.innerHTML = groupHeader(
      "data-sidebar-project-id",
      "proj_a",
      "Storefront",
    );
    const seen = start();

    // What this plugin renders into its own mount carries a title of its own,
    // and a descendant search would read that back as the group's name.
    const control = document.createElement("button");
    control.title = "Change icon";
    seen.at(-1)![0]!.target.append(control);
    document.body.append(document.createElement("div"));
    await vi.waitFor(() => expect(document.querySelectorAll("div").length).toBeGreaterThan(1));

    expect(seen.at(-1)![0]!.name).toBe("Storefront");
  });

  it("ignores a header bb has not labelled", () => {
    document.body.innerHTML = `<div data-sidebar-project-id="proj_a"></div>`;

    expect(start().at(-1) ?? []).toEqual([]);
  });

  it("draws on the personal project, which bb wraps in no id of its own", () => {
    document.body.innerHTML = projectList(
      groupHeader("data-sidebar-project-id", "proj_a", "Storefront"),
      stickyGroup("Threads"),
    );

    expect(start().at(-1)?.map(({ owner }) => owner)).toEqual([
      { kind: "project", id: "proj_a" },
      { kind: "project", id: "proj_personal" },
    ]);
  });

  it("finds the personal group wherever the user has dragged it", () => {
    document.body.innerHTML = projectList(
      stickyGroup("Threads"),
      groupHeader("data-sidebar-project-id", "proj_a", "Storefront"),
    );

    expect(start().at(-1)?.map(({ owner }) => owner.id)).toContain(
      "proj_personal",
    );
  });

  // bb reuses one leftover group for three different things: the personal
  // project under By project, "no machine" under By machine, and "Unorganized"
  // under Manually. Only the first is a project, and only the first sits in a
  // list that also holds project groups.
  it("leaves the same leftover group alone when no project sits beside it", () => {
    document.body.innerHTML = projectList(stickyGroup("Unorganized"));

    expect(start().at(-1) ?? []).toEqual([]);
  });

  it("takes the personal group's node back out too", () => {
    document.body.innerHTML = projectList(
      groupHeader("data-sidebar-project-id", "proj_a", "Storefront"),
      stickyGroup("Threads"),
    );
    start();

    stop?.();
    stop = undefined;

    expect(document.querySelectorAll("[data-icons-sidebar-root]")).toHaveLength(
      0,
    );
  });
});
