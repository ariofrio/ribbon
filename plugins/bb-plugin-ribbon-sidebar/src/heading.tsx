import {
  Folder03Icon,
  FolderClosedIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
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
 * Every heading is a faint wash with ink on it. A project or section whose icon
 * has a color takes that color's hue: the Icons plugin sets the color on any
 * element that names the owner, and only where someone picked one. Every other
 * heading is the same family in gray.
 *
 * The Icons palette is tuned for small glyphs, where one hue can run far hotter
 * than another, so a heading keeps only the hue, at one lightness and chroma
 * per mode for every color.
 */
export function headingColorStyle(kind?: "project" | "section"): CSSProperties {
  if (kind === undefined) {
    return {
      backgroundColor: GRAY.fill,
      ["--ribbon-heading-on" as string]: GRAY.ink,
    };
  }
  const color = `var(--ribbon-icons-${kind}-color-light)`;
  const tone = (light: string, dark: string) =>
    `light-dark(oklch(from ${color} ${light} h), oklch(from ${color} ${dark} h))`;
  return {
    ["--ribbon-heading-fill" as string]: tone(FILL.light, FILL.dark),
    ["--ribbon-heading-ink" as string]: tone(INK.light, INK.dark),
    backgroundColor: `var(--ribbon-heading-fill, ${GRAY.fill})`,
    ["--ribbon-heading-on" as string]: `var(--ribbon-heading-ink, ${GRAY.ink})`,
  };
}

/** Lightness and chroma per mode; the hue is the palette color's own. */
const FILL = { light: "0.95 0.025", dark: "0.28 0.035" };
const INK = { light: "0.47 0.13", dark: "0.82 0.11" };
const GRAY = {
  fill: "light-dark(oklch(0.95 0 0), oklch(0.28 0 0))",
  ink: "light-dark(oklch(0.47 0 0), oklch(0.82 0 0))",
};

/**
 * bb shields each sticky heading's top with a band of sidebar as tall as the
 * stack's padding. Headings sit a row's gap apart, so that band would paint
 * over the bottom of a collapsed heading above; the stack's own sticky band
 * already covers its padding.
 */
export const STICKY_HEADING_STYLE: CSSProperties = {
  ["--bb-sidebar-sticky-tier-shield-top-height" as string]: "0px",
};

/** The heading's icon takes the heading's ink. */
export const HEADING_ICON_STYLE: CSSProperties = {
  backgroundColor: "var(--ribbon-heading-on, currentColor)",
};

/**
 * The size the heading's toggle button was, set a little closer to the title,
 * and always shown.
 */
export function HeadingChevron({ collapsed }: { collapsed: boolean }) {
  return (
    <span
      aria-hidden
      className={`mr-2 ml-1 flex size-5 shrink-0 items-center justify-center ${HEADING_MUTED_CLASS}`}
      data-ribbon-heading-chevron=""
      // Only a picture of the heading's toggle, which lies under it.
      style={{ pointerEvents: "none" }}
    >
      <Icon
        aria-hidden
        className={`size-3 transition-transform duration-150 ${collapsed ? "" : "rotate-90"}`}
        name="ChevronRight"
      />
    </span>
  );
}

const stroke = {
  stroke: "currentColor",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  strokeWidth: "1.5",
} as const;

const path = (d: string, key: string): IconSvgElement[number] => [
  "path",
  { d, ...stroke, key },
];

/**
 * The section books, remapped point by point from Hugeicons so the stroke
 * keeps its usual weight. Both span y 3 to 21, as tall as the folders.
 *
 * Open, book-open-01: its pages span y 3 to 18 and its spine drops to 21.
 */
const OpenBookIcon: IconSvgElement = [
  path(
    "M8 3H6.6C4.432 3 3.348 3 2.674 3.697C2 4.394 2 5.515 2 7.758L2 13.241C2 15.485 2 16.606 2.674 17.303C3.347 18 4.431 18 6.6 18H8.95C10.433 18 11.709 19.256 12 21V5.069C11.056 3.767 10 3 8 3Z",
    "0",
  ),
  path(
    "M16 3H17.4C19.568 3 20.652 3 21.326 3.697C22 4.394 22 5.515 22 7.758L22 13.241C22 15.485 22 16.606 21.326 17.303C20.653 18 19.568 18 17.4 18H15.05C13.567 18 12.291 19.256 12 21V5.069C12.944 3.767 14 3 16 3Z",
    "1",
  ),
];

/**
 * Shut, book-03 as that book folded: without the spine line inside its cover,
 * at 85% of its width about the centre, its cover spans the open pages (y 3 to
 * 18) and its page strip the spine's drop (18 to 21). Opening a section reads
 * as this one book spreading out.
 */
const ShutBookIcon: IconSvgElement = [
  path(
    "M18.8 21H6.9C5.961 21 5.2 20.328 5.2 19.5M5.2 19.5C5.2 18.672 5.961 18 6.9 18H18.8V6.75C18.8 4.982 18.8 4.098 18.302 3.549C17.804 3 17.003 3 15.4 3H10.3C7.896 3 6.694 3 5.947 3.824C5.2 4.648 5.2 5.973 5.2 8.625V19.5Z",
    "0",
  ),
  path(
    "M18.375 18C18.375 18 17.525 18.572 17.525 19.5C17.525 20.428 18.375 21 18.375 21",
    "1",
  ),
];

const STANDARD_ICONS: Record<
  "project" | "section",
  Record<"open" | "shut", [IconSvgElement, string]>
> = {
  section: { open: [OpenBookIcon, "BookOpen"], shut: [ShutBookIcon, "BookClosed"] },
  project: { open: [Folder03Icon, "Folder03"], shut: [FolderClosedIcon, "FolderClosed"] },
};

/**
 * One icon for every section, Unorganized included, and one for every project,
 * instead of the icon each chose: a book or a folder, open while its group is.
 */
export function StandardHeadingIcon({
  kind,
  collapsed,
}: {
  kind: "project" | "section";
  collapsed: boolean;
}) {
  const [icon, name] = STANDARD_ICONS[kind][collapsed ? "shut" : "open"];
  return (
    <HugeiconsIcon
      aria-hidden
      className="size-4 shrink-0"
      data-icon={name}
      icon={icon}
      size={16}
    />
  );
}
