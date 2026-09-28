import {
  type ReactNode,
  type RefObject,
  useLayoutEffect,
} from "react";

/**
 * A shimmer across a working thread's row, like bb's `animate-shine` on a
 * single icon but continuous from the row's first glyph to its last.
 *
 * A mask cannot cover the row itself, since that would dim its background and
 * the buttons inside it. Each piece of content carries its own mask instead,
 * placed by its offset in the row so that one wave runs across all of them.
 *
 * The wave moves without the main thread. Animating a mask's position, or
 * anything it reads, restyles and repaints every piece on every frame, and
 * with a few threads working that alone keeps the page too busy to answer
 * input. Each piece instead holds a window one wave wider than itself that
 * carries a still mask and slides by one wave per second, and the content
 * inside slides back just as far, so only the mask appears to move. Both
 * slides are translations, which the compositor runs by itself.
 *
 * Plain CSS rather than classes: `@keyframes` must be global, outside the
 * scope root bb compiles a plugin's own stylesheet into.
 */
export const SHINE_ROW_ATTRIBUTE = "data-ribbon-shine-row";
export const ACTIVE_ROW_ATTRIBUTE = "data-ribbon-active-row";

/** Marks a piece of a row's content that shimmers with it. */
export const SHINE_ATTRIBUTE = "data-ribbon-shine";
const SHINE_WINDOW_ATTRIBUTE = "data-ribbon-shine-window";
const SHINE_CONTENT_ATTRIBUTE = "data-ribbon-shine-content";

// bb's shine: opacity runs from half to full and back across two element
// widths, and the wave travels that far each second.
const SHINE_SECONDS = 1;
const SHINE_WAVE = "var(--ribbon-shine-width, 120px)";

export function activeAnimationDelay(now: number): string {
  return `${-(now % (SHINE_SECONDS * 1000))}ms`;
}

export function shineStyles(): string {
  const slide = `${SHINE_SECONDS}s linear infinite;animation-delay:var(--ribbon-active-animation-delay)`;
  return [
    `@keyframes ribbon-shine-window{from{translate:0}to{translate:${SHINE_WAVE} 0}}`,
    `@keyframes ribbon-shine-content{from{translate:0}to{translate:calc(-1 * ${SHINE_WAVE}) 0}}`,
    "@media (prefers-reduced-motion: no-preference){" +
      `[${ACTIVE_ROW_ATTRIBUTE}] [class*="animate-spin"]{animation-delay:var(--ribbon-active-animation-delay)}` +
      // The window reaches a wave past the piece as it slides; keep that out
      // of view and out of the sidebar's scroll width.
      `[${SHINE_ROW_ATTRIBUTE}] [${SHINE_ATTRIBUTE}]{overflow:clip;` +
      // A mask makes each window a stacking context, painted over the link
      // that covers the row; let clicks through to it as before.
      "pointer-events:none}" +
      `[${SHINE_ROW_ATTRIBUTE}] [${SHINE_WINDOW_ATTRIBUTE}]{` +
      `margin-left:calc(-1 * ${SHINE_WAVE});padding-left:${SHINE_WAVE};` +
      "-webkit-mask-image:linear-gradient(90deg,rgb(0 0 0/.5),#000,rgb(0 0 0/.5));" +
      "mask-image:linear-gradient(90deg,rgb(0 0 0/.5),#000,rgb(0 0 0/.5));" +
      `-webkit-mask-size:${SHINE_WAVE} 100%;mask-size:${SHINE_WAVE} 100%;` +
      "-webkit-mask-repeat:repeat-x;mask-repeat:repeat-x;" +
      "-webkit-mask-position:calc(-1 * var(--ribbon-shine-offset, 0px)) 0;" +
      "mask-position:calc(-1 * var(--ribbon-shine-offset, 0px)) 0;" +
      `animation:ribbon-shine-window ${slide}}` +
      `[${SHINE_ROW_ATTRIBUTE}] [${SHINE_CONTENT_ATTRIBUTE}]{animation:ribbon-shine-content ${slide}}` +
      "}",
  ].join("\n");
}

/**
 * Wraps a shining piece's content in the window that carries its mask. The
 * window fills the piece, and the content takes the layout the piece would
 * have given it, so a row lays out the same whether or not it shimmers.
 */
export function ShineContent({
  className = "",
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className="flex min-w-0 flex-1"
      {...{ [SHINE_WINDOW_ATTRIBUTE]: "" }}
    >
      <span
        className={`min-w-0 flex-1 ${className}`}
        {...{ [SHINE_CONTENT_ATTRIBUTE]: "" }}
      >
        {children}
      </span>
    </span>
  );
}

/** Puts the stylesheet in the document, and takes it back out. */
export function publishShineStyles(target: Document = document): () => void {
  const style = target.createElement("style");
  style.dataset.ribbonSidebarShine = "";
  style.textContent = shineStyles();
  target.head.append(style);
  return () => style.remove();
}

/**
 * Keeps each shining piece's offset in its row where its mask can read it.
 * Only rows that shimmer are measured.
 */
export function useRowShine(
  row: RefObject<HTMLElement | null>,
  active: boolean,
  working: boolean,
): void {
  useLayoutEffect(() => {
    if (!working || !row.current) return;
    row.current.style.setProperty(
      "--ribbon-active-animation-delay",
      activeAnimationDelay(performance.now()),
    );
  }, [row, working]);

  // Observer reports provide geometry after layout; resize notifications
  // refresh those reports without interleaving reads and style writes.
  useLayoutEffect(() => {
    const element = row.current;
    if (!active || !element) return;
    const pieces = () => Array.from(element.querySelectorAll<HTMLElement>(`[${SHINE_ATTRIBUTE}]`));
    const measure = () => {
      const bounds = element.getBoundingClientRect();
      if (bounds.width > 0) {
        element.style.setProperty("--ribbon-shine-width", `${bounds.width * 2}px`);
      }
      for (const piece of pieces()) {
        piece.style.setProperty(
          "--ribbon-shine-offset",
          `${piece.getBoundingClientRect().left - bounds.left}px`,
        );
      }
    };
    if (typeof IntersectionObserver === "undefined" || typeof ResizeObserver === "undefined") {
      measure();
      return;
    }
    const measuredPieces = pieces();
    const bounds = new Map<Element, DOMRectReadOnly>();
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) bounds.set(entry.target, entry.boundingClientRect);
      const rowBounds = bounds.get(element);
      if (!rowBounds || rowBounds.width <= 0) return;
      element.style.setProperty("--ribbon-shine-width", `${rowBounds.width * 2}px`);
      for (const piece of measuredPieces) {
        const pieceBounds = bounds.get(piece);
        if (pieceBounds)
          piece.style.setProperty(
            "--ribbon-shine-offset",
            `${pieceBounds.left - rowBounds.left}px`,
          );
      }
    });
    const observed = [element, ...measuredPieces];
    for (const target of observed) observer.observe(target);
    const resizeObserver = new ResizeObserver(() => {
      for (const target of observed) {
        observer.unobserve(target);
        observer.observe(target);
      }
    });
    for (const target of observed) resizeObserver.observe(target);
    return () => {
      observer.disconnect();
      resizeObserver.disconnect();
    };
  });
}
