export * from "@/components/ui/sidebar-row-classes";

// The accent can be translucent. Sticky rows need the sidebar beneath it so
// descendants scrolling under a hovered or focused parent stay covered.
export const SIDEBAR_STICKY_ROW_INTERACTIVE_SURFACE_CLASS =
  "hover:bg-[linear-gradient(var(--sidebar-accent),var(--sidebar-accent)),linear-gradient(var(--sidebar),var(--sidebar))] has-[[data-state=open]]:bg-[linear-gradient(var(--sidebar-accent),var(--sidebar-accent)),linear-gradient(var(--sidebar),var(--sidebar))] has-[[data-sidebar-rename-anchor]:focus-visible]:bg-[linear-gradient(var(--sidebar-accent),var(--sidebar-accent)),linear-gradient(var(--sidebar),var(--sidebar))]";

// Ribbon uses a compact glyph with bb's full pointer target.
export const SIDEBAR_MORE_ACTION_TRIGGER_CLASS =
  "relative m-1 h-5 w-5 after:absolute after:left-1/2 after:top-1/2 after:h-7 after:w-7 after:-translate-x-1/2 after:-translate-y-1/2 after:content-[''] max-md:pointer-coarse:m-0 max-md:pointer-coarse:h-9 max-md:pointer-coarse:w-9 max-md:pointer-coarse:after:hidden";
