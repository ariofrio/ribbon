import { type CSSProperties, useLayoutEffect, useRef, useState } from "react";

// The pan starts at full speed and eases to a stop, and averages this speed.
// Each fade is a mask layer 16px wider than its box, slid 16px along to hide
// or show its gradient; the classes spell that out as -16px.
const FADE_PX = 16;
const PAN_PX_PER_SECOND = 30;
// The pan's starting speed, from its easing's initial slope of 0.49 / 0.44.
const FADE_SECONDS = FADE_PX / (PAN_PX_PER_SECOND * (0.49 / 0.44));
const PAN_DELAY_SECONDS = 0.3;

const fadeStyle = (gradient: string): CSSProperties => ({
  maskImage: gradient,
  maskSize: `calc(100% + ${FADE_PX}px) 100%`,
  maskRepeat: "no-repeat",
});

export function ThreadTitle({ title }: { title: string }) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [overflow, setOverflow] = useState(0);

  useLayoutEffect(() => {
    const container = containerRef.current!;
    const text = textRef.current!;
    // Fractional widths, so the pan stops exactly at the end. A translation
    // leaves them alone, where scrollWidth would shrink as the title pans.
    const measure = () =>
      setOverflow(Math.max(0, text.getBoundingClientRect().width - container.getBoundingClientRect().width));
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    observer.observe(text);
    return () => observer.disconnect();
  }, [title]);

  // The fades and their transitions stay attached even when the title fits, so
  // a title that overflows only once its row makes room for hover actions
  // still fades in as it pans instead of jumping to the panned state.
  const overflowing = overflow > 0;
  const fadePx = overflowing ? FADE_PX : 0;
  const panSeconds = overflow / PAN_PX_PER_SECOND;
  // The trailing fade slides out as the title reaches its end, so the last
  // character lands fully drawn against the edge.
  const trailingFadeSeconds = Math.min(FADE_SECONDS, panSeconds);
  return (
    <span
      ref={containerRef}
      className="pointer-events-none min-w-0 overflow-hidden whitespace-nowrap [mask-position:-16px_0] motion-safe:group-hover/thread-row:[mask-position:var(--ribbon-title-fade-end)_0] motion-safe:group-hover/thread-row:[transition:mask-position_var(--ribbon-title-trailing-fade)_linear_var(--ribbon-title-trailing-fade-delay)] motion-safe:group-has-[:focus-visible]/thread-row:[mask-position:var(--ribbon-title-fade-end)_0] motion-safe:group-has-[:focus-visible]/thread-row:[transition:mask-position_var(--ribbon-title-trailing-fade)_linear_var(--ribbon-title-trailing-fade-delay)]"
      style={{
        ...fadeStyle(`linear-gradient(to right, black calc(100% - ${fadePx}px), transparent)`),
        "--ribbon-title-pan": `${-overflow}px`,
        "--ribbon-title-pan-duration": `${panSeconds}s`,
        "--ribbon-title-fade-end": overflowing ? "0px" : `-${FADE_PX}px`,
        "--ribbon-title-leading-fade": `${FADE_SECONDS}s`,
        "--ribbon-title-trailing-fade": `${trailingFadeSeconds}s`,
        "--ribbon-title-trailing-fade-delay": `${PAN_DELAY_SECONDS + panSeconds - trailingFadeSeconds}s`,
      } as CSSProperties}
    >
      <span
        className="block [mask-position:-16px_0] motion-safe:group-hover/thread-row:[mask-position:var(--ribbon-title-fade-end)_0] motion-safe:group-hover/thread-row:[transition:mask-position_var(--ribbon-title-leading-fade)_linear_300ms] motion-safe:group-has-[:focus-visible]/thread-row:[mask-position:var(--ribbon-title-fade-end)_0] motion-safe:group-has-[:focus-visible]/thread-row:[transition:mask-position_var(--ribbon-title-leading-fade)_linear_300ms]"
        style={fadeStyle(`linear-gradient(to right, transparent, black ${fadePx}px)`)}
      >
        <span
          ref={textRef}
          className="inline-block motion-safe:group-hover/thread-row:[transform:translateX(var(--ribbon-title-pan))] motion-safe:group-hover/thread-row:[transition:transform_var(--ribbon-title-pan-duration)_cubic-bezier(0.44,0.49,0.71,0.95)_300ms] motion-safe:group-has-[:focus-visible]/thread-row:[transform:translateX(var(--ribbon-title-pan))] motion-safe:group-has-[:focus-visible]/thread-row:[transition:transform_var(--ribbon-title-pan-duration)_cubic-bezier(0.44,0.49,0.71,0.95)_300ms]"
        >
          {title}
        </span>
      </span>
    </span>
  );
}
