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

const pendingGeometryRefresh = new WeakSet<HTMLElement>();

/** React layout effects can move another window without resizing that window.
 * Coalesce requests in a microtask before the next paint. */
export function refreshSidebarScrollWindows(element: HTMLElement): void {
  if (pendingGeometryRefresh.has(element)) return;
  pendingGeometryRefresh.add(element);
  queueMicrotask(() => {
    pendingGeometryRefresh.delete(element);
    subscriptions.get(element)?.handle();
  });
}
