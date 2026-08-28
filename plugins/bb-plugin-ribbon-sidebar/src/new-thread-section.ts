import { SIDEBAR_PREFERENCES_KEY } from "./view-state";
import type { GroupRef } from "./view-state";

export const RIBBON_SIDEBAR_PREFERENCES_CHANGED_EVENT =
  "bb.ribbon-sidebar.preferences-changed";
export const RIBBON_SIDEBAR_NEW_THREAD_GROUP_REQUESTED_EVENT =
  "bb.ribbon-sidebar.new-thread-group-requested";
export const RIBBON_SIDEBAR_NEW_THREAD_PROJECT_REQUESTED_EVENT =
  "bb.ribbon-sidebar.new-thread-project-requested";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function selectedGroup(storage: Storage): GroupRef | null | undefined {
  const raw = storage.getItem(SIDEBAR_PREFERENCES_KEY);
  if (raw === null) return undefined;
  try {
    const preferences: unknown = JSON.parse(raw);
    if (!isRecord(preferences) || !isRecord(preferences.view)) return undefined;
    const { scope } = preferences.view;
    if (isRecord(scope) && scope.kind === "all") return null;
    if (!isRecord(scope) || scope.kind !== "group" || !isRecord(scope.group)) {
      return undefined;
    }
    const { groupingKey, groupId } = scope.group;
    if (
      typeof groupingKey !== "string" ||
      typeof groupId !== "string" ||
      groupId.length === 0
    ) {
      return undefined;
    }
    return { groupingKey: groupingKey as GroupRef["groupingKey"], groupId };
  } catch {
    return undefined;
  }
}

function withSelectedSection(
  state: unknown,
  sectionId: string | null | undefined,
): unknown {
  const routerState = isRecord(state) ? state : {};
  const userState = isRecord(routerState.usr) ? routerState.usr : {};
  if (sectionId === undefined) {
    const { sectionId: _sectionId, ...rest } = userState;
    return { ...routerState, usr: rest };
  }
  return {
    ...routerState,
    usr: { ...userState, sectionId: sectionId ?? "" },
  };
}

const NEW_THREAD_COMPOSER_SELECTOR =
  '[data-app-composer][data-app-composer-role="primary"]';

function newThreadComposers(target: Window): HTMLElement[] {
  return Array.from(
    target.document.querySelectorAll<HTMLElement>(
      NEW_THREAD_COMPOSER_SELECTOR,
    ),
  ).filter(
    (composer) =>
      composer.querySelector("[data-promptbox-project-control]") !== null,
  );
}

function isNewThreadComposer(element: Element): element is HTMLElement {
  return (
    element instanceof HTMLElement &&
    element.matches(NEW_THREAD_COMPOSER_SELECTOR) &&
    element.querySelector("[data-promptbox-project-control]") !== null
  );
}

function addedNewThreadComposers(
  records: readonly MutationRecord[],
): HTMLElement[] {
  const composers = new Set<HTMLElement>();
  for (const record of records) {
    for (const node of Array.from<Node>(record.addedNodes)) {
      const element = node instanceof Element ? node : node.parentElement;
      if (element === null) continue;
      const ancestor = element.closest(NEW_THREAD_COMPOSER_SELECTOR);
      if (ancestor !== null && isNewThreadComposer(ancestor)) {
        composers.add(ancestor);
      }
      if (isNewThreadComposer(element)) composers.add(element);
      for (const candidate of Array.from<Element>(
        element.querySelectorAll<Element>(NEW_THREAD_COMPOSER_SELECTOR),
      )) {
        if (isNewThreadComposer(candidate)) composers.add(candidate);
      }
    }
  }
  return [...composers];
}

function selectComposeSection(
  target: Window,
  sectionId: string | null | undefined,
): void {
  const state = withSelectedSection(target.history.state, sectionId);
  target.history.replaceState(state, "", target.location.href);
  target.dispatchEvent(new PopStateEvent("popstate", { state }));
}

function requestComposeProject(target: Window, group: GroupRef | null): void {
  if (group?.groupingKey !== "builtin:projects") return;
  target.dispatchEvent(
    new CustomEvent(RIBBON_SIDEBAR_NEW_THREAD_PROJECT_REQUESTED_EVENT, {
      detail: group.groupId,
    }),
  );
}

export function mountGroupAwareThreadCreation(
  target: Window,
): () => void {
  const initializedComposers = new WeakSet<HTMLElement>();
  const syncComposers = (composers: readonly HTMLElement[]) => {
    let discoveredComposer = false;
    for (const composer of composers) {
      if (initializedComposers.has(composer)) continue;
      initializedComposers.add(composer);
      discoveredComposer = true;
    }
    if (!discoveredComposer) return;
    const group = selectedGroup(target.localStorage);
    if (group === undefined) return;
    requestComposeProject(target, group);
    selectComposeSection(
      target,
      group?.groupingKey === "builtin:sections"
        ? group.groupId === "unsectioned"
          ? null
          : group.groupId
        : undefined,
    );
  };
  const syncNewComposers = (records: MutationRecord[]) => {
    syncComposers(addedNewThreadComposers(records));
  };
  const syncOpenComposers = () => {
    const group = selectedGroup(target.localStorage);
    if (group === undefined || newThreadComposers(target).length === 0) {
      return;
    }
    requestComposeProject(target, group);
    selectComposeSection(
      target,
      group?.groupingKey === "builtin:sections"
        ? group.groupId === "unsectioned"
          ? null
          : group.groupId
        : undefined,
    );
  };
  const captureSelectedGroup = (event: SubmitEvent) => {
    if (!(event.target instanceof HTMLFormElement)) return;
    const form = event.target;
    const isNewThreadForm = newThreadComposers(target).some(
      (composer) => composer === form || form.contains(composer),
    );
    if (!isNewThreadForm) return;
    const group = selectedGroup(target.localStorage);
    if (
      group === undefined ||
      group === null ||
      !group.groupingKey.startsWith("plugin:")
    ) {
      return;
    }
    target.dispatchEvent(
      new CustomEvent(RIBBON_SIDEBAR_NEW_THREAD_GROUP_REQUESTED_EVENT, {
        detail: group,
      }),
    );
  };
  const observer = new MutationObserver(syncNewComposers);
  observer.observe(target.document.body, { childList: true, subtree: true });
  syncComposers(newThreadComposers(target));
  target.addEventListener(
    RIBBON_SIDEBAR_PREFERENCES_CHANGED_EVENT,
    syncOpenComposers,
  );
  target.document.addEventListener("submit", captureSelectedGroup, true);

  return () => {
    observer.disconnect();
    target.removeEventListener(
      RIBBON_SIDEBAR_PREFERENCES_CHANGED_EVENT,
      syncOpenComposers,
    );
    target.document.removeEventListener("submit", captureSelectedGroup, true);
  };
}
