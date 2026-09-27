import {
  Book03Icon,
  BookOpen01Icon,
  Folder02Icon,
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

// book-open-01 spans y 3.5 to 20.5; book-03 spans y 2 to 22.
const SHUT_BOOK_SCALE = 17 / 20;

/**
 * book-03 as the open book folded shut: without the spine line inside its
 * cover, and scaled about its centre to the open book's height, so opening a
 * section reads as the one book spreading out. The stroke is widened by the
 * same factor, so it still draws at the weight every other icon does.
 */
const ShutBookIcon: IconSvgElement = Book03Icon.filter(
  ([, attrs]) => attrs.d !== "M8 2V18",
).map(([tag, attrs]) => [
  tag,
  {
    ...attrs,
    strokeWidth: String(1.5 / SHUT_BOOK_SCALE),
    transform: `translate(12 12) scale(${SHUT_BOOK_SCALE}) translate(-12 -12)`,
  },
]);

const STANDARD_ICONS: Record<
  "project" | "section",
  Record<"open" | "shut", [IconSvgElement, string]>
> = {
  section: { open: [BookOpen01Icon, "BookOpen01"], shut: [ShutBookIcon, "BookClosed"] },
  project: { open: [Folder02Icon, "Folder02"], shut: [FolderClosedIcon, "FolderClosed"] },
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
