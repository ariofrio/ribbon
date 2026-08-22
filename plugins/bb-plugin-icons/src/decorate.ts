import { afterPluginFrame } from "./after-plugin-frame";
import type { ProjectLookup } from "./project-lookup";
import type { IconOwner, PlacementSetting } from "./store";

/** Stamped by `bb plugin build`; undefined in tests and registry copies. */
declare const __BB_PLUGIN_ID__: string | undefined;

const DECORATION_ATTRIBUTE = "data-icons-decoration";

/** What a placement may consult to work out whose icon a node wants. */
export interface PlacementContext {
  /** For the rows that print a project's name and nothing else. */
  projects: ProjectLookup;
}

/**
 * One place bb draws a project, and what the plugin should draw there.
 *
 * `replaces` is bb's own glyph, which is hidden while the plugin's icon stands
 * in its place; `prepends` is a row bb drew no glyph on, where the icon goes
 * at the head instead.
 */
export type Spot = { owner: IconOwner; className?: string } & (
  | { replaces: HTMLElement; prepends?: never }
  | { prepends: HTMLElement; replaces?: never }
);

/**
 * One surface bb draws projects on.
 *
 * A placement is a pure read of the document: it finds its own nodes and says
 * whose icon each wants. Everything else — inserting, hiding, reusing,
 * cleaning up, and keeping React from remounting an icon that did not move —
 * belongs to `observeDecorations`, so adding a surface costs one entry rather
 * than one module.
 */
export interface Placement {
  id: string;
  /** The user setting that turns this placement, and its like, off. */
  setting: PlacementSetting;
  find(root: ParentNode, context: PlacementContext): readonly Spot[];
}

/** A running decoration pass, and the two things a caller does with one. */
export interface Decorating {
  /**
   * Asks for another pass. The observer covers everything bb changes, but not
   * what the plugin itself learns later — the project list arrives after the
   * first pass, and the rows that resolve a name need it. Like every other
   * pass, it lands on the next frame rather than at once.
   */
  refresh(): void;
  stop(): void;
}

/** One icon to draw, and the node to draw it into. */
export interface Decoration {
  /** Stable for as long as the target is, so React never remounts an icon. */
  key: string;
  owner: IconOwner;
  target: HTMLElement;
  /**
   * The classes bb had on the glyph being replaced, for the icon standing in
   * to wear. bb sizes its folder differently from one surface to the next and
   * mutes it on some, and copying what it chose is what makes the icon match
   * each of them without a placement having to say so. A chosen color still
   * wins: it lands as an inline style.
   */
  glyphClassName: string | undefined;
}

const TARGET_CLASS = "inline-flex shrink-0 items-center";

/** The attributes the placements read, and that a pass never writes. */
const WATCHED_ATTRIBUTES = [
  "data-icon",
  "title",
  "href",
  "data-prompt-mention-resource",
];

interface Mounted {
  target: HTMLElement;
  key: string;
  glyphClassName: string | undefined;
  /** bb's own glyph, and the inline display it had before it was hidden. */
  hidden: { node: HTMLElement; display: string } | null;
}

function anchorOf(spot: Spot): HTMLElement {
  return spot.replaces ?? spot.prepends;
}

function createTarget(document: Document, className: string | undefined): HTMLElement {
  const target = document.createElement("span");
  target.setAttribute(DECORATION_ATTRIBUTE, "");
  // These nodes live in bb's own chrome, outside the plugin's mount, so each
  // carries its own scope root or the plugin's stylesheet — the icon color
  // palette above all — never reaches it. The overlay marker lets Electron
  // route a click here rather than to a window drag region.
  target.dataset.bbPluginRoot = "";
  target.dataset.bbPortaledOverlay = "";
  if (typeof __BB_PLUGIN_ID__ === "string") {
    target.dataset.bbPlugin = __BB_PLUGIN_ID__;
  }
  target.className = className ?? TARGET_CLASS;
  return target;
}

/**
 * Carries over how bb's own glyph sat in the row it is being taken out of.
 *
 * bb writes that on the glyph, because the glyph is the flex item. Standing in
 * front of it makes this target the flex item instead, and an alignment left
 * behind is an icon in the wrong place: bb centres the folder in a mention
 * pill that baseline-aligns everything else, and without this the icon rode
 * four pixels above the word beside it.
 */
function alignLike(target: HTMLElement, replaced: HTMLElement): void {
  const view = replaced.ownerDocument.defaultView;
  const alignSelf = view?.getComputedStyle(replaced).alignSelf;
  if (alignSelf !== undefined && alignSelf !== "" && alignSelf !== "auto") {
    target.style.alignSelf = alignSelf;
  }
}

