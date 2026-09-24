import { type CSSProperties, useLayoutEffect, useRef, useState } from "react";

// The mask classes below spell out this fade and speed as -16px and 16s/30.
const FADE_PX = 16;
const PAN_PX_PER_SECOND = 30;

export function ThreadTitle({ title }: { title: string }) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [overflow, setOverflow] = useState(0);

  useLayoutEffect(() => {
    const container = containerRef.current!;
    const text = textRef.current!;
    // offsetWidth ignores the pan's transform, which scrollWidth would not.
    const measure = () => setOverflow(Math.max(0, text.offsetWidth - container.clientWidth));
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    observer.observe(text);
    return () => observer.disconnect();
  }, [title]);

  const overflowing = overflow > 0;
  // Pan past the end by the fade's width so the last character clears it.
  const pan = overflow + FADE_PX;
  return (
    <span
      ref={containerRef}
      className={`pointer-events-none min-w-0 overflow-hidden whitespace-nowrap ${
        overflowing
          ? "[mask-position:0_0,-16px_0] motion-safe:group-hover/thread-row:[mask-position:0_0,0_0] motion-safe:group-hover/thread-row:[transition:mask-position_calc(16s/30)_linear_300ms] motion-safe:group-has-[:focus-visible]/thread-row:[mask-position:0_0,0_0] motion-safe:group-has-[:focus-visible]/thread-row:[transition:mask-position_calc(16s/30)_linear_300ms]"
          : ""
      }`}
      style={
        overflowing
          ? {
              // The leading fade slides in as the title starts to move.
              maskImage: `linear-gradient(to right, black calc(100% - ${FADE_PX}px), transparent), linear-gradient(to right, transparent, black ${FADE_PX}px)`,
              maskSize: `100% 100%, calc(100% + ${FADE_PX}px) 100%`,
              maskRepeat: "no-repeat",
              maskComposite: "intersect",
            }
          : undefined
      }
    >
      <span
        ref={textRef}
        className={`inline-block ${
          overflowing
            ? "motion-safe:group-hover/thread-row:[transform:translateX(var(--ribbon-title-pan))] motion-safe:group-hover/thread-row:[transition:transform_var(--ribbon-title-pan-duration)_linear_300ms] motion-safe:group-has-[:focus-visible]/thread-row:[transform:translateX(var(--ribbon-title-pan))] motion-safe:group-has-[:focus-visible]/thread-row:[transition:transform_var(--ribbon-title-pan-duration)_linear_300ms]"
            : ""
        }`}
        style={
          overflowing
            ? ({
                "--ribbon-title-pan": `${-pan}px`,
                "--ribbon-title-pan-duration": `${pan / PAN_PX_PER_SECOND}s`,
              } as CSSProperties)
            : undefined
        }
      >
        {title}
      </span>
    </span>
  );
}
