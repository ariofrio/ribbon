import type { ReactNode } from "react";

export function SidebarTopControls({ children }: { children: ReactNode }) {
  // The section gap also leaves room for the next sticky heading's background.
  return (
    <div
      data-ribbon-sidebar-top-controls=""
      className="bb-sidebar-hover-actions-row mb-4 flex min-w-0 items-center gap-0.5"
    >
      {children}
    </div>
  );
}
