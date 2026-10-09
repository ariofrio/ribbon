import {
  type ReactNode,
  type RefObject,
  useLayoutEffect,
  useRef,
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

export function shineStyles(): string {
  const slide = `${SHINE_SECONDS}s linear infinite`;
  return [
    `@keyframes ribbon-shine-window{from{translate:0}to{translate:${SHINE_WAVE} 0}}`,
    `@keyframes ribbon-shine-content{from{translate:0}to{translate:calc(-1 * ${SHINE_WAVE}) 0}}`,
    "@media (prefers-reduced-motion: no-preference){" +
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

function synchronizeRowAnimations(element: HTMLElement): void {
  for (const animation of element.getAnimations?.({ subtree: true }) ?? []) {
    if (
      animation instanceof CSSAnimation &&
      ["spin", "ribbon-shine-window", "ribbon-shine-content"].includes(animation.animationName) &&
      animation.playState !== "paused" &&
      animation.startTime !== 0
    ) {
      animation.startTime = 0;
    }
  }
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
  // CSS animations start when styles resolve, which can be later than this
  // render. A delay sampled here therefore cannot align different rows. Give
  // their compositor animations the document timeline's common origin instead.
  useLayoutEffect(() => {
    if (working && row.current) synchronizeRowAnimations(row.current);
  });
  useLayoutEffect(() => {
    const element = row.current;
    if (!working || !element) return;
    // Also catches content added by a child and animations restarted when
    // reduced motion is turned off, without ticking on the main thread.
    const synchronize = () => synchronizeRowAnimations(element);
    element.addEventListener("animationstart", synchronize);
    return () => element.removeEventListener("animationstart", synchronize);
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
