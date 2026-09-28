import {
  Folder02Icon,
  FolderClosedIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { type CSSProperties, useId, useLayoutEffect, useRef, useState } from "react";
import { bookFrame, folderFrame } from "./standard-icon-motion";
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
export const OpenBookIcon: IconSvgElement = [
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
export const ShutBookIcon: IconSvgElement = [
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
  project: { open: [Folder02Icon, "Folder02"], shut: [FolderClosedIcon, "FolderClosed"] },
};

/**
 * One icon for every section, Unorganized included, and one for every project,
 * instead of the icon each chose: a book or a folder, open while its group is.
 *
 * Opening or shutting its group, the book's cover swings over on its spine and
 * the folder's front falls forward or stands back up, alongside the group's
 * own fold. At rest, and without motion, it is the icon itself.
 */
export function StandardHeadingIcon({
  kind,
  collapsed,
}: {
  kind: "project" | "section";
  collapsed: boolean;
}) {
  const [icon, name] = STANDARD_ICONS[kind][collapsed ? "shut" : "open"];
  const frame = useOpening(collapsed ? 0 : 1);
  if (frame === null) {
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
  return (
    <svg
      aria-hidden
      className="size-4 shrink-0"
      data-icon={name}
      data-ribbon-icon-opening={round(frame)}
      fill="none"
      height={16}
      viewBox="0 0 24 24"
      width={16}
    >
      {kind === "section" ? <BookFrame open={frame} /> : <FolderFrame open={frame} />}
    </svg>
  );
}

// As long as the group's own fold, but eased in and out as a thing with weight
// moves: the fold's easing covers most of its ground in the first frame, too
// fast to see the cover swing or the front fall.
const OPENING_MS = 180;
const OPENING_EASING = cubicBezier(0.4, 0, 0.2, 1);

/**
 * How open the icon is drawn while it moves toward `target`, or null at rest.
 * Turning back partway starts from wherever it had got to.
 */
function useOpening(target: 0 | 1): number | null {
  const [frame, setFrame] = useState<number | null>(null);
  const drawn = useRef<number>(target);
  // Before paint, so a click never shows a frame of the icon it is going to.
  useLayoutEffect(() => {
    const from = drawn.current;
    if (from === target) return;
    if (!motionAllowed()) {
      drawn.current = target;
      setFrame(null);
      return;
    }
    const duration = OPENING_MS * Math.abs(target - from);
    setFrame(from);
    // Timed from the first frame drawn, as a Web Animation is: the render
    // that toggled the group can hold that frame back for most of the motion.
    let start: number | undefined;
    let request = requestAnimationFrame(function step() {
      const now = performance.now();
      start ??= now;
      const progress = Math.min(1, (now - start) / duration);
      if (progress >= 1) {
        drawn.current = target;
        setFrame(null);
        return;
      }
      drawn.current = from + (target - from) * OPENING_EASING(progress);
      setFrame(drawn.current);
      request = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(request);
  }, [target]);
  return frame;
}

const round = (n: number) => String(Math.round(n * 100) / 100);

function BookFrame({ open }: { open: number }) {
  const { cover, pages } = bookFrame(open);
  const mask = useId();
  return (
    <>
      <defs>
        {/* The pages show only where the cover is not over them. */}
        <mask height="48" id={mask} maskUnits="userSpaceOnUse" width="48" x="-12" y="-12">
          <rect fill="white" height="48" width="48" x="-12" y="-12" />
          <path d={cover} fill="black" stroke="black" strokeWidth="1.5" />
        </mask>
      </defs>
      <path d={pages} mask={`url(#${mask})`} {...stroke} />
      <path d={cover} {...stroke} />
    </>
  );
}

function FolderFrame({ open }: { open: number }) {
  const { back, tab, front } = folderFrame(open);
  return (
    <>
      <path d={back} {...stroke} />
      <path d={tab} {...stroke} />
      <path d={front} {...stroke} />
    </>
  );
}

function motionAllowed(): boolean {
  return (
    typeof requestAnimationFrame === "function" &&
    !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}

/** A CSS cubic-bézier timing function, solved for its x by bisection. */
function cubicBezier(x1: number, y1: number, x2: number, y2: number) {
  const at = (a: number, b: number, s: number) =>
    3 * (1 - s) * (1 - s) * s * a + 3 * (1 - s) * s * s * b + s * s * s;
  return (x: number) => {
    let low = 0;
    let high = 1;
    for (let step = 0; step < 30; step += 1) {
      const mid = (low + high) / 2;
      if (at(x1, x2, mid) < x) low = mid;
      else high = mid;
    }
    return at(y1, y2, (low + high) / 2);
  };
}
