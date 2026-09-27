import {
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

type Phase = "open" | "opening" | "closing" | "closed";

// bb's own panel timing.
const FOLD_MS = 180;
const FOLD_EASING = "cubic-bezier(0.16, 1, 0.3, 1)";

/**
 * A group's rows, folding open and shut the way bb's own panels do.
 *
 * Usually the whole body is a grid whose one row eases between its content's
 * height and none. When the group holds the open thread, the thread's row
 * stays in view instead: every other row folds away around it, so it ends up
 * right where the folded group previews it, and unfolding grows the others
 * back around it.
 *
 * The rows stay mounted, inert, until the fold finishes, then leave; without
 * motion, as under reduced motion, they leave at once. What a folded group
 * shows instead appears only once the rows are gone, so the open thread is
 * never drawn twice. The rows are clipped only while folding, so an open
 * group's focus rings reach past its edges as before.
 */
export function GroupBody({
  open,
  children,
  folded,
  keepThreadId,
}: {
  open: boolean;
  children: ReactNode;
  folded?: ReactNode;
  /** The row that stays in view while the group folds, if it is here. */
  keepThreadId?: string | null;
}) {
  const body = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>(open ? "open" : "closed");

  // Before paint, so a click never shows a frame of the other state.
  useLayoutEffect(() => {
    setPhase((current) =>
      open
        ? current === "open"
          ? current
          : "opening"
        : current === "closed"
          ? current
          : "closing",
    );
  }, [open]);

  // Around a kept row, the other rows fold one by one; the body stays open.
  const keeping = Boolean(keepThreadId) && motionAllowed();
  useLayoutEffect(() => {
    if (!keeping || (phase !== "opening" && phase !== "closing")) return;
    const element = body.current;
    const kept = keptRow(element, keepThreadId);
    if (!element || !kept) {
      setPhase(phase === "closing" ? "closed" : "open");
      return;
    }
    const closing = phase === "closing";
    // Read every size first, then start animating, so one layout serves all.
    const pieces = foldingPieces(element, kept);
    const shown = pieces.map((piece) => {
      const style = getComputedStyle(piece);
      return {
        height: `${piece.getBoundingClientRect().height}px`,
        marginTop: style.marginTop,
        marginBottom: style.marginBottom,
        opacity: 1,
      };
    });
    // The kept row, and each list around it, closes up its own margins, so
    // the body ends exactly as tall as the folded group's preview.
    const flush = [kept, ...keptAncestors(element, kept)];
    const margins = flush.map((node) => {
      const style = getComputedStyle(node);
      return { marginTop: style.marginTop, marginBottom: style.marginBottom };
    });
    const hidden = { height: "0px", marginTop: "0px", marginBottom: "0px", opacity: 0 };
    const animations = pieces.map((piece, index) => {
      piece.style.overflow = "hidden";
      return piece.animate(
        closing ? [shown[index]!, hidden] : [hidden, shown[index]!],
        { duration: FOLD_MS, easing: FOLD_EASING, fill: closing ? "forwards" : "none" },
      );
    });
    const none = { marginTop: "0px", marginBottom: "0px" };
    flush.forEach((node, index) => {
      animations.push(
        node.animate(closing ? [margins[index]!, none] : [none, margins[index]!], {
          duration: FOLD_MS,
          easing: FOLD_EASING,
          fill: closing ? "forwards" : "none",
        }),
      );
    });
    let cancelled = false;
    void Promise.all(animations.map(({ finished }) => finished)).then(
      () => {
        if (cancelled) return;
        setPhase(closing ? "closed" : "open");
      },
      () => {},
    );
    return () => {
      cancelled = true;
      for (const animation of animations) animation.cancel();
      for (const piece of pieces) piece.style.overflow = "";
    };
  }, [phase, keeping, keepThreadId]);

  // Otherwise opening starts folded, so the grid has somewhere to ease from.
  const [expanding, setExpanding] = useState(false);
  useEffect(() => {
    if (phase !== "opening") return;
    const frame = requestAnimationFrame(() => setExpanding(true));
    return () => {
      cancelAnimationFrame(frame);
      setExpanding(false);
    };
  }, [phase]);

  // Without a transition, nothing will end; settle straight away.
  useEffect(() => {
    if (keeping) return;
    if (phase !== "closing" && !(phase === "opening" && expanding)) return;
    if (!body.current) return;
    const seconds = parseFloat(getComputedStyle(body.current).transitionDuration);
    if (!(seconds > 0)) setPhase(phase === "closing" ? "closed" : "open");
  }, [phase, expanding, keeping]);

  if (phase === "closed") return <>{folded}</>;
  const unfolded =
    keeping || phase === "open" || (phase === "opening" && expanding);
  return (
    <div
      ref={body}
      className={`grid transition-[grid-template-rows,opacity] duration-[180ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none ${
        unfolded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
      }`}
      data-ribbon-group-body=""
      inert={!open}
      onTransitionEnd={(event) => {
        if (
          keeping ||
          event.target !== event.currentTarget ||
          event.propertyName !== "grid-template-rows"
        ) {
          return;
        }
        setPhase((current) =>
          current === "closing"
            ? "closed"
            : current === "opening"
              ? "open"
              : current,
        );
      }}
    >
      <div className={`min-h-0 ${phase === "open" ? "" : "overflow-hidden"}`}>
        {children}
      </div>
    </div>
  );
}

function keptRow(
  body: HTMLElement | null,
  threadId: string | null | undefined,
): HTMLElement | null {
  if (!body || !threadId) return null;
  return body.querySelector<HTMLElement>(
    `li[data-thread-id="${CSS.escape(threadId)}"]`,
  );
}

/**
 * Every list, row, and control between rows that does not hold the one kept
 * in view: whole lists fold too, taking their margins with them.
 */
function foldingPieces(body: HTMLElement, kept: HTMLElement): HTMLElement[] {
  return Array.from(
    body.querySelectorAll<HTMLElement>("ul, li, [data-ribbon-fold-piece]"),
  ).filter((piece) => piece !== kept && !piece.contains(kept) && !kept.contains(piece));
}

/** The lists and wrappers between the kept row and the body. */
function keptAncestors(body: HTMLElement, kept: HTMLElement): HTMLElement[] {
  const ancestors: HTMLElement[] = [];
  for (let node = kept.parentElement; node && node !== body; node = node.parentElement) {
    ancestors.push(node);
  }
  return ancestors;
}

function motionAllowed(): boolean {
  return (
    typeof Element !== "undefined" &&
    typeof Element.prototype.animate === "function" &&
    !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}
