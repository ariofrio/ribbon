import { type RefObject, useLayoutEffect } from "react";

/**
 * A shimmer across a working thread's row, like bb's `animate-shine` on a
 * single icon but continuous from the row's first glyph to its last.
 *
 * A mask cannot cover the row itself, since that would dim its background and
 * the buttons inside it. Each piece of content carries its own mask instead,
 * placed by its offset in the row so that one wave runs across all of them.
 * The pieces animate their mask positions with the row's shared phase.
 *
 * Plain CSS rather than classes: `@keyframes` must be global,
 * outside the scope root bb compiles a plugin's own stylesheet into.
 */
export const SHINE_ROW_ATTRIBUTE = "data-ribbon-shine-row";
export const ACTIVE_ROW_ATTRIBUTE = "data-ribbon-active-row";

/** Marks a piece of a row's content that shimmers with it. */
export const SHINE_ATTRIBUTE = "data-ribbon-shine";

// bb's shine: opacity runs from half to full and back across two element
// widths, and the wave travels that far each second.
const SHINE_SECONDS = 1;
const SHINE_WAVE = "var(--ribbon-shine-width, 120px)";

export function activeAnimationDelay(now: number): string {
  return `${-(now % (SHINE_SECONDS * 1000))}ms`;
}

export function shineStyles(): string {
  return [
    "@keyframes ribbon-shine{" +
      "from{-webkit-mask-position:calc(0px - var(--ribbon-shine-offset, 0px)) 0;mask-position:calc(0px - var(--ribbon-shine-offset, 0px)) 0}" +
      `to{-webkit-mask-position:calc(${SHINE_WAVE} - var(--ribbon-shine-offset, 0px)) 0;mask-position:calc(${SHINE_WAVE} - var(--ribbon-shine-offset, 0px)) 0}}`,
    "@media (prefers-reduced-motion: no-preference){" +
      `[${ACTIVE_ROW_ATTRIBUTE}] [class*="animate-spin"]{animation-delay:var(--ribbon-active-animation-delay)}` +
      `[${SHINE_ROW_ATTRIBUTE}] [${SHINE_ATTRIBUTE}]{` +
      `animation:ribbon-shine ${SHINE_SECONDS}s linear infinite;animation-delay:var(--ribbon-active-animation-delay);` +
      // A mask makes each piece a stacking context, painted over the link
      // that covers the row; let clicks through to it as before.
      "pointer-events:none;" +
      "-webkit-mask-image:linear-gradient(90deg,rgb(0 0 0/.5),#000,rgb(0 0 0/.5));" +
      "mask-image:linear-gradient(90deg,rgb(0 0 0/.5),#000,rgb(0 0 0/.5));" +
      `-webkit-mask-size:${SHINE_WAVE} 100%;mask-size:${SHINE_WAVE} 100%;` +
      "-webkit-mask-repeat:repeat-x;mask-repeat:repeat-x}" +
      "}",
  ].join("\n");
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
