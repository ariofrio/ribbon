import { PERSONAL_PROJECT_ID, type IconOwner } from "./store";

/** Stamped by `bb plugin build`; undefined in tests and registry copies. */
declare const __BB_PLUGIN_ID__: string | undefined;

export interface SidebarAnchor {
  owner: IconOwner;
  /** The group's name, for the control's accessible label. */
  name: string;
  /** A node of this plugin's, at the head of bb's own label row. */
  target: HTMLElement;
}

const PROJECT_ATTRIBUTE = "data-sidebar-project-id";

const OWNER_ATTRIBUTES: ReadonlyArray<{
  attribute: string;
  kind: IconOwner["kind"];
}> = [
  { attribute: PROJECT_ATTRIBUTE, kind: "project" },
  { attribute: "data-sidebar-section-id", kind: "section" },
];

const MOUNT_ATTRIBUTE = "data-icons-sidebar-root";

/**
 * bb's sidebar group header, as its own markup:
 *
 *     [data-sidebar-project-id | data-sidebar-section-id]
 *       └ [data-sidebar="group-label"]
 *           └ <span>  ← the label row: title, then the collapse button
 *
 * The icon goes at the head of that row, which is where Thread stages puts a
 * stage icon and what lines the group name up with the nav labels above it.
 * sidebar-dom.test.ts pins the shape, so a bb sidebar change fails there
 * rather than quietly dropping the icon.
 */
function labelRow(group: HTMLElement): HTMLElement | null {
  const label = group.querySelector<HTMLElement>('[data-sidebar="group-label"]');
  const row = label?.firstElementChild;
  return row instanceof HTMLElement ? row : null;
}

function createTarget(document: Document): HTMLElement {
  const target = document.createElement("span");
  target.setAttribute(MOUNT_ATTRIBUTE, "");
  // This node lives in bb's sidebar, outside the plugin's mount, so it carries
  // its own scope root or the plugin's stylesheet never reaches it.
  target.dataset.bbPluginRoot = "";
  if (typeof __BB_PLUGIN_ID__ === "string") {
    target.dataset.bbPlugin = __BB_PLUGIN_ID__;
  }
  target.className = "mr-1 inline-flex shrink-0 items-center";
  return target;
}

function anchorIn(group: HTMLElement, owner: IconOwner): SidebarAnchor | null {
  const row = labelRow(group);
  if (row === null) return null;

  const existing = row.querySelector<HTMLElement>(`:scope > [${MOUNT_ATTRIBUTE}]`);
  const target = existing ?? createTarget(group.ownerDocument);
  if (existing === null) row.insertBefore(target, row.firstChild);

  // Only bb's own child: this plugin's control carries a title of its own, and
  // a descendant search would read that back as the group name.
  const title = row.querySelector<HTMLElement>(":scope > [title]");
  return {
    owner,
    name: title?.getAttribute("title") ?? title?.textContent?.trim() ?? owner.id,
    target,
  };
}

/**
 * bb's personal project, which the sidebar draws as a group of its own but
 * labels "Threads" and wraps in nothing — every project group beside it
 * carries a `data-sidebar-project-id`, and this one carries no id at all.
 *
 * It is the same leftover group bb reuses for "no machine" under By machine
 * and for "Unorganized" under Manually, where it holds whatever is left rather
 * than the personal project, and must not be drawn on. What tells them apart
 * is the company it keeps: only under By project does the list also hold
 * project groups, so an unwrapped group among them is bb's personal one.
 *
 * A bb with no projects at all therefore gets nothing, since there is no
 * project group to recognize the list by. That errs towards drawing no icon
 * rather than the wrong one, and a sidebar with a single group has nothing for
 * an icon to tell apart anyway.
 */
function personalGroup(root: ParentNode): HTMLElement | null {
  const list = root.querySelector<HTMLElement>(`[${PROJECT_ATTRIBUTE}]`)
    ?.parentElement;
  return (
    list?.querySelector<HTMLElement>(
      ":scope > [data-sidebar-sticky-group]",
    ) ?? null
  );
}

function collect(root: ParentNode): SidebarAnchor[] {
  const anchors: SidebarAnchor[] = [];
  for (const { attribute, kind } of OWNER_ATTRIBUTES) {
    const groups = Array.from(
      root.querySelectorAll<HTMLElement>(`[${attribute}]`),
    );
    for (const group of groups) {
      const id = group.getAttribute(attribute);
      if (id === null || id === "") continue;
      const anchor = anchorIn(group, { kind, id });
      if (anchor !== null) anchors.push(anchor);
    }
  }

  const personal = personalGroup(root);
  const anchor =
    personal === null
      ? null
      : anchorIn(personal, { kind: "project", id: PERSONAL_PROJECT_ID });
  if (anchor !== null) anchors.push(anchor);

  return anchors;
}

function sameAnchors(left: SidebarAnchor[], right: SidebarAnchor[]): boolean {
  return (
    left.length === right.length &&
    left.every((anchor, index) => {
      const other = right[index]!;
      return (
        anchor.owner.kind === other.owner.kind &&
        anchor.owner.id === other.owner.id &&
        anchor.name === other.name &&
        anchor.target === other.target
      );
    })
  );
}

/**
 * Watches bb's sidebar and reports where this plugin may draw an icon.
 *
 * The list is re-reported whenever it changes, which covers more than a group
 * appearing: bb shows project groups under Organize → By project and section
 * groups only under Manually, so switching mode replaces every header at once.
 */
export function observeSidebarIconAnchors(
  onChange: (anchors: SidebarAnchor[]) => void,
  target: Document = document,
): () => void {
  let current: SidebarAnchor[] = [];
  let disposed = false;

  const sync = () => {
    if (disposed) return;
    const next = collect(target);
    if (sameAnchors(current, next)) return;
    current = next;
    onChange(next);
  };

  const observer = new MutationObserver(sync);
  observer.observe(target.documentElement, { childList: true, subtree: true });
  sync();

  return () => {
    if (disposed) return;
    disposed = true;
    observer.disconnect();
    for (const anchor of current) anchor.target.remove();
    current = [];
  };
}
