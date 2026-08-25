import type { IconOwner } from "./store";

export interface CrumbAnchor {
  element: HTMLElement;
  owner: IconOwner;
}

const KIND_ATTRIBUTE = "data-breadcrumb-icon-anchor";
const OWNER_ATTRIBUTE = "data-breadcrumb-icon-owner";
const SELECTOR = `[${KIND_ATTRIBUTE}][${OWNER_ATTRIBUTE}]`;

/** Reads the anchors the Breadcrumbs plugin leaves beside its crumbs. */
export function readCrumbAnchors(root: ParentNode): CrumbAnchor[] {
  const anchors: CrumbAnchor[] = [];
  for (const element of Array.from(root.querySelectorAll<HTMLElement>(SELECTOR))) {
    const kind = element.dataset.breadcrumbIconAnchor;
    const id = element.dataset.breadcrumbIconOwner;
    if ((kind !== "section" && kind !== "project") || !id) continue;
    anchors.push({ element, owner: { kind, id } });
  }
  return anchors;
}

export function sameAnchors(
  left: readonly CrumbAnchor[],
  right: readonly CrumbAnchor[],
): boolean {
  return (
    left.length === right.length &&
    left.every(
      (anchor, index) =>
        anchor.element === right[index]?.element &&
        anchor.owner.kind === right[index]?.owner.kind &&
        anchor.owner.id === right[index]?.owner.id,
    )
  );
}

/**
 * Calls back with the anchors in the document, and again whenever they change.
 *
 * The neighbour's crumbs wait on its own backend and are redrawn when a thread
 * moves, so the anchors arrive late and change afterwards. Unchanged anchors
 * are not reported, which keeps a header redrawing for its own reasons from
 * remounting icons that have not moved.
 */
export function observeCrumbAnchors(
  onChange: (anchors: CrumbAnchor[]) => void,
  root: Document = document,
): () => void {
  let last: CrumbAnchor[] = [];
  const read = () => {
    const next = readCrumbAnchors(root);
    if (sameAnchors(last, next)) return;
    last = next;
    onChange(next);
  };
  read();
  const observer = new MutationObserver(read);
  // Attributes as well as children. A thread moving to another section does
  // not add or remove an anchor: React reuses the element and rewrites the
  // owner on it, which childList alone never sees.
  observer.observe(root.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: [OWNER_ATTRIBUTE, KIND_ATTRIBUTE],
  });
  return () => observer.disconnect();
}
