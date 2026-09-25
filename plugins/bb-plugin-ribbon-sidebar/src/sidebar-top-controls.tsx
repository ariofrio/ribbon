import type { ReactNode } from "react";

export function SidebarTopControls({ children }: { children: ReactNode }) {
  // The next sticky heading paints its background upward by this padding.
  return (
    <div
      data-ribbon-sidebar-top-controls=""
      className="bb-sidebar-hover-actions-row mb-[var(--bb-sidebar-sticky-stack-padding)] flex min-w-0 items-center gap-0.5"
    >
      {children}
    </div>
  );
}
