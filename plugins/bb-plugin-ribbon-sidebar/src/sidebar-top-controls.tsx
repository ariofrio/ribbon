import type { ExperimentalSidebarNavigationProps } from "@get-bb/plugin-sdk/app";
import { useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

// The navigation and thread list are separate host slots. Publish the
// plugin-owned container so the list can keep its controls' React context.
let target: HTMLDivElement | null = null;
const listeners = new Set<() => void>();
function setTarget(next: HTMLDivElement | null) {
  target = next;
  for (const listener of listeners) listener();
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
function snapshot() {
  return target;
}

export function SidebarNavigation({
  experimental_Original: Original,
}: ExperimentalSidebarNavigationProps) {
  return (
    <div>
      <div ref={setTarget} />
      <Original />
    </div>
  );
}

export function SidebarTopControls({ children }: { children: ReactNode }) {
  const container = useSyncExternalStore(subscribe, snapshot);
  const controls = (
    <div
      data-ribbon-sidebar-top-controls=""
      className="bb-sidebar-hover-actions-row flex min-w-0 items-center gap-0.5"
      style={{ marginBottom: 16 }}
    >
      {children}
    </div>
  );
  return container === null ? controls : createPortal(controls, container);
}
