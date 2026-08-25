/** Stamped by `bb plugin build`; undefined in tests and registry copies. */
declare const __BB_PLUGIN_ID__: string | undefined;

interface NewThreadHeader {
  center: HTMLElement;
  titleContainer: HTMLElement;
}

function findNewThreadHeader(composer: HTMLElement): NewThreadHeader | null {
  let ancestor: HTMLElement | null = composer.parentElement;
  while (ancestor !== null) {
    for (const row of Array.from(
      ancestor.querySelectorAll<HTMLElement>(
        '[data-testid="app-page-header-content-row"]',
      ),
    )) {
      for (const paragraph of Array.from(
        row.querySelectorAll<HTMLParagraphElement>("p"),
      )) {
        if (paragraph.textContent?.trim() !== "New thread") continue;
        const titleContainer = paragraph.parentElement;
        if (titleContainer === null) continue;
        const center = titleContainer.parentElement;
        if (center !== null) return { center, titleContainer };
      }
    }
    ancestor = ancestor.parentElement;
  }
  return null;
}

export interface NewThreadBreadcrumbMount {
  root: HTMLElement;
  sectionTarget: HTMLElement;
  projectPlaceholder: HTMLElement;
  projectSeparatorTarget: HTMLElement;
  cleanup(): void;
}

/**
 * Places bb's native project control over a breadcrumb prefix for New thread.
 *
 * The control stays under its original React parent. bb deliberately refuses
 * content scripts that reparent a React-owned host node, because a later host
 * removal or reorder would otherwise crash React's commit. Fixed positioning
 * preserves the real trigger, menu anchor, focus, and state while its header
 * placeholder reserves exactly the space it paints into.
 */
export function installNewThreadBreadcrumbs(
  composer: HTMLElement,
): NewThreadBreadcrumbMount | null {
  const projectControl = composer.querySelector<HTMLElement>(
    "[data-promptbox-project-control]",
  );
  const header = findNewThreadHeader(composer);
  const originalParent = projectControl?.parentElement ?? null;
  const mountParent = header?.center ?? composer.parentElement;
  const insertBefore = header?.titleContainer ?? composer;
  if (
    projectControl === null ||
    originalParent === null ||
    mountParent === null ||
    insertBefore.parentElement !== mountParent
  ) {
    return null;
  }

  const originalStyle = projectControl.getAttribute("style");
  const projectRect = projectControl.getBoundingClientRect();
  const root = composer.ownerDocument.createElement("span");
  root.dataset.composerBreadcrumbsRoot = "";
  root.dataset.bbPluginRoot = "";
  root.dataset.bbPortaledOverlay = "";
  if (typeof __BB_PLUGIN_ID__ === "string") {
    root.dataset.bbPlugin = __BB_PLUGIN_ID__;
  }
  root.className =
    "-mr-0.5 inline-flex min-w-0 shrink-0 items-center gap-1.5 text-sm font-semibold";

  const sectionTarget = composer.ownerDocument.createElement("span");
  sectionTarget.className = "contents";
  const projectPlaceholder = composer.ownerDocument.createElement("span");
  projectPlaceholder.dataset.composerProjectPlaceholder = "";
  projectPlaceholder.className = "inline-block shrink-0";
  const projectWidth = projectRect.width || projectControl.offsetWidth;
  const projectHeight = projectRect.height || projectControl.offsetHeight;
  if (projectWidth > 0) projectPlaceholder.style.width = `${projectWidth}px`;
  if (projectHeight > 0) projectPlaceholder.style.height = `${projectHeight}px`;
  const projectSeparatorTarget = composer.ownerDocument.createElement("span");
  projectSeparatorTarget.className = "contents";
  root.append(sectionTarget, projectPlaceholder, projectSeparatorTarget);
  if (header === null) {
    const title = composer.ownerDocument.createElement("span");
    title.dataset.composerNewThreadTitle = "";
    title.textContent = "New thread";
    root.append(title);
  }
  mountParent.insertBefore(root, insertBefore);

  let positionFrame: number | ReturnType<typeof setTimeout> | null = null;
  const positionProject = () => {
    positionFrame = null;
    if (!root.isConnected) return;
    const currentProjectRect = projectControl.getBoundingClientRect();
    if (currentProjectRect.width > 0) {
      projectPlaceholder.style.width = `${currentProjectRect.width}px`;
    }
    if (currentProjectRect.height > 0) {
      projectPlaceholder.style.height = `${currentProjectRect.height}px`;
    }
    const placeholderRect = projectPlaceholder.getBoundingClientRect();
    projectControl.style.position = "fixed";
    projectControl.style.left = `${placeholderRect.left}px`;
    projectControl.style.top = `${placeholderRect.top}px`;
    projectControl.style.zIndex = "50";
    projectControl.style.margin = "0";
  };
  const schedulePosition = () => {
    if (positionFrame !== null) return;
    positionFrame =
      typeof requestAnimationFrame === "function"
        ? requestAnimationFrame(positionProject)
        : setTimeout(positionProject, 0);
  };
  positionProject();

  const geometryObserver = new MutationObserver(schedulePosition);
  geometryObserver.observe(root, { childList: true, subtree: true });
  const resizeObserver =
    typeof ResizeObserver === "function"
      ? new ResizeObserver(schedulePosition)
      : null;
  resizeObserver?.observe(root);
  resizeObserver?.observe(projectControl);
  window.addEventListener("resize", schedulePosition);
  window.addEventListener("scroll", schedulePosition, true);

  const observer = new MutationObserver(() => {
    if (!mountParent.isConnected || root.parentElement === mountParent) {
      return;
    }
    mountParent.insertBefore(root, insertBefore);
    schedulePosition();
  });
  observer.observe(mountParent, { childList: true });

  let cleanedUp = false;
  return {
    root,
    sectionTarget,
    projectPlaceholder,
    projectSeparatorTarget,
    cleanup() {
      if (cleanedUp) return;
      cleanedUp = true;
      observer.disconnect();
      geometryObserver.disconnect();
      resizeObserver?.disconnect();
      window.removeEventListener("resize", schedulePosition);
      window.removeEventListener("scroll", schedulePosition, true);
      if (positionFrame !== null) {
        if (
          typeof positionFrame === "number" &&
          typeof cancelAnimationFrame === "function"
        ) {
          cancelAnimationFrame(positionFrame);
        } else {
          clearTimeout(positionFrame);
        }
      }
      if (originalStyle === null) projectControl.removeAttribute("style");
      else projectControl.setAttribute("style", originalStyle);
      root.remove();
    },
  };
}

