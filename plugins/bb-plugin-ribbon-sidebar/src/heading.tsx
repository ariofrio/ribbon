import type { CSSProperties } from "react";
import { Icon } from "./vendor/components/ui/icon";

/**
 * A group heading is one button: it covers the whole row, under the heading's
 * content, the way a thread row's link does. The content lets the pointer
 * through, and the heading's own buttons sit above it.
 */
export const HEADING_TOGGLE_CLASS =
  "absolute inset-0 cursor-pointer rounded-md outline-none ring-sidebar-ring focus-visible:ring-2";

/**
 * A heading's label and controls read against its background: the owner's
 * contrasting color where the Icons plugin painted one, and their usual colors
 * everywhere else.
 */
export const HEADING_TEXT_CLASS =
  "text-[color:var(--ribbon-heading-on,currentColor)]";
export const HEADING_MUTED_CLASS =
  "text-[color:var(--ribbon-heading-on,var(--subtle-foreground))]";

/**
 * Fills a project's or section's heading with its icon's color. The Icons
 * plugin sets that color, and a white to read against it, on any element that
 * names the owner, and only where someone picked one; an unpicked heading
 * keeps the sidebar's background.
 *
 * Its palette is tuned for small glyphs, where one hue can run far hotter than
 * another. A whole bar takes only the hue, at one lightness and chroma for
 * every color, darker in dark mode so the bars do not glare.
 */
export function headingColorStyle(kind: "project" | "section"): CSSProperties {
  const color = `var(--ribbon-icons-${kind}-color-light)`;
  return {
    ["--ribbon-heading-fill" as string]:
      `light-dark(oklch(from ${color} ${FILL.light}), oklch(from ${color} ${FILL.dark}))`,
    backgroundColor: "var(--ribbon-heading-fill, var(--sidebar))",
    ["--ribbon-heading-on" as string]: `var(--ribbon-icons-${kind}-on-color-light)`,
  };
}

/** Lightness, chroma, and the palette color's own hue, per mode. */
const FILL = { light: "0.56 0.14 h", dark: "0.44 0.11 h" };

/** The heading's icon turns to the contrasting color, or it would vanish. */
export function headingIconStyle(kind: "project" | "section"): CSSProperties {
  return {
    backgroundColor: `var(--ribbon-icons-${kind}-on-color-light, var(--ribbon-icons-${kind}-color, currentColor))`,
  };
}

/**
 * Where the heading's toggle button used to be, and the same size, so nothing
 * around it moves. Expanded headings show it only on hover, as before.
 */
export function HeadingChevron({ collapsed }: { collapsed: boolean }) {
  return (
    <span
      aria-hidden
      className={`${collapsed ? "" : "bb-sidebar-hover-actions"} mx-2 flex size-5 shrink-0 items-center justify-center ${HEADING_MUTED_CLASS}`}
      data-ribbon-heading-chevron=""
    >
      <Icon
        aria-hidden
        className={`size-3 transition-transform duration-150 ${collapsed ? "" : "rotate-90"}`}
        name="ChevronRight"
      />
    </span>
  );
}
