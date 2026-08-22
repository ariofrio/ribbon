// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import type { Placement, PlacementContext, Spot } from "./decorate";
import { PLACEMENTS } from "./placements";
import { projectLookup } from "./project-lookup";

/**
 * Every fixture here is bb's own markup, as captured from a running bb, so a
 * bb that moves one of these fails here rather than quietly dropping an icon.
 */
const context: PlacementContext = {
  projects: projectLookup([
    { id: "proj_a", name: "Storefront" },
    { id: "proj_b", name: "Payments API" },
  ]),
};

/** bb's own folder, which the plugin's icon stands in for. */
function folder(className: string) {
  return `<svg data-icon="Folder" class="${className}"></svg>`;
}

afterEach(() => {
  document.body.innerHTML = "";
});

function find(id: string): readonly Spot[] {
  const placement = PLACEMENTS.find((each: Placement) => each.id === id);
  if (placement === undefined) throw new Error(`no placement ${id}`);
  return placement.find(document, context);
}

function owners(id: string) {
  return find(id).map((spot) => spot.owner.id);
}

describe("the strip under an open thread's composer, and the mention list", () => {
  it("draws on anything bb labelled with a project's name", () => {
    document.body.innerHTML = `
      <div data-option-display="" title="Project: Storefront"
           class="inline-flex w-fit min-w-0 items-center justify-start gap-1 px-1 text-xs">
        <span class="flex min-w-0 items-center gap-1.5">
          ${folder("size-4 shrink-0")}
          <span class="sr-only">Project: </span>
          <span class="min-w-0 truncate" data-promptbox-full-label="">Storefront</span>
          <span class="min-w-0 truncate" data-promptbox-compact-label="">Storefront</span>
        </span>
      </div>
      <button type="button" class="w-full rounded px-2 py-1.5 text-left text-xs"
              title="Project: Payments API">
        <div class="flex min-w-0 items-center gap-1.5">
          ${folder("size-3.5 shrink-0 text-muted-foreground")}
          <span class="truncate text-foreground">Payments API</span>
        </div>
      </button>
    `;

    expect(owners("project-labelled")).toEqual(["proj_a", "proj_b"]);
  });

  it("stands in for bb's folder rather than adding beside it", () => {
    document.body.innerHTML = `
      <div data-option-display="" title="Project: Storefront">${folder("size-4")}</div>
    `;

    expect(find("project-labelled")[0]?.replaces).toBe(
      document.querySelector("svg"),
    );
  });

  // The strip is bb's own display chip and does nothing when clicked, so the
  // icon in it can carry the picker. A mention row already inserts a mention,
  // and a second meaning for one click is one too many.
  it("offers the picker on the strip, and not on a row bb already gave a job", () => {
    document.body.innerHTML = `
      <div data-option-display="" title="Project: Storefront">${folder("size-4")}</div>
      <button type="button" title="Project: Payments API">${folder("size-3.5")}</button>
    `;

    expect(
      find("project-labelled").map((spot) => [spot.owner.id, spot.picker === true]),
    ).toEqual([
      ["proj_a", true],
      ["proj_b", false],
    ]);
  });

  it("leaves a project it cannot place alone", () => {
    document.body.innerHTML = `
      <div data-option-display="" title="Project: Deleted">${folder("size-4")}</div>
    `;

    expect(owners("project-labelled")).toEqual([]);
  });
});

describe("the composer's project control", () => {
  const control = (label: string, icon: string) => `
    <button type="button" aria-label="Project" data-promptbox-project-control=""
            class="border-none bg-transparent shadow-none">
      <span class="flex min-w-0 items-center gap-1.5">
        <svg data-icon="${icon}" class="size-3.5 shrink-0"></svg>
        <span class="min-w-0 truncate" data-promptbox-full-label="">${label}</span>
        <span class="min-w-0 truncate" data-promptbox-compact-label="">${label}</span>
      </span>
      <svg data-icon="ChevronDown" class="size-3.5 shrink-0"></svg>
    </button>
  `;

  it("draws the project the control is set to", () => {
    document.body.innerHTML = control("Storefront", "Folder");

    expect(owners("promptbox-project-control")).toEqual(["proj_a"]);
  });

  it("leaves the invitation to pick one alone", () => {
    document.body.innerHTML = control("Work in a project", "FolderPlus");

    expect(owners("promptbox-project-control")).toEqual([]);
  });
});

