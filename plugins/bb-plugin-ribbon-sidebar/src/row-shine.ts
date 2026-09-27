import { type RefObject, useLayoutEffect, useRef } from "react";

/**
 * A shimmer across a working thread's row, like bb's `animate-shine` on a
 * single icon but continuous from the row's first glyph to its last.
 *
 * A mask cannot cover the row itself, since that would dim its background and
 * the buttons inside it. Each piece of content carries its own mask instead,
 * placed by its offset in the row so that one wave runs across all of them.
 * The row animates the wave's phase, and the pieces inherit it.
 *
 * Plain CSS rather than classes: `@property` and `@keyframes` must be global,
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
    "@property --ribbon-shine{syntax:'<number>';inherits:true;initial-value:0}",
    "@keyframes ribbon-shine{from{--ribbon-shine:0}to{--ribbon-shine:1}}",
    "@media (prefers-reduced-motion: no-preference){" +
      `[${SHINE_ROW_ATTRIBUTE}]{animation:ribbon-shine ${SHINE_SECONDS}s linear infinite;animation-delay:var(--ribbon-active-animation-delay)}` +
      `[${ACTIVE_ROW_ATTRIBUTE}] [class*="animate-spin"]{animation-delay:var(--ribbon-active-animation-delay)}` +
      `[${SHINE_ROW_ATTRIBUTE}] [${SHINE_ATTRIBUTE}]{` +
      // A mask makes each piece a stacking context, painted over the link
      // that covers the row; let clicks through to it as before.
      "pointer-events:none;" +
      "-webkit-mask-image:linear-gradient(90deg,rgb(0 0 0/.5),#000,rgb(0 0 0/.5));" +
      "mask-image:linear-gradient(90deg,rgb(0 0 0/.5),#000,rgb(0 0 0/.5));" +
      `-webkit-mask-size:${SHINE_WAVE} 100%;mask-size:${SHINE_WAVE} 100%;` +
      "-webkit-mask-repeat:repeat-x;mask-repeat:repeat-x;" +
      `--ribbon-shine-x:calc(var(--ribbon-shine) * ${SHINE_WAVE} - var(--ribbon-shine-offset, 0px));` +
      "-webkit-mask-position:var(--ribbon-shine-x) 0;mask-position:var(--ribbon-shine-x) 0}" +
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

  // Measured only when layout is already done, by a ResizeObserver, and all
  // at once: reading positions between style writes would force a layout for
  // every piece of every row each time the sidebar renders.
  const observer = useRef<ResizeObserver | null>(null);
  useLayoutEffect(() => {
    const element = row.current;
    if (!active || !element || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const pieces = Array.from(
        element.querySelectorAll<HTMLElement>(`[${SHINE_ATTRIBUTE}]`),
      );
      const bounds = element.getBoundingClientRect();
      const offsets = pieces.map(
        (piece) => piece.getBoundingClientRect().left - bounds.left,
      );
      if (bounds.width > 0) {
        element.style.setProperty("--ribbon-shine-width", `${bounds.width * 2}px`);
      }
      pieces.forEach((piece, index) =>
        piece.style.setProperty("--ribbon-shine-offset", `${offsets[index]}px`),
      );
    };
    const resizes = new ResizeObserver(measure);
    resizes.observe(element);
    observer.current = resizes;
    return () => {
      resizes.disconnect();
      observer.current = null;
    };
  }, [active, row]);

  // A piece that appears later, such as a new indicator, is measured when the
  // observer first sees it; one it already sees is left alone.
  useLayoutEffect(() => {
    const element = row.current;
    const resizes = observer.current;
    if (!element || !resizes) return;
    for (const piece of Array.from(element.querySelectorAll(`[${SHINE_ATTRIBUTE}]`))) {
      resizes.observe(piece);
    }
  });
}
