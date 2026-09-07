import { WheelGesturesPlugin } from "embla-carousel-wheel-gestures";
import useEmblaCarousel from "embla-carousel-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
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
  const initialIndex = useRef(activeIndex);
  const plugins = useMemo(
    () => [WheelGesturesPlugin({ forceWheelAxis: "x" })],
    [],
  );
  const options = useMemo(
    () => ({
      align: "start" as const,
      containScroll: "keepSnaps" as const,
      dragFree: false,
      loop: false,
      skipSnaps: false,
      slidesToScroll: 1,
      startIndex: initialIndex.current,
      watchFocus: false,
    }),
    [],
  );
  const [viewportRef, emblaApi] = useEmblaCarousel(options, plugins);
  const pagingRef = useRef(false);
  const [paging, setPaging] = useState(false);
  const [pagingTargetIndex, setPagingTargetIndex] = useState<number | null>(
    null,
  );

  const beginPaging = useCallback((targetIndex: number | null) => {
    pagingRef.current = true;
    setPaging(true);
    setPagingTargetIndex(targetIndex);
  }, []);

  const finishPaging = useCallback(() => {
    pagingRef.current = false;
    setPaging(false);
    setPagingTargetIndex(null);
  }, []);

  useEffect(() => {
    if (!emblaApi) return;
    const settle = () => {
      const targetIndex = emblaApi.selectedScrollSnap();
      const targetPage = pages[targetIndex];
      if (!targetPage || targetIndex === activeIndex) {
        finishPaging();
        return;
      }
      onPageChange(targetPage.id);
    };
    emblaApi.on("settle", settle);
    return () => {
      emblaApi.off("settle", settle);
    };
  }, [activeIndex, emblaApi, finishPaging, onPageChange, pages]);

  useLayoutEffect(() => {
    if (!emblaApi) return;
    if (emblaApi.selectedScrollSnap() !== activeIndex) {
      emblaApi.scrollTo(activeIndex, true);
    }
    finishPaging();
  }, [activeIndex, emblaApi, finishPaging, pages.length]);

  return (
    <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
      <div
        className="relative min-w-0 flex-1 overflow-x-hidden overflow-y-auto"
        data-testid="sidebar-page-viewport"
        onWheelCapture={(event) => {
          if (
            pages.length > 1 &&
            Math.abs(event.deltaX) > Math.abs(event.deltaY) &&
            !pagingRef.current
          ) {
            beginPaging(null);
          }
        }}
        ref={viewportRef}
      >
        <div
          className="flex min-h-full min-w-0 touch-pan-y"
          data-testid="sidebar-page-container"
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
                className="min-w-0 flex-[0_0_100%] overflow-x-clip bg-sidebar"
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
                        if (!emblaApi) {
                          onPageChange(page.id);
                          return;
                        }
                        beginPaging(index);
                        emblaApi.scrollTo(index, prefersReducedMotion());
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
