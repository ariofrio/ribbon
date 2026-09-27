import {
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

type Phase = "open" | "opening" | "closing" | "closed";

/**
 * A group's rows, folding open and shut the way bb's own panels do: a grid
 * whose one row eases between its content's height and none.
 *
 * The rows stay mounted, inert, until the fold finishes, then leave; without
 * a transition to wait for, as under reduced motion, they leave at once. What
 * a folded group shows instead appears only once the rows are gone, so the
 * open thread is never drawn twice. The rows are clipped only while folding,
 * so an open group's focus rings reach past its edges as before.
 */
export function GroupBody({
  open,
  children,
  folded,
}: {
  open: boolean;
  children: ReactNode;
  folded?: ReactNode;
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

  // Opening starts folded, so the grid has somewhere to ease out from.
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
    if (phase !== "closing" && !(phase === "opening" && expanding)) return;
    if (!body.current) return;
    const seconds = parseFloat(getComputedStyle(body.current).transitionDuration);
    if (!(seconds > 0)) setPhase(phase === "closing" ? "closed" : "open");
  }, [phase, expanding]);

  if (phase === "closed") return <>{folded}</>;
  const unfolded = phase === "open" || (phase === "opening" && expanding);
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
