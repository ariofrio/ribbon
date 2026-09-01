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

function samePage(left: string | null, right: string | null) {
  return left === right;
}

function prefersReducedMotion() {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
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
  const [paging, setPaging] = useState(false);
  const [pagingTargetIndex, setPagingTargetIndex] = useState<number | null>(
    null,
  );

  const activeIndex = Math.max(
    0,
    pages.findIndex(({ id }) => samePage(id, activePageId)),
  );

  const settleOnNearestPage = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport || pages.length === 0) return;
    const width = viewport.clientWidth || viewport.getBoundingClientRect().width;
    if (width === 0) return;
    const targetIndex = Math.max(
      0,
      Math.min(pages.length - 1, Math.round(viewport.scrollLeft / width)),
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
    viewport.addEventListener("scrollend", settleOnNearestPage);
    return () => {
      viewport.removeEventListener("scrollend", settleOnNearestPage);
      if (scrollEndFallback.current !== null) {
        clearTimeout(scrollEndFallback.current);
      }
    };
  }, [settleOnNearestPage]);

  return (
    <div className="relative flex min-w-0 flex-1 flex-col">
      <div
        className="relative flex min-w-0 flex-1 overflow-x-auto overscroll-x-contain [&::-webkit-scrollbar]:hidden"
        data-testid="sidebar-page-viewport"
        onWheelCapture={(event) => {
          if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
            if (!paging || pagingTargetIndex !== null) {
              flushSync(() => {
                setPaging(true);
                setPagingTargetIndex(null);
              });
            }
          }
        }}
        onScroll={() => {
          if ("onscrollend" in (viewportRef.current ?? {})) return;
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