function hide(node: HTMLElement): { node: HTMLElement; display: string } {
  const display = node.style.display;
  // Guarded, because an unchanged write still records a mutation, and this
  // observer would then wake itself forever.
  if (display !== "none") node.style.display = "none";
  return { node, display };
}

function restore({ node, display }: { node: HTMLElement; display: string }) {
  if (display === "") node.style.removeProperty("display");
  else node.style.display = display;
}

function same(left: readonly Decoration[], right: readonly Decoration[]) {
  return (
    left.length === right.length &&
    left.every((decoration, index) => {
      const other = right[index]!;
      return (
        decoration.key === other.key &&
        decoration.target === other.target &&
        decoration.owner.kind === other.owner.kind &&
        decoration.owner.id === other.owner.id
      );
    })
  );
}

/**
 * Watches bb's own chrome and reports every icon the plugin may draw over it.
 *
 * The list is re-reported whenever it changes, and only then: bb's composer
 * mutates on every keystroke, and a placement that found the same spots must
 * not cost a render. Each pass runs on a frame rather than straight from the
 * observer, which at least keeps it off whatever call bb is watching; see
 * `after-plugin-frame.ts` for what that does and does not escape.
 */
export function observeDecorations({
  placements,
  context,
  onChange,
  target: document_ = document,
}: {
  placements: readonly Placement[];
  context: () => PlacementContext;
  onChange: (decorations: readonly Decoration[]) => void;
  target?: Document;
}): Decorating {
  const mounted = new Map<HTMLElement, Mounted>();
  let current: readonly Decoration[] = [];
  let nextKey = 0;
  let disposed = false;
  let cancel: (() => void) | undefined;

  const release = (anchor: HTMLElement) => {
    const entry = mounted.get(anchor);
    if (entry === undefined) return;
    mounted.delete(anchor);
    entry.target.remove();
    if (entry.hidden !== null) restore(entry.hidden);
  };

  const sync = () => {
    if (disposed) return;
    const shared = context();
    const decorations: Decoration[] = [];
    const live = new Set<HTMLElement>();

    for (const placement of placements) {
      for (const spot of placement.find(document_, shared)) {
        const anchor = anchorOf(spot);
        live.add(anchor);
        let entry = mounted.get(anchor);
        if (entry === undefined || !entry.target.isConnected) {
          entry?.target.remove();
          const target = createTarget(document_, spot.className);
          if (spot.replaces !== undefined) alignLike(target, spot.replaces);
          entry = {
            target,
            key: `${placement.id}:${(nextKey += 1)}`,
            glyphClassName: spot.replaces?.getAttribute("class") ?? undefined,
            hidden: spot.replaces === undefined ? null : hide(spot.replaces),
          };
          mounted.set(anchor, entry);
          if (spot.replaces === undefined) {
            spot.prepends.insertBefore(target, spot.prepends.firstChild);
          } else {
            spot.replaces.before(target);
          }
        } else if (entry.hidden !== null) {
          // A re-render can bring bb's glyph back visible under the icon
          // standing in for it.
          hide(entry.hidden.node);
        }
        decorations.push({
          key: entry.key,
          owner: spot.owner,
          target: entry.target,
          glyphClassName: entry.glyphClassName,
        });
      }
    }

    for (const anchor of [...mounted.keys()]) {
      if (!live.has(anchor)) release(anchor);
    }

    if (same(current, decorations)) return;
    current = decorations;
    onChange(decorations);
  };

  const schedule = () => {
    if (cancel !== undefined) return;
    cancel = afterPluginFrame(() => {
      cancel = undefined;
      sync();
    });
  };

  const observer = new MutationObserver(schedule);
  observer.observe(document_.documentElement, {
    childList: true,
    subtree: true,
    // React reconciles bb's icon in place rather than replacing it, so the
    // composer's control turning its folder into a FolderPlus when the project
    // is cleared is an attribute edit and nothing else. Without this, an icon
    // would go on standing in for a glyph that is no longer a folder. The
    // filter keeps that from costing a pass on every class bb toggles on
    // hover, and holds only attributes the placements read and a pass never
    // writes, so it cannot wake itself.
    attributes: true,
    attributeFilter: WATCHED_ATTRIBUTES,
  });
  // Even the first pass waits for a frame: this call and refresh() both come
  // from a React effect, and writing into bb's chrome straight from one is
  // writing from inside the call bb is watching.
  schedule();

  return {
    refresh: schedule,
    stop() {
      if (disposed) return;
      disposed = true;
      cancel?.();
      observer.disconnect();
      for (const anchor of [...mounted.keys()]) release(anchor);
      current = [];
    },
  };
}