describe("the menu that control opens", () => {
  it("draws on each project and on nothing else in the menu", () => {
    document.body.innerHTML = `
      <div role="menu">
        <div class="px-2 py-[0.3125rem] text-xs">Project</div>
        <div role="menuitem" data-radix-collection-item="">
          ${folder("size-4 text-muted-foreground")}Storefront
          <svg data-icon="Check" class="ml-auto size-4 opacity-100"></svg>
        </div>
        <div role="menuitem" data-radix-collection-item="">
          ${folder("size-4 text-muted-foreground")}Payments API
          <svg data-icon="Check" class="ml-auto size-4 opacity-0"></svg>
        </div>
        <div role="menuitem" data-radix-collection-item="">
          <svg data-icon="FolderPlus" class="size-4 text-muted-foreground"></svg>New project
        </div>
        <div role="menuitem" data-radix-collection-item="">
          <svg data-icon="FolderMinus" class="size-4 text-muted-foreground"></svg>Don't work in a project
        </div>
      </div>
    `;

    expect(owners("project-menu-row")).toEqual(["proj_a", "proj_b"]);
  });

  it("replaces the folder that leads the row, never the check that ends it", () => {
    document.body.innerHTML = `
      <div role="menuitem">${folder("size-4")}Storefront<svg data-icon="Check"></svg></div>
    `;

    expect(find("project-menu-row")[0]?.replaces).toBe(
      document.querySelector('[data-icon="Folder"]'),
    );
  });

  it("passes over a row of some other menu that happens to draw a folder", () => {
    document.body.innerHTML = `
      <div role="menuitem">${folder("size-4")}Files</div>
    `;

    expect(owners("project-menu-row")).toEqual([]);
  });
});

describe("a project mentioned in the prompt", () => {
  const pill = (resource: string) => `
    <span data-prompt-mention="true" data-prompt-mention-resource='${resource}'
          role="button" aria-label="Open Project: Storefront">
      ${folder("-ml-px size-4 shrink-0 self-center")}
      <span class="truncate">Storefront</span>
    </span>
  `;

  it("reads the id bb wrote into the pill, which no other row carries", () => {
    document.body.innerHTML = pill(
      '{"kind":"project","projectId":"proj_a","label":"Storefront"}',
    );

    expect(owners("mention-pill")).toEqual(["proj_a"]);
  });

  it("draws on each of two mentions of one project", () => {
    document.body.innerHTML =
      pill('{"kind":"project","projectId":"proj_a","label":"Storefront"}') +
      pill('{"kind":"project","projectId":"proj_a","label":"Storefront"}');

    expect(owners("mention-pill")).toEqual(["proj_a", "proj_a"]);
  });

  it("leaves a mention of something that is not a project alone", () => {
    document.body.innerHTML = pill(
      '{"kind":"thread","threadId":"thr_a","label":"Polish analytics"}',
    );

    expect(owners("mention-pill")).toEqual([]);
  });

  it("leaves a reading it cannot make sense of alone", () => {
    document.body.innerHTML = pill("not json");

    expect(owners("mention-pill")).toEqual([]);
  });
});

describe("the header above a project's own screens", () => {
  const header = (href: string, label: string) => `
    <header class="h-[48px]">
      <div data-testid="app-page-header-content-row">
        <nav aria-label="Breadcrumb" class="min-w-0">
          <ol class="flex min-w-0 items-center gap-1.5 text-sm font-semibold">
            <li class="flex min-w-0 items-center gap-1.5">
              <a class="-mx-2 inline-flex min-h-7 shrink-0 items-center rounded-md px-2"
                 href="${href}" data-discover="true">${label}</a>
            </li>
            <li class="flex min-w-0 items-center gap-1.5">
              <svg data-icon="ChevronRight" class="size-3.5 shrink-0"></svg>
              <span aria-current="page" class="min-w-0 truncate">Settings</span>
            </li>
          </ol>
        </nav>
      </div>
    </header>
  `;

  it("draws before the crumb, where bb draws nothing of its own", () => {
    document.body.innerHTML = header("/projects/proj_a", "Storefront");

    const [spot] = find("header-crumb");
    expect(spot?.owner).toEqual({ kind: "project", id: "proj_a" });
    expect(spot?.prepends).toBe(document.querySelector("li"));
  });

  it("leaves a crumb pointing inside the project alone", () => {
    document.body.innerHTML = header(
      "/projects/proj_a/threads/thr_b",
      "Polish analytics dashboard",
    );

    expect(owners("header-crumb")).toEqual([]);
  });
});
