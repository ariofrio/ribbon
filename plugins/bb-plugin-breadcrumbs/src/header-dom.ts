/** Stamped by `bb plugin build`; undefined in tests and registry copies. */
declare const __BB_PLUGIN_ID__: string | undefined;

/**
 * bb's own title container, found by what it holds rather than where it sits.
 *
 * Both this plugin and Icons insert a node of their own at the head of the
 * header, so whichever lands first becomes `center.firstElementChild` and the
 * other one, looking there for the title, finds a sibling plugin's node with
 * no <p> in it and gives up. Skipping anything marked as a plugin's root makes
 * the lookup independent of who arrives first.
 */
export function findTitleContainer(center: Element): HTMLElement | null {
  for (const child of Array.from(center.children)) {
    if (!(child instanceof HTMLElement)) continue;
    if (child.dataset.bbPluginRoot !== undefined) continue;
    if (child.querySelector("p") !== null) return child;
  }
  return null;
}

interface BreadcrumbPortalMount {
  target: HTMLElement;
  cleanup(): void;
}

export function installChildPillHider(marker: HTMLElement): (() => void) | null {
  const header = marker.closest("header");
  const actionsMenu = header?.querySelector<HTMLElement>(
    '[data-testid="thread-detail-header-actions-menu"]',
  );
  const center = actionsMenu?.parentElement;
  if (center === undefined || center === null || actionsMenu === undefined) {
    return null;
  }

  const previousDisplays = new Map<HTMLElement, string>();
  const hideChildPill = () => {
    const titleContainer = findTitleContainer(center);
    const childPill = Array.from(center.children).find(
      (child): child is HTMLElement =>
        child instanceof HTMLElement &&
        child !== titleContainer &&
        child !== actionsMenu &&
        child.dataset.bbPluginRoot === undefined &&
        child.textContent?.trim() === "child",
    );
    if (childPill === undefined) return;
    if (!previousDisplays.has(childPill)) {
      previousDisplays.set(childPill, childPill.style.display);
    }
    childPill.style.display = "none";
  };

  hideChildPill();
  const observer = new MutationObserver(hideChildPill);
  observer.observe(center, {
    characterData: true,
    childList: true,
    subtree: true,
  });

  return () => {
    observer.disconnect();
    for (const [childPill, display] of previousDisplays) {
      childPill.style.display = display;
    }
  };
}

export function installBreadcrumbPortal(
  marker: HTMLElement,
): BreadcrumbPortalMount | null {
  const header = marker.closest("header");
  const actionsMenu = header?.querySelector<HTMLElement>(
    '[data-testid="thread-detail-header-actions-menu"]',
  );
  const center = actionsMenu?.parentElement;
  const titleContainer =
    center === undefined || center === null ? null : findTitleContainer(center);
  const slotWrapper = marker.closest<HTMLElement>('[role="group"]');

  if (
    center === undefined ||
    center === null ||
    titleContainer === null ||
    slotWrapper === null
  ) {
    return null;
  }

  const target = marker.ownerDocument.createElement("span");
  target.dataset.breadcrumbsRoot = "";
  // This node lives in bb's header, outside the plugin's own mount, so it has
  // to say whose it is. bb guards its React tree against foreign DOM moves and
  // blocks a node being reparented into an unclaimed container — it warns that
  // a plugin "tried to move <button> out of React's tree" and the crumbs never
  // arrive. The same markers let the plugin's compiled stylesheet reach here,
  // and let Electron route clicks past the window drag region.
  target.dataset.bbPluginRoot = "";
  target.dataset.bbPortaledOverlay = "";
  if (typeof __BB_PLUGIN_ID__ === "string") {
    target.dataset.bbPlugin = __BB_PLUGIN_ID__;
  }
  target.className =
    "-mr-0.5 inline-flex min-w-0 shrink-0 items-center gap-1.5 text-sm font-semibold";
  center.insertBefore(target, titleContainer);

  const wasHidden = slotWrapper.hidden;
  slotWrapper.hidden = true;

  /**
   * bb owns this header, so its own re-render reconciles the children of
   * `center` and takes this foreign node out again — bb even says so, warning
   * that a plugin "tried to move <button> out of React's tree" once the crumbs
   * are left portaling into a node with no parent. Putting the same node back
   * is enough: its children are React's and they travel with it.
   */
  const observer = new MutationObserver(() => {
    if (target.parentElement !== null || !center.isConnected) return;
    center.insertBefore(target, findTitleContainer(center) ?? center.firstElementChild);
  });
  observer.observe(center, { childList: true });

  return {
    target,
    cleanup() {
      observer.disconnect();
      target.remove();
      slotWrapper.hidden = wasHidden;
    },
  };
}

export function navigateToProjectSettings(
  targetWindow: Window,
  projectId: string,
): void {
  const path = `/projects/${encodeURIComponent(projectId)}/settings`;
  targetWindow.history.pushState(null, "", path);
  targetWindow.dispatchEvent(new PopStateEvent("popstate"));
}
