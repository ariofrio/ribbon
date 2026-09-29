import { type CSSProperties, useId, useLayoutEffect, useRef, useState } from "react";
import { bookFrame, folderFrame } from "./standard-icon-motion";
import { Icon } from "@/components/ui/icon";

/**
 * A heading's label and controls read against its background: the owner's
 * contrasting color where the Icons plugin painted one, and their usual colors
 * everywhere else.
 */
export const HEADING_TEXT_CLASS =
  "text-[color:var(--ribbon-heading-on,currentColor)]";
export const HEADING_MUTED_CLASS =
  "text-[color:var(--ribbon-heading-on,var(--subtle-foreground))]";
export const HEADING_ACTION_CLASS = `${HEADING_MUTED_CLASS} hover:bg-[color:var(--ribbon-heading-hover-fill)] hover:text-[color:var(--ribbon-heading-hover-on)] focus-visible:bg-[color:var(--ribbon-heading-hover-fill)] focus-visible:text-[color:var(--ribbon-heading-hover-on)] data-[state=open]:bg-[color:var(--ribbon-heading-hover-fill)] data-[state=open]:text-[color:var(--ribbon-heading-hover-on)] data-[state=open]:hover:bg-[color:var(--ribbon-heading-hover-fill)]`;

/**
 * Every heading is a faint wash with ink on it. A project or section whose icon
 * has a color takes that color's hue, and every other heading is the same
 * family in gray.
 *
 * The icon palette is tuned for small glyphs, where one hue can run far hotter
 * than another, so a heading keeps only the hue, at one lightness and chroma
 * per mode for every color.
 */
export function headingColorStyle(color: string | null = null): CSSProperties {
  if (color === null) {
    return {
      backgroundColor: GRAY.fill,
      ["--ribbon-heading-on" as string]: GRAY.ink,
      ["--ribbon-heading-hover-on" as string]: GRAY.hoverInk,
      ["--ribbon-heading-hover-fill" as string]: HOVER_FILL,
    };
  }
  const tone = (light: string, dark: string) =>
    `light-dark(oklch(from ${color} ${light} h), oklch(from ${color} ${dark} h))`;
  return {
    backgroundColor: tone(FILL.light, FILL.dark),
    ["--ribbon-heading-on" as string]: tone(INK.light, INK.dark),
    ["--ribbon-heading-hover-on" as string]: tone(HOVER_INK.light, HOVER_INK.dark),
    ["--ribbon-heading-hover-fill" as string]: HOVER_FILL,
  };
}

/** Lightness and chroma per mode; the hue is the palette color's own. */
const FILL = { light: "0.95 0.025", dark: "0.28 0.035" };
const INK = { light: "0.47 0.13", dark: "0.82 0.11" };
const HOVER_INK = { light: "0.34 0.15", dark: "0.94 0.13" };
const HOVER_FILL = "color-mix(in srgb, var(--ribbon-heading-hover-on) 15%, transparent)";
const GRAY = {
  fill: "light-dark(oklch(0.95 0 0), oklch(0.28 0 0))",
  ink: "light-dark(oklch(0.47 0 0), oklch(0.82 0 0))",
  hoverInk: "light-dark(oklch(0.34 0 0), oklch(0.94 0 0))",
};

const STANDARD_NAMES = {
  section: { open: "BookOpen", shut: "BookClosed" },
  project: { open: "FolderOpen", shut: "FolderClosed" },
} as const;

const FRAMES = { section: bookFrame, project: folderFrame };

/**
 * One icon for every section, Unorganized included, and one for every project,
 * instead of the icon each chose: a book or a folder, open while its group is.
 *
 * Opening or shutting its group, the book's top page turns over on its spine
 * and the folder's front falls forward or stands back up, as the objects would.
 * Without motion it is drawn straight in its new pose.
 */
export function StandardHeadingIcon({
  kind,
  collapsed,
}: {
  kind: "project" | "section";
  collapsed: boolean;
}) {
  const target = collapsed ? 0 : 1;
  const moving = useOpening(target);
  const { layers } = FRAMES[kind](moving ?? target);
  const mask = useId();
  return (
    <svg
      aria-hidden
      className="size-4 shrink-0"
      data-icon={STANDARD_NAMES[kind][collapsed ? "shut" : "open"]}
      data-ribbon-icon-opening={moving === null ? undefined : String(Math.round(moving * 100) / 100)}
      fill="none"
      height={16}
      overflow="visible"
      viewBox="0 0 24 24"
      width={16}
    >
      {layers.map((layer, index) => {
        // Whatever a nearer part is over is hidden, outline and all.
        const covers = layers.slice(0, index).map((nearer) => nearer.covers).join("");
        const id = `${mask}-${index}`;
        return (
          <g key={index}>
            {covers ? (
              <mask height="48" id={id} maskUnits="userSpaceOnUse" width="48" x="-12" y="-12">
                <rect fill="white" height="48" width="48" x="-12" y="-12" />
                <path d={covers} fill="black" />
              </mask>
            ) : null}
            <path
              d={layer.d}
              mask={covers ? `url(#${id})` : undefined}
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.5"
            />
          </g>
        );
      })}
    </svg>
  );
}

// As long as the group's own fold, but eased in and out as a thing with weight
// moves: the fold's easing covers most of its ground in the first frame, too
// fast to see the cover turn or the front fall.
const OPENING_MS = 180;
const OPENING_EASING = cubicBezier(0.4, 0, 0.2, 1);

/**
 * How open the icon is drawn while it moves toward `target`, or null at rest.
 * Turning back partway starts from wherever it had got to.
 */
function useOpening(target: 0 | 1): number | null {
  const [frame, setFrame] = useState<number | null>(null);
  const drawn = useRef<number>(target);
  // Before paint, so a click never shows a frame of the pose it is going to.
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
