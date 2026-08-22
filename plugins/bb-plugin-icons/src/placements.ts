import type { Placement, Spot } from "./decorate";
import { projectFromPath } from "./route";
import type { IconOwner } from "./store";

/**
 * Every place bb draws a project outside its own sidebar headers, and how to
 * tell whose icon belongs there.
 *
 * Each entry is a pure read of the document. bb draws the same folder in all
 * of them — `Icons.Folder`, which reaches the DOM as `data-icon="Folder"` —
 * so what differs between entries is only how the project is named: some
 * carry an id, most carry the name bb printed and nothing else.
 */

const FOLDER = 'svg[data-icon="Folder"]';
const PROJECT_TITLE = "Project: ";

function spotOn(
  folder: HTMLElement | null,
  owner: IconOwner | null,
): Spot | null {
  if (owner === null || folder === null) return null;
  return { owner, replaces: folder };
}

/**
 * Anything bb has labelled `Project: <name>`.
 *
 * bb marks a control that stands for one project with that title, and does it
 * in more than one place — the environment strip under an open thread's
 * composer, and each project in the mention list the composer opens on `@`.
 * Following bb's own convention covers both, and covers wherever else it
 * applies the same label.
 */
const projectLabelled: Placement = {
  id: "project-labelled",
  setting: "showInComposer",
  find(root, { projects }) {
    const spots: Spot[] = [];
    for (const node of Array.from(
      root.querySelectorAll<HTMLElement>(`[title^="${PROJECT_TITLE}"]`),
    )) {
      const name = node.getAttribute("title")?.slice(PROJECT_TITLE.length) ?? "";
      const spot = spotOn(node.querySelector(FOLDER), projects.byName(name));
      if (spot !== null) spots.push(spot);
    }
    return spots;
  },
};

/**
 * The composer's own project control, on the New thread screen and on a
 * project's.
 *
 * Its folder turns into a `FolderPlus` when no project is chosen, which is an
 * invitation rather than a project and gets nothing; matching bb's folder
 * exactly is what leaves that case alone. The label is read rather than the
 * route, because a split view can show two panes whose projects differ while
 * the address bar names only one.
 */
const promptboxControl: Placement = {
  id: "promptbox-project-control",
  setting: "showInComposer",
  find(root, { projects }) {
    const spots: Spot[] = [];
    for (const node of Array.from(
      root.querySelectorAll<HTMLElement>("[data-promptbox-project-control]"),
    )) {
      const name =
        node.querySelector("[data-promptbox-full-label]")?.textContent ?? "";
      const spot = spotOn(node.querySelector(FOLDER), projects.byName(name));
      if (spot !== null) spots.push(spot);
    }
    return spots;
  },
};

/**
 * A row of the project menu that control opens.
 *
 * The rows carry the name and nothing else, so an ambiguous one keeps bb's
 * folder. New project and Don't work in a project draw a `FolderPlus` and a
 * `FolderMinus`, so matching the plain folder passes over them, and a menu
 * row of some other menu resolves to no project and is passed over too.
 */
const projectMenuRow: Placement = {
  id: "project-menu-row",
  setting: "showInComposer",
  find(root, { projects }) {
    const spots: Spot[] = [];
    for (const node of Array.from(
      root.querySelectorAll<HTMLElement>('[role="menuitem"]'),
    )) {
      // Only bb's own leading glyph: a descendant search would find the check
      // mark on the row that is already chosen.
      const spot = spotOn(
        node.querySelector(`:scope > ${FOLDER}`),
        projects.byName(node.textContent ?? ""),
      );
      if (spot !== null) spots.push(spot);
    }
    return spots;
  },
};

/**
 * A project mentioned in the prompt, which is the one place bb writes the id
 * into the DOM — so this is the only row that stays right when two projects
 * share a name, and the only one a reader can mention twice in one prompt.
 */
const mentionPill: Placement = {
  id: "mention-pill",
  setting: "showInComposer",
  find(root) {
    const spots: Spot[] = [];
    for (const node of Array.from(
      root.querySelectorAll<HTMLElement>("[data-prompt-mention-resource]"),
    )) {
      const spot = spotOn(
        node.querySelector(FOLDER),
        projectFromMention(node.getAttribute("data-prompt-mention-resource")),
      );
      if (spot !== null) spots.push(spot);
    }
    return spots;
  },
};

function projectFromMention(resource: string | null): IconOwner | null {
  if (resource === null) return null;
  try {
    const parsed: unknown = JSON.parse(resource);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      (parsed as { kind?: unknown }).kind !== "project"
    ) {
      return null;
    }
    const id = (parsed as { projectId?: unknown }).projectId;
    return typeof id === "string" && id !== "" ? { kind: "project", id } : null;
  } catch {
    // bb owns this attribute's shape; a reading it does not fit is one to
    // leave alone rather than to throw out of a MutationObserver.
    return null;
  }
}

/**
 * The project's own crumb in the app header, above its settings.
 *
 * The thread header gets its icon from a slot bb only offers on a thread, so
 * a project's own screens — the one place the header names a project and no
 * thread — were the header's blind spot. bb draws nothing there to replace,
 * so the icon goes at the head of the crumb, where the thread header puts it
 * too. The link points at the project, which makes its href the id.
 */
const headerCrumb: Placement = {
  id: "header-crumb",
  setting: "showInThreadHeader",
  find(root) {
    const spots: Spot[] = [];
    for (const link of Array.from(
      root.querySelectorAll<HTMLAnchorElement>(
        'header nav[aria-label="Breadcrumb"] a[href^="/projects/"]',
      ),
    )) {
      const owner = projectFromPath(link.getAttribute("href") ?? "", {
        exact: true,
      });
      const crumb = link.parentElement;
      if (owner === null || crumb === null) continue;
      spots.push({ owner, prepends: crumb, className: "flex shrink-0 items-center" });
    }
    return spots;
  },
};

export const PLACEMENTS: readonly Placement[] = [
  headerCrumb,
  projectLabelled,
  promptboxControl,
  projectMenuRow,
  mentionPill,
];
