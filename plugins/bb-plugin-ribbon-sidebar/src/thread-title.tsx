import { useLayoutEffect, useRef, useState } from "react";

export function ThreadTitle({ title }: { title: string }) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [overflowing, setOverflowing] = useState(false);

  useLayoutEffect(() => {
    const container = containerRef.current!;
    const text = textRef.current!;
    const measure = () => setOverflowing(container.scrollWidth > container.clientWidth);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    observer.observe(text);
    return () => observer.disconnect();
  }, [title]);

  return (
    <span
      ref={containerRef}
      className="pointer-events-none min-w-0 overflow-hidden whitespace-nowrap"
      style={{
        maskImage: overflowing
          ? "linear-gradient(to right, black calc(100% - 16px), transparent)"
          : undefined,
      }}
    >
      <span ref={textRef} className="inline-block">{title}</span>
    </span>
  );
}
