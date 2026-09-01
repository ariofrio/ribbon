import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";
import { Button } from "./vendor/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./vendor/components/ui/tooltip";

export interface SidebarPage {
  id: string | null;
  label: string;
  icon: ReactNode;
}

interface SidebarPageSwitcherProps {
  activePageId: string | null;
  onPageChange(pageId: string | null): void;
  pages: readonly SidebarPage[];
  renderPage(page: SidebarPage): ReactNode;
}

const SCROLL_END_FALLBACK_MS = 120;
const WHEEL_GESTURE_IDLE_MS = 160;
const RUBBER_BAND_FACTOR = 0.55;
const RUBBER_BAND_LIMIT = 0.32;

function samePage(left: string | null, right: string | null) {
  return left === right;
}

function prefersReducedMotion() {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function rubberBandDistance(distance: number, dimension: number) {
  if (dimension <= 0 || distance === 0) return 0;
  const magnitude = Math.abs(distance);
  const resisted =
    (magnitude * dimension * RUBBER_BAND_FACTOR) /
    (dimension + RUBBER_BAND_FACTOR * magnitude);
  return (
    Math.sign(distance) * Math.min(resisted, dimension * RUBBER_BAND_LIMIT)
  );
}

export function SidebarPageSwitcher({
  activePageId,
  onPageChange,
  pages,
  renderPage,
}: SidebarPageSwitcherProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const scrollEndFallback = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wheelGestureEnd = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wheelGestureOrigin = useRef<number | null>(null);
  const edgePull = useRef(0);
  const [paging, setPaging] = useState(false);
  const [pagingTargetIndex, setPagingTargetIndex] = useState<number | null>(
    null,
  );

  const activeIndex = Math.max(
    0,
    pages.findIndex(({ id }) => samePage(id, activePageId)),
  );

  const releaseEdgePull = useCallback(() => {
    const viewport = viewportRef.current;
    edgePull.current = 0;
    if (!viewport) return;
    viewport.style.transition = prefersReducedMotion()
      ? "none"
      : "transform 320ms cubic-bezier(0.22, 1, 0.36, 1)";
    viewport.style.transform = "translate3d(0px, 0, 0)";
  }, []);

  const settleOnNearestPage = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport || pages.length === 0) return;
    const width = viewport.clientWidth || viewport.getBoundingClientRect().width;
    if (width === 0) return;
    const rawTargetIndex = Math.round(viewport.scrollLeft / width);
    const gestureOrigin = wheelGestureOrigin.current;
    const minimumTarget =
      gestureOrigin === null ? 0 : Math.max(0, gestureOrigin - 1);
    const maximumTarget =
      gestureOrigin === null
        ? pages.length - 1
        : Math.min(pages.length - 1, gestureOrigin + 1);
    const targetIndex = Math.max(
      minimumTarget,
      Math.min(maximumTarget, rawTargetIndex),
    );
    if (targetIndex !== activeIndex) {
      onPageChange(pages[targetIndex]!.id);
    } else {
      setPaging(false);
      setPagingTargetIndex(null);
    }
  }, [activeIndex, onPageChange, pages]);

  const scrollToPage = useCallback((index: number) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const left = index * viewport.clientWidth;
    if (typeof viewport.scrollTo === "function") {
      viewport.scrollTo({
        behavior: prefersReducedMotion() ? "auto" : "smooth",
        left,
      });
    } else {
      viewport.scrollLeft = left;
    }
  }, []);

  const handleWheel = useCallback(
    (event: WheelEvent) => {
      if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
      if (wheelGestureOrigin.current === null) {
        wheelGestureOrigin.current = activeIndex;
      }
      if (wheelGestureEnd.current !== null) {
        clearTimeout(wheelGestureEnd.current);
      }
      wheelGestureEnd.current = setTimeout(() => {
        const pulledPastEdge = edgePull.current !== 0;
        wheelGestureOrigin.current = null;
        wheelGestureEnd.current = null;
        releaseEdgePull();
        if (pulledPastEdge) {
          setPaging(false);
          setPagingTargetIndex(null);
        }
      }, WHEEL_GESTURE_IDLE_MS);
      const viewport = viewportRef.current;
      if (!viewport) return;
      const maximumScroll = Math.max(
        0,
        viewport.scrollWidth - viewport.clientWidth,
      );
      const pullingPastStart = event.deltaX < 0 && viewport.scrollLeft <= 0.5;
      const pullingPastEnd =
        event.deltaX > 0 && viewport.scrollLeft >= maximumScroll - 0.5;
      if (pullingPastStart || pullingPastEnd) {
        event.preventDefault();
        edgePull.current -= event.deltaX;
        const distance = rubberBandDistance(
          edgePull.current,
          viewport.clientWidth,
        );
        viewport.style.transition = "none";
        viewport.style.transform = `translate3d(${distance}px, 0, 0)`;
      } else if (edgePull.current !== 0) {
        releaseEdgePull();
      }
      if (!paging || pagingTargetIndex !== null) {
        flushSync(() => {
          setPaging(true);
          setPagingTargetIndex(null);
        });
      }
    },
    [activeIndex, paging, pagingTargetIndex, releaseEdgePull],
  );

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const target = activeIndex * viewport.clientWidth;
    if (Math.abs(viewport.scrollLeft - target) > 1) {
      viewport.scrollLeft = target;
    }
  }, [activeIndex, pages.length]);

  useEffect(() => {
    setPaging(false);
    setPagingTargetIndex(null);
  }, [activePageId]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.addEventListener("wheel", handleWheel, {
      capture: true,
      passive: false,
    });
    return () => {
      viewport.removeEventListener("wheel", handleWheel, { capture: true });
    };
  }, [handleWheel]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.addEventListener("scrollend", settleOnNearestPage);
    return () => {
      viewport.removeEventListener("scrollend", settleOnNearestPage);
      if (scrollEndFallback.current !== null) {
        clearTimeout(scrollEndFallback.current);
      }
      if (wheelGestureEnd.current !== null) {
        clearTimeout(wheelGestureEnd.current);
      }
    };
  }, [settleOnNearestPage]);

  return (
    <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
      <div
        className="relative flex min-w-0 flex-1 overflow-x-auto overscroll-x-contain [&::-webkit-scrollbar]:hidden"
        data-testid="sidebar-page-viewport"
        onScroll={() => {
          const viewport = viewportRef.current;
          const gestureOrigin = wheelGestureOrigin.current;
          if (viewport && gestureOrigin !== null) {
            const width =
              viewport.clientWidth || viewport.getBoundingClientRect().width;
            const minimum = Math.max(0, gestureOrigin - 1) * width;
            const maximum =
              Math.min(pages.length - 1, gestureOrigin + 1) * width;
            viewport.scrollLeft = Math.max(
              minimum,
              Math.min(maximum, viewport.scrollLeft),
            );
          }
          if (viewport && "onscrollend" in viewport) return;
          if (scrollEndFallback.current !== null) {
            clearTimeout(scrollEndFallback.current);
          }
          scrollEndFallback.current = setTimeout(
            settleOnNearestPage,
            SCROLL_END_FALLBACK_MS,
          );
        }}
        ref={viewportRef}
        style={{
          scrollBehavior: prefersReducedMotion() ? "auto" : "smooth",
          scrollSnapType: "x mandatory",
          scrollbarWidth: "none",
        }}
      >
        {pages.map((page, index) => {
          const active = samePage(page.id, activePageId);
          const renderContent =
            active ||
            (paging &&
              (Math.abs(index - activeIndex) <= 1 ||
                index === pagingTargetIndex));
          return (
            <section
              aria-hidden={!active}
              className="w-full min-w-full max-w-full basis-full shrink-0 overflow-x-clip bg-sidebar"
              data-sidebar-page-id={page.id ?? "all"}
              inert={!active}
              key={page.id ?? "all"}
              style={{ scrollSnapAlign: "start", scrollSnapStop: "always" }}
            >
              {renderContent ? renderPage(page) : null}
            </section>
          );
        })}
      </div>

      <TooltipProvider delayDuration={350}>
        <nav
          aria-label="Sidebar pages"
          className="sticky bottom-0 z-[70] flex min-h-11 max-w-full items-center overflow-x-auto border-t border-sidebar-border/60 bg-sidebar/95 px-2 py-1.5 shadow-[0_-8px_20px_-16px_rgb(0_0_0/0.45)] backdrop-blur"
        >
          <div className="mx-auto flex w-max items-center gap-1">
            {pages.map((page) => {
              const active = samePage(page.id, activePageId);
              return (
                <Tooltip key={page.id ?? "all"}>
                  <TooltipTrigger asChild>
                    <Button
                      aria-current={active ? "page" : undefined}
                      aria-label={`Show ${page.label} page`}
                      aria-pressed={active}
                      className="size-8 shrink-0 rounded-xl p-0 text-sidebar-foreground/65 aria-pressed:bg-state-active aria-pressed:text-sidebar-foreground"
                      onClick={() => {
                        const targetIndex = pages.indexOf(page);
                        if (targetIndex !== activeIndex) {
                          wheelGestureOrigin.current = null;
                          if (wheelGestureEnd.current !== null) {
                            clearTimeout(wheelGestureEnd.current);
                            wheelGestureEnd.current = null;
                          }
                          releaseEdgePull();
                          flushSync(() => {
                            setPaging(true);
                            setPagingTargetIndex(targetIndex);
                          });
                          scrollToPage(targetIndex);
                        }
                      }}
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      {page.icon}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">{page.label}</TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </nav>
      </TooltipProvider>
    </div>
  );
}
