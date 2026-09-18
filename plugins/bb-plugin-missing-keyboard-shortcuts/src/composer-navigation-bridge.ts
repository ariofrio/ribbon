import {
  selectPanelTabWhenReady,
  type PanelTabIcon,
  type PanelTabObserver,
  type PanelTabRoot,
} from "./panel-tab-selection";

type FocusComposer = () => void;

interface PrimaryPanelTabHost {
  createObserver(callback: () => void): PanelTabObserver;
  root: PanelTabRoot;
}

interface PrimaryComposerRegistration {
  focus: FocusComposer;
  panelTabHost?: PrimaryPanelTabHost;
}

interface SecondaryComposerRegistration {
  focus: FocusComposer;
  isFocused: () => boolean;
  isVisible: () => boolean;
  observeReadiness?: (listener: () => void) => () => void;
}

const primaryComposersByThread = new Map<
  string | null,
  PrimaryComposerRegistration[]
>();
const secondaryComposersByParent = new Map<
  string,
  Map<string, SecondaryComposerRegistration[]>
>();
const secondaryComposerReadyListeners = new Map<
  string,
  Map<string, Set<() => void>>
>();

export function registerPrimaryComposerFocus(
  threadId: string | null,
  focusComposer: FocusComposer,
  panelTabHost?: PrimaryPanelTabHost,
): () => void {
  const registrations = primaryComposersByThread.get(threadId) ?? [];
  const registration = { focus: focusComposer, panelTabHost };
  registrations.push(registration);
  primaryComposersByThread.set(threadId, registrations);
  return () => {
    const index = registrations.lastIndexOf(registration);
    if (index !== -1) registrations.splice(index, 1);
    if (
      registrations.length === 0 &&
      primaryComposersByThread.get(threadId) === registrations
    ) {
      primaryComposersByThread.delete(threadId);
    }
  };
}

export function hasPrimaryComposer(threadId: string | null): boolean {
  return (primaryComposersByThread.get(threadId)?.length ?? 0) > 0;
}

export function focusPrimaryComposer(threadId: string | null): boolean {
  const registration = primaryComposersByThread.get(threadId)?.at(-1);
  if (registration === undefined) return false;
  registration.focus();
  return true;
}

interface SelectPrimaryPanelTabWhenReadyOptions {
  icon: PanelTabIcon;
  index(): number;
  isCurrent(): boolean;
  signal: AbortSignal;
}

export function selectPrimaryPanelTabWhenReady(
  threadId: string,
  options: SelectPrimaryPanelTabWhenReadyOptions,
): () => void {
  const panelTabHost = primaryComposersByThread
    .get(threadId)
    ?.at(-1)?.panelTabHost;
  if (panelTabHost === undefined) return () => {};
  return selectPanelTabWhenReady({ ...panelTabHost, ...options });
}

export function registerSecondaryComposer(
  parentThreadId: string,
  childThreadId: string,
  registration: SecondaryComposerRegistration,
): () => void {
  let byChild = secondaryComposersByParent.get(parentThreadId);
  if (byChild === undefined) {
    byChild = new Map();
    secondaryComposersByParent.set(parentThreadId, byChild);
  }
  const registrations = byChild.get(childThreadId) ?? [];
  registrations.push(registration);
  byChild.set(childThreadId, registrations);
  const notifyReady = () => {
    for (const listener of secondaryComposerReadyListeners
      .get(parentThreadId)
      ?.get(childThreadId) ?? []) {
      listener();
    }
  };
  const stopObserving = registration.observeReadiness?.(notifyReady);
  notifyReady();
  return () => {
    stopObserving?.();
    const index = registrations.lastIndexOf(registration);
    if (index !== -1) registrations.splice(index, 1);
    if (registrations.length === 0) byChild?.delete(childThreadId);
    if (byChild?.size === 0) secondaryComposersByParent.delete(parentThreadId);
  };
}

export function focusSecondaryComposer(
  parentThreadId: string,
  childThreadId: string,
): boolean {
  const registrations = secondaryComposersByParent
    .get(parentThreadId)
    ?.get(childThreadId);
  if (registrations === undefined) return false;
  for (let index = registrations.length - 1; index >= 0; index -= 1) {
    const registration = registrations[index];
    if (registration?.isVisible()) {
      registration.focus();
      return registration.isFocused();
    }
  }
  return false;
}

interface FocusSecondaryComposerWhenReadyOptions {
  isCurrent(): boolean;
  signal: AbortSignal;
}

export function focusSecondaryComposerWhenReady(
  parentThreadId: string,
  childThreadId: string,
  { isCurrent, signal }: FocusSecondaryComposerWhenReadyOptions,
): () => void {
  if (signal.aborted) return () => {};

  let byChild = secondaryComposerReadyListeners.get(parentThreadId);
  if (byChild === undefined) {
    byChild = new Map();
    secondaryComposerReadyListeners.set(parentThreadId, byChild);
  }
  const listeners = byChild.get(childThreadId) ?? new Set<() => void>();
  byChild.set(childThreadId, listeners);
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    listeners.delete(attempt);
    if (listeners.size === 0) byChild?.delete(childThreadId);
    if (byChild?.size === 0) {
      secondaryComposerReadyListeners.delete(parentThreadId);
    }
    signal.removeEventListener("abort", stop);
  };
  const attempt = () => {
    if (stopped) return;
    if (
      !isCurrent() ||
      focusSecondaryComposer(parentThreadId, childThreadId)
    ) {
      stop();
    }
  };
  listeners.add(attempt);
  signal.addEventListener("abort", stop, { once: true });
  attempt();
  return stop;
}

export function isSecondaryComposerFocused(
  parentThreadId: string,
  childThreadId: string,
): boolean {
  return (
    secondaryComposersByParent
      .get(parentThreadId)
      ?.get(childThreadId)
      ?.some(({ isFocused }) => isFocused()) ?? false
  );
}

export function focusedSecondaryComposerThreadId(
  parentThreadId: string,
): string | null {
  const byChild = secondaryComposersByParent.get(parentThreadId);
  if (byChild === undefined) return null;
  for (const [childThreadId, registrations] of byChild) {
    if (registrations.some(({ isFocused }) => isFocused())) {
      return childThreadId;
    }
  }
  return null;
}
