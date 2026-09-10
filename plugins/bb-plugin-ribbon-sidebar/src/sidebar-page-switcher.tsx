import WheelGestures from "wheel-gestures";
import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
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

function samePage(left: string | null, right: string | null) {
  return left === right;
}

function prefersReducedMotion() {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function closestPageIndex(viewport: HTMLDivElement, pageCount: number) {
  if (viewport.clientWidth === 0) return 0;
  return Math.max(
    0,
    Math.min(
      pageCount - 1,
      Math.round(viewport.scrollLeft / viewport.clientWidth),
    ),
  );
}

function resistedEdgeOffset(distance: number) {
  const limit = 44;
  return (
    Math.sign(distance) *
    limit *
    (1 - Math.exp(-Math.abs(distance) / limit))
  );
}

export function SidebarPageSwitcher({
  activePageId,
  onPageChange,
  pages,
  renderPage,
}: SidebarPageSwitcherProps) {
  const activeIndex = Math.max(
    0,
    pages.findIndex(({ id }) => samePage(id, activePageId)),
  );
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const pagingRef = useRef(false);
  const wheelGestureActiveRef = useRef(false);
  const edgeWheelDistanceRef = useRef(0);
  const edgeBoundaryLeftRef = useRef(0);
  const edgeFrameRef = useRef<number | null>(null);
  const gestureStartIndexRef = useRef(activeIndex);
  const pagingTargetIndexRef = useRef<number | null>(null);
  const [paging, setPaging] = useState(false);
  const [pagingTargetIndex, setPagingTargetIndex] = useState<number | null>(
    null,
  );

  const beginPaging = useCallback(
    (targetIndex: number | null) => {
      if (!pagingRef.current) gestureStartIndexRef.current = activeIndex;
      pagingRef.current = true;
      pagingTargetIndexRef.current = targetIndex;
      setPaging(true);
      setPagingTargetIndex(targetIndex);
    },
    [activeIndex],
  );

  const finishPaging = useCallback(() => {
    pagingRef.current = false;
    pagingTargetIndexRef.current = null;
    setPaging(false);
    setPagingTargetIndex(null);
  }, []);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const clampToAdjacentPage = () => {
      if (edgeWheelDistanceRef.current !== 0) {
        const container = containerRef.current;
        if (container) {
          const scrollCompensation =
            viewport.scrollLeft - edgeBoundaryLeftRef.current;
          const edgeOffset = resistedEdgeOffset(
            -edgeWheelDistanceRef.current,
          );
          container.style.transform = `translate3d(${scrollCompensation + edgeOffset}px, 0px, 0px)`;
        }
        return;
      }
      if (!pagingRef.current || pagingTargetIndexRef.current !== null) return;
      const width = viewport.clientWidth;
      if (width === 0) return;
      const minimumLeft =
        Math.max(0, gestureStartIndexRef.current - 1) * width;
      const maximumLeft =
        Math.min(pages.length - 1, gestureStartIndexRef.current + 1) * width;
      const clampedLeft = Math.max(
        minimumLeft,
        Math.min(maximumLeft, viewport.scrollLeft),
      );
      if (viewport.scrollLeft !== clampedLeft) viewport.scrollLeft = clampedLeft;
    };

    const handleWheel = (event: WheelEvent) => {
      if (
        pages.length <= 1 ||
        Math.abs(event.deltaX) <= Math.abs(event.deltaY)
      ) {
        return;
      }
      const atFirstEdge = activeIndex === 0 && event.deltaX < 0;
      const atLastEdge =
        activeIndex === pages.length - 1 && event.deltaX > 0;
      const atOuterEdge = atFirstEdge || atLastEdge;
      const container = containerRef.current;

      if (atOuterEdge) {
        event.preventDefault();
        edgeBoundaryLeftRef.current = activeIndex * viewport.clientWidth;
        edgeWheelDistanceRef.current += event.deltaX;
        if (container) {
          container
            .getAnimations?.()
            .forEach((animation) => animation.cancel());
          container.style.willChange = "transform";
          if (edgeFrameRef.current === null) {
            edgeFrameRef.current = requestAnimationFrame(() => {
              edgeFrameRef.current = null;
              const scrollCompensation =
                viewport.scrollLeft - edgeBoundaryLeftRef.current;
              const edgeOffset = resistedEdgeOffset(
                -edgeWheelDistanceRef.current,
              );
              container.style.transform = `translate3d(${scrollCompensation + edgeOffset}px, 0px, 0px)`;
            });
          }
        }
      } else if (edgeWheelDistanceRef.current !== 0) {
        if (edgeFrameRef.current !== null) {
          cancelAnimationFrame(edgeFrameRef.current);
          edgeFrameRef.current = null;
        }
        edgeWheelDistanceRef.current = 0;
        if (container) {
          container.style.removeProperty("transform");
          container.style.removeProperty("will-change");
        }
      }

      if (!wheelGestureActiveRef.current) {
        if (!atOuterEdge) edgeWheelDistanceRef.current = 0;
        wheelGestureActiveRef.current = true;
        beginPaging(null);
      }
    };

    const settle = () => {
      if (
        !pagingRef.current ||
        wheelGestureActiveRef.current ||
        viewport.clientWidth === 0
      ) {
        return;
      }

      const requestedIndex = pagingTargetIndexRef.current;
      const nearestIndex = closestPageIndex(viewport, pages.length);
      const targetIndex =
        requestedIndex ??
        Math.max(
          gestureStartIndexRef.current - 1,
          Math.min(gestureStartIndexRef.current + 1, nearestIndex),
        );
      const targetLeft = targetIndex * viewport.clientWidth;

      if (Math.abs(viewport.scrollLeft - targetLeft) > 1) {
        viewport.scrollTo({ left: targetLeft, behavior: "smooth" });
        return;
      }

      const targetPage = pages[targetIndex];
      if (!targetPage || targetIndex === activeIndex) {
        finishPaging();
        return;
      }
      onPageChange(targetPage.id);
    };

    const releaseEdge = () => {
      const container = containerRef.current;
      if (!container || edgeWheelDistanceRef.current === 0) return;
      if (edgeFrameRef.current !== null) {
        cancelAnimationFrame(edgeFrameRef.current);
        edgeFrameRef.current = null;
      }
      const edgeOffset = resistedEdgeOffset(-edgeWheelDistanceRef.current);
      viewport.scrollLeft = edgeBoundaryLeftRef.current;
      const startTransform = `translate3d(${edgeOffset}px, 0px, 0px)`;
      container.style.transform = startTransform;
      container.style.transform = "translate3d(0px, 0px, 0px)";
      if (typeof container.animate !== "function") {
        container.style.removeProperty("transform");
        container.style.removeProperty("will-change");
        return;
      }
      const animation = container.animate(
        [
          { transform: startTransform },
          { transform: "translate3d(0px, 0px, 0px)" },
        ],
        {
          duration: 260,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        },
      );
      void animation.finished
        .catch(() => undefined)
        .finally(() => {
          if (container.style.transform === "translate3d(0px, 0px, 0px)") {
            container.style.removeProperty("transform");
            container.style.removeProperty("will-change");
          }
        });
    };

    const wheelGestures = WheelGestures({
      preventWheelAction: false,
      reverseSign: false,
    });
    const unobserveWheel = wheelGestures.observe(viewport);
    const stopWatchingWheel = wheelGestures.on("wheel", (state) => {
      if (!state.isEnding) return;
      releaseEdge();
      edgeWheelDistanceRef.current = 0;
      wheelGestureActiveRef.current = false;
      settle();
    });

    viewport.addEventListener("wheel", handleWheel, {
      capture: true,
      passive: false,
    });
    viewport.addEventListener("scroll", clampToAdjacentPage);
    viewport.addEventListener("scrollend", settle);
    return () => {
      stopWatchingWheel();
      unobserveWheel();
      viewport.removeEventListener("wheel", handleWheel, true);
      viewport.removeEventListener("scroll", clampToAdjacentPage);
      viewport.removeEventListener("scrollend", settle);
      if (edgeFrameRef.current !== null) {
        cancelAnimationFrame(edgeFrameRef.current);
        edgeFrameRef.current = null;
      }
    };
  }, [activeIndex, beginPaging, finishPaging, onPageChange, pages]);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const alignActivePage = () => {
      if (pagingRef.current || viewport.clientWidth === 0) return;
      viewport.scrollLeft = activeIndex * viewport.clientWidth;
    };

    alignActivePage();
    if (typeof ResizeObserver !== "function") return;
    const observer = new ResizeObserver(alignActivePage);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [activeIndex, pages.length]);

  useLayoutEffect(() => {
    if (!pagingRef.current) return;
    const targetIndex = pagingTargetIndexRef.current;
    if (targetIndex === null || targetIndex === activeIndex) finishPaging();
  }, [activeIndex, finishPaging]);

  return (
    <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
      <div
        className={`relative min-w-0 flex-1 overflow-x-auto overflow-y-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
          paging ? "snap-none" : "snap-x snap-mandatory"
        }`}
        data-testid="sidebar-page-viewport"
        onPointerDownCapture={(event) => {
          if (pages.length > 1 && event.pointerType === "touch") {
            beginPaging(null);
          }
        }}
        ref={viewportRef}
      >
        <div
          className="flex min-h-full min-w-0 touch-auto"
          data-testid="sidebar-page-container"
          ref={containerRef}
        >
          {pages.map((page, index) => {
            const active = samePage(page.id, activePageId);
            const betweenIconTarget =
              pagingTargetIndex !== null &&
              index >= Math.min(activeIndex, pagingTargetIndex) &&
              index <= Math.max(activeIndex, pagingTargetIndex);
            const renderContent =
              active ||
              (paging &&
                (Math.abs(index - activeIndex) <= 1 || betweenIconTarget));
            return (
              <section
                aria-hidden={!active}
                className="min-w-0 flex-[0_0_100%] snap-start snap-always overflow-x-clip bg-sidebar"
                data-sidebar-page-id={page.id ?? "all"}
                inert={!active}
                key={page.id ?? "all"}
              >
                {renderContent ? renderPage(page) : null}
              </section>
            );
          })}
        </div>
      </div>

      <TooltipProvider delayDuration={350}>
        <nav
          aria-label="Sidebar pages"
          className="sticky bottom-0 z-[70] flex min-h-11 max-w-full items-center overflow-x-auto border-t border-sidebar-border/60 bg-sidebar/95 px-2 py-1.5 shadow-[0_-8px_20px_-16px_rgb(0_0_0/0.45)] backdrop-blur"
        >
          <div className="mx-auto flex w-max items-center gap-1">
            {pages.map((page, index) => {
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
                        if (index === activeIndex) return;
                        const viewport = viewportRef.current;
                        if (!viewport || viewport.clientWidth === 0) {
                          onPageChange(page.id);
                          return;
                        }
                        beginPaging(index);
                        viewport.scrollTo({
                          left: index * viewport.clientWidth,
                          behavior: prefersReducedMotion() ? "auto" : "smooth",
                        });
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
