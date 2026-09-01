import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

const PRIMARY_ACTIONS_SELECTOR = '[data-testid="app-sidebar-primary-actions"]';
const SIDEBAR_SELECTOR = '[data-sidebar="sidebar"]';

export function SidebarTopControls({ children }: { children: ReactNode }) {
  const markerRef = useRef<HTMLSpanElement>(null);
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    if (markerRef.current === null) return;
    const marker = markerRef.current as HTMLSpanElement;
    let currentHost: HTMLElement | null = null;

    function sync() {
      const sidebar = marker.closest<HTMLElement>(SIDEBAR_SELECTOR);
      const primaryActions = sidebar?.querySelector<HTMLElement>(
        PRIMARY_ACTIONS_SELECTOR,
      );
      if (primaryActions === null || primaryActions === undefined) return;
      if (currentHost?.parentElement === primaryActions) return;
      currentHost?.remove();
      currentHost = marker.ownerDocument.createElement("div");
      currentHost.dataset.bbPlugin = "ribbon-sidebar";
      currentHost.dataset.ribbonSidebarTopControls = "";
      currentHost.className = "mb-2 flex min-w-0 items-center gap-1";
      primaryActions.prepend(currentHost);
      setPortalHost(currentHost);
    }

    const observer = new MutationObserver(sync);
    observer.observe(marker.ownerDocument.documentElement, {
      childList: true,
      subtree: true,
    });
    sync();
    return () => {
      observer.disconnect();
      currentHost?.remove();
      setPortalHost(null);
    };
  }, []);

  return (
    <>
      <span aria-hidden data-ribbon-sidebar-top-controls-marker ref={markerRef} />
      {portalHost === null ? children : createPortal(children, portalHost)}
    </>
  );
}
