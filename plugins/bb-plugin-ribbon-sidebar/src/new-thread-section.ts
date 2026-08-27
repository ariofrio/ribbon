import { SIDEBAR_PREFERENCES_KEY } from "./view-state";

export const RIBBON_SIDEBAR_PREFERENCES_CHANGED_EVENT =
  "bb.ribbon-sidebar.preferences-changed";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function selectedSectionId(storage: Storage): string | null | undefined {
  const raw = storage.getItem(SIDEBAR_PREFERENCES_KEY);
  if (raw === null) return undefined;
  try {
    const preferences: unknown = JSON.parse(raw);
    if (!isRecord(preferences) || !isRecord(preferences.view)) return undefined;
    const { scope } = preferences.view;
    if (!isRecord(scope) || scope.kind !== "group" || !isRecord(scope.group)) {
      return undefined;
    }
    if (scope.group.groupingKey !== "builtin:sections") return undefined;
    const { groupId } = scope.group;
    if (typeof groupId !== "string" || groupId.length === 0) return undefined;
    return groupId === "unsectioned" ? null : groupId;
  } catch {
    return undefined;
  }
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
  target.addEventListener(
    RIBBON_SIDEBAR_PREFERENCES_CHANGED_EVENT,
    syncOpenComposers,
  );

  return () => {
    observer.disconnect();
    target.removeEventListener(
      RIBBON_SIDEBAR_PREFERENCES_CHANGED_EVENT,
      syncOpenComposers,
    );
  };
}
