import { useLayoutEffect, useState, type RefObject } from "react";

export function useRowActionCapacity(
  rowRef: RefObject<HTMLDivElement | null>,
  { count, enabled, hasChildren, hasPrompts, hasPullRequest, isCompact, isEditing, providerId }: {
    count: number;
    enabled: boolean;
    hasChildren: boolean;
    hasPrompts: boolean;
    hasPullRequest: boolean;
    isCompact: boolean;
    isEditing: boolean;
    providerId?: string;
  },
) {
  const [capacity, setCapacity] = useState(count);
  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row || !enabled || isCompact || isEditing) {
      setCapacity(count);
      return;
    }
    const content = row.querySelector<HTMLElement>("[data-ribbon-row-content]");
    const title = row.querySelector<HTMLElement>(".bb-thread-title");
    const pr = hasPullRequest ? row.querySelector<HTMLElement>("[data-ribbon-pull-request]") : null;
    if (!content || !title) return;
    const measure = () => {
      if (content.clientWidth === 0 || window.matchMedia?.("(pointer: coarse)").matches) {
        setCapacity(count);
        return;
      }
      const style = getComputedStyle(content);
      const leading = title.getBoundingClientRect().left - content.getBoundingClientRect().left;
      const prWidth = pr ? pr.getBoundingClientRect().width + parseFloat(getComputedStyle(pr).marginLeft) : 0;
      // Keep the native 28px pointer target for the child toggle and a saved
      // prompt. Each quick action occupies 28px with a 2px gap between them.
      const available = content.clientWidth - parseFloat(style.paddingRight) - leading
        - (hasChildren ? 28 : 0) - (hasPrompts ? 28 + 8 : 0) - prWidth;
      setCapacity(Math.max(0, Math.min(count, Math.floor((available + 2) / 30))));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    if (pr) observer.observe(pr);
    return () => observer.disconnect();
  }, [rowRef, count, enabled, hasChildren, hasPrompts, hasPullRequest, isCompact, isEditing, providerId]);
  return enabled && !isCompact ? Math.min(count, capacity) : count;
}
