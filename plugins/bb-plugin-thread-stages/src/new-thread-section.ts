const THREAD_FILTER_STORAGE_KEY = "bb.plugin.thread-stages.threadFilter";
const SECTION_FILTER_PREFIX = "section:";
export const THREAD_FILTER_CHANGED_EVENT =
  "bb.thread-stages.thread-filter-changed";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function composeDestination(
  location: Location,
  url: string | URL | null | undefined,
): boolean {
  if (url === undefined || url === null) return false;
  const destination = new URL(String(url), location.href);
  if (destination.origin !== location.origin) return false;
  return (
    destination.pathname === "/" ||
    /^\/projects\/[^/]+\/?$/u.test(destination.pathname)
  );
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
    usr: { ...userState, sectionId },
  };
}

export function mountSectionAwareComposeNavigation(
  target: Window,
): () => void {
  const history = target.history;
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;

  const sectionState = (
    state: unknown,
    url: string | URL | null | undefined,
  ): unknown => {
    if (!composeDestination(target.location, url)) return state;
    const sectionId = selectedSectionId(target.localStorage);
    return sectionId === undefined
      ? state
      : withSelectedSection(state, sectionId);
  };

  const pushState: History["pushState"] = function (
    state,
    unused,
    url,
  ) {
    return originalPushState.call(history, sectionState(state, url), unused, url);
  };
  const replaceState: History["replaceState"] = function (
    state,
    unused,
    url,
  ) {
    return originalReplaceState.call(
      history,
      sectionState(state, url),
      unused,
      url,
    );
  };

  history.pushState = pushState;
  history.replaceState = replaceState;

  const syncOpenComposer = () => {
    if (!composeDestination(target.location, target.location.href)) return;
    const sectionId = selectedSectionId(target.localStorage) ?? null;
    originalReplaceState.call(
      history,
      withSelectedSection(history.state, sectionId),
      "",
      target.location.href,
    );
    target.dispatchEvent(
      new PopStateEvent("popstate", { state: history.state }),
    );
  };
  target.addEventListener(THREAD_FILTER_CHANGED_EVENT, syncOpenComposer);

  return () => {
    target.removeEventListener(THREAD_FILTER_CHANGED_EVENT, syncOpenComposer);
    if (history.pushState === pushState) history.pushState = originalPushState;
    if (history.replaceState === replaceState) {
      history.replaceState = originalReplaceState;
    }
  };
}
