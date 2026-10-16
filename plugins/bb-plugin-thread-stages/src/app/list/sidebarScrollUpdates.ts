import { flushSync } from "react-dom";
const subscriptions = new WeakMap<
  HTMLElement,
  { listeners: Set<() => void>; handle: () => void }
>();
export function subscribeSidebarScroll(
  element: HTMLElement,
  listener: () => void,
): () => void {
  let group = subscriptions.get(element);
  if (!group) {
    const listeners = new Set<() => void>();
    group = {
      listeners,
      handle: () =>
        flushSync(() => {
          for (const update of listeners) update();
        }),
    };
    subscriptions.set(element, group);
    element.addEventListener("scroll", group.handle, { passive: true });
  }
  group.listeners.add(listener);
  return () => {
    group.listeners.delete(listener);
    if (group.listeners.size === 0) {
      element.removeEventListener("scroll", group.handle);
      subscriptions.delete(element);
    }
  };
}

/** React layout effects can move another window without resizing that window.
 * Reconcile against the committed layout before the next paint. */
export function refreshSidebarScrollWindows(element: HTMLElement): void {
  for (const update of subscriptions.get(element)?.listeners ?? []) update();
}
