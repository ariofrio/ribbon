const THREAD_FILTER_STORAGE_KEY = "bb.plugin.thread-stages.threadFilter";
const SECTION_FILTER_PREFIX = "section:";
export const THREAD_FILTER_CHANGED_EVENT =
  "bb.thread-stages.thread-filter-changed";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function selectedSectionId(storage: Storage): string | null | undefined {
  const filter = storage.getItem(THREAD_FILTER_STORAGE_KEY);
  if (filter === "uncategorized") return null;
  if (!filter?.startsWith(SECTION_FILTER_PREFIX)) return undefined;
  const sectionId = filter.slice(SECTION_FILTER_PREFIX.length);
  return sectionId.length > 0 ? sectionId : undefined;
}

function withSelectedSection(
  state: unknown,
  sectionId: string | null,
): unknown {
  const routerState = isRecord(state) ? state : {};
  const userState = isRecord(routerState.usr) ? routerState.usr : {};
  return {
    ...routerState,
    usr: { ...userState, sectionId: sectionId ?? "" },
  };
}

function newThreadComposers(target: Window): HTMLElement[] {
  return Array.from(
    target.document.querySelectorAll<HTMLElement>(
      '[data-app-composer][data-app-composer-role="primary"]',
    ),
  ).filter(
    (composer) =>
      composer.querySelector("[data-promptbox-project-control]") !== null,
  );
}

function selectComposeSection(
  target: Window,
  sectionId: string | null,
): void {
  const state = withSelectedSection(target.history.state, sectionId);
  target.history.replaceState(state, "", target.location.href);
  target.dispatchEvent(new PopStateEvent("popstate", { state }));
}

export function mountSectionAwareComposeNavigation(
  target: Window,
): () => void {
  const initializedComposers = new WeakSet<HTMLElement>();
  const syncNewComposers = () => {
    let discoveredComposer = false;
    for (const composer of newThreadComposers(target)) {
      if (initializedComposers.has(composer)) continue;
      initializedComposers.add(composer);
      discoveredComposer = true;
    }
    if (!discoveredComposer) return;
    const sectionId = selectedSectionId(target.localStorage);
    if (sectionId !== undefined) selectComposeSection(target, sectionId);
  };
  const syncOpenComposers = () => {
    const sectionId = selectedSectionId(target.localStorage);
    if (sectionId === undefined || newThreadComposers(target).length === 0) {
      return;
    }
    selectComposeSection(target, sectionId);
  };
  const observer = new MutationObserver(syncNewComposers);
  observer.observe(target.document.body, { childList: true, subtree: true });
  syncNewComposers();
  target.addEventListener(THREAD_FILTER_CHANGED_EVENT, syncOpenComposers);

  return () => {
    observer.disconnect();
    target.removeEventListener(
      THREAD_FILTER_CHANGED_EVENT,
      syncOpenComposers,
    );
  };
}