/** Hides only bb's project summary in an existing thread composer footer. */
export function hideThreadComposerProject(composer: HTMLElement): () => void {
  const priorHidden = new Map<HTMLElement, boolean>();
  const hide = () => {
    for (const project of Array.from(
      composer.querySelectorAll<HTMLElement>(
        '[data-follow-up-composer-footer] [title^="Project: "]',
      ),
    )) {
      if (!priorHidden.has(project)) priorHidden.set(project, project.hidden);
      project.hidden = true;
    }
  };
  hide();
  const observer = new MutationObserver(hide);
  observer.observe(composer, { childList: true, subtree: true });

  return () => {
    observer.disconnect();
    for (const [project, hidden] of priorHidden) project.hidden = hidden;
  };
}

/** Delivers a section target through the same BrowserRouter state bb consumes. */
export function selectComposeSection(
  targetWindow: Window,
  sectionId: string | null,
): void {
  const current = targetWindow.history.state;
  const state =
    typeof current === "object" && current !== null ? { ...current } : {};
  const currentUserState = Reflect.get(state, "usr");
  const usr =
    typeof currentUserState === "object" && currentUserState !== null
      ? { ...currentUserState }
      : {};
  Reflect.set(usr, "sectionId", sectionId ?? "");
  Reflect.set(state, "usr", usr);
  targetWindow.history.replaceState(state, "", targetWindow.location.href);
  targetWindow.dispatchEvent(new PopStateEvent("popstate", { state }));
}

export function readComposeSectionId(targetWindow: Window): string | null {
  const state = targetWindow.history.state;
  if (typeof state !== "object" || state === null) return null;
  const usr = Reflect.get(state, "usr");
  if (typeof usr !== "object" || usr === null) return null;
  const sectionId = Reflect.get(usr, "sectionId");
  return typeof sectionId === "string" && sectionId.trim() !== ""
    ? sectionId
    : null;
}
