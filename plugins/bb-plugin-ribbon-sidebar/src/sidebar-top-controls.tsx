import type { ReactNode } from "react";

export function SidebarTopControls({ children }: { children: ReactNode }) {
  return (
    <div
      data-ribbon-sidebar-top-controls=""
      className="bb-sidebar-hover-actions-row mb-1 flex min-w-0 items-center gap-0.5"
    >
      {children}
    </div>
  );
}
