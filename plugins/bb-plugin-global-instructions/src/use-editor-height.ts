import { useLayoutEffect, useRef } from "react";

export function useEditorHeight() {
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const ancestors: HTMLElement[] = [];
    let viewport: HTMLElement | undefined;
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      ancestors.push(parent);
      if (/auto|scroll/.test(getComputedStyle(parent).overflowY)) {
        viewport = parent;
        break;
      }
    }
    const measure = () => {
      const visible = window.visualViewport;
      const bottom = Math.min(window.innerHeight, visible ? visible.offsetTop + visible.height : window.innerHeight,
        viewport?.getBoundingClientRect().bottom ?? window.innerHeight);
      const height = Math.max(256, Math.floor(bottom - element.getBoundingClientRect().top - 16));
      const value = `${height}px`;
      if (element.style.getPropertyValue("--global-instructions-height") !== value) {
        element.style.setProperty("--global-instructions-height", value);
      }
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(measure);
    ancestors.forEach((ancestor) => observer?.observe(ancestor));
    window.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("resize", measure);
    };
  }, []);
  return ref;
}
