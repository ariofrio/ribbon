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
 * Every heading is a filled bar with white on it. A project or section whose
 * icon has a color takes that color's hue: the Icons plugin sets the color on
 * any element that names the owner, and only where someone picked one. Every
 * other heading is gray.
 *
 * The Icons palette is tuned for small glyphs, where one hue can run far hotter
 * than another, so a bar keeps only the hue, at one lightness and chroma for
 * every color, darker in dark mode so the bars do not glare.
 */
export function headingColorStyle(kind?: "project" | "section"): CSSProperties {
  if (kind === undefined) {
    return {
      backgroundColor: GRAY_FILL,
      ["--ribbon-heading-on" as string]: "white",
    };
  }
  const color = `var(--ribbon-icons-${kind}-color-light)`;
  return {
    ["--ribbon-heading-fill" as string]:
      `light-dark(oklch(from ${color} ${FILL.light} h), oklch(from ${color} ${FILL.dark} h))`,
    backgroundColor: `var(--ribbon-heading-fill, ${GRAY_FILL})`,
    ["--ribbon-heading-on" as string]: `var(--ribbon-icons-${kind}-on-color-light, white)`,
  };
}

/** Lightness and chroma per mode; the hue is the palette color's own. */
const FILL = { light: "0.56 0.14", dark: "0.44 0.11" };
const GRAY_FILL = "light-dark(oklch(0.56 0 0), oklch(0.44 0 0))";

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
