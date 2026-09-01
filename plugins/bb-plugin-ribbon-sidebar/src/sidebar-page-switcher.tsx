import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type WheelEvent,
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
  children: ReactNode;
  onPageChange(pageId: string | null): void;
  pages: readonly SidebarPage[];
}

const RELEASE_DELAY_MS = 72;
const SETTLE_DURATION_MS = 240;
const VELOCITY_PROJECTION_MS = 140;
const EDGE_RESISTANCE = 0.22;

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
  children,
  onPageChange,
  pages,
}: SidebarPageSwitcherProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const releaseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settleFallback = useRef<ReturnType<typeof setTimeout> | null>(null);
  const translationRef = useRef(0);
  const velocityRef = useRef(0);
  const lastWheelAt = useRef<number | null>(null);
  const pendingPage = useRef<SidebarPage | null>(null);
  const settling = useRef<"idle" | "page" | "snapback">("idle");
  const [translation, setTranslation] = useState(0);
  const [transitioning, setTransitioning] = useState(false);
  const [previewPage, setPreviewPage] = useState<SidebarPage | null>(null);

  const activeIndex = Math.max(
    0,
    pages.findIndex(({ id }) => samePage(id, activePageId)),
  );

  function clearTimer(timer: typeof releaseTimer) {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }

  function pageWidth() {
    const viewport = viewportRef.current;
    return viewport?.clientWidth || viewport?.getBoundingClientRect().width || 280;
  }

  function movePanel(next: number) {
    translationRef.current = next;
    setTranslation(next);
  }

  function finishSettle() {
    if (settling.current === "idle") return;
    clearTimer(settleFallback);
    const nextPage = pendingPage.current;
    const shouldChangePage = settling.current === "page" && nextPage !== null;
    settling.current = "idle";
    pendingPage.current = null;
    velocityRef.current = 0;
    lastWheelAt.current = null;
    setTransitioning(false);
    setPreviewPage(null);
    movePanel(0);
    if (shouldChangePage) onPageChange(nextPage.id);
  }

  function beginSettle(targetIndex: number) {
    clearTimer(releaseTimer);
    const clampedIndex = Math.max(0, Math.min(pages.length - 1, targetIndex));
    if (clampedIndex === activeIndex) {
      settling.current = "snapback";
      pendingPage.current = null;
      setTransitioning(true);
      movePanel(0);
    } else {
      const nextPage = pages[clampedIndex]!;
      const direction = clampedIndex > activeIndex ? 1 : -1;
      settling.current = "page";
      pendingPage.current = nextPage;
      setPreviewPage(nextPage);
      setTransitioning(true);
      movePanel(-direction * pageWidth());
    }

    if (prefersReducedMotion()) {
      finishSettle();
      return;
    }
    settleFallback.current = setTimeout(finishSettle, SETTLE_DURATION_MS + 80);
  }

  function settleGesture() {
    const width = pageWidth();
    const projectedTranslation =
      translationRef.current +
      Math.max(-1.1, Math.min(1.1, velocityRef.current)) *
        VELOCITY_PROJECTION_MS;
    const relativePage = Math.round(-projectedTranslation / width);
    beginSettle(activeIndex + Math.max(-1, Math.min(1, relativePage)));
  }

  function handleWheel(event: WheelEvent<HTMLDivElement>) {
    if (
      pages.length < 2 ||
      Math.abs(event.deltaX) <= Math.abs(event.deltaY) ||
      settling.current !== "idle"
    ) {
      return;
    }
    event.preventDefault();
    clearTimer(releaseTimer);
    setTransitioning(false);

    const now = event.timeStamp;
    if (lastWheelAt.current !== null) {
      const elapsed = Math.max(8, Math.min(40, now - lastWheelAt.current));
      const instantVelocity = -event.deltaX / elapsed;
      velocityRef.current =
        velocityRef.current * 0.55 + instantVelocity * 0.45;
    } else {
      velocityRef.current = 0;
    }
    lastWheelAt.current = now;

    const width = pageWidth();
    const rawTranslation = translationRef.current - event.deltaX;
    const beyondFirst = rawTranslation > 0 && activeIndex === 0;
    const beyondLast = rawTranslation < 0 && activeIndex === pages.length - 1;
    const nextTranslation =
      beyondFirst || beyondLast
        ? translationRef.current - event.deltaX * EDGE_RESISTANCE
        : rawTranslation;
    const boundedTranslation = Math.max(
      -width * 0.96,
      Math.min(width * 0.96, nextTranslation),
    );
    movePanel(boundedTranslation);

    const previewIndex =
      boundedTranslation < 0 ? activeIndex + 1 : activeIndex - 1;
    setPreviewPage(pages[previewIndex] ?? null);
    releaseTimer.current = setTimeout(settleGesture, RELEASE_DELAY_MS);
  }

  useEffect(
    () => () => {
      clearTimer(releaseTimer);
      clearTimer(settleFallback);
    },
    [],
  );

  useEffect(() => {
    if (settling.current !== "idle") return;
    setTransitioning(false);
    setPreviewPage(null);
    movePanel(0);
  }, [activePageId, pages]);

  return (
    <div className="relative flex min-w-0 flex-1 flex-col">
      <div
        className="relative min-w-0 flex-1 overflow-x-clip overscroll-x-contain"
        data-testid="sidebar-page-viewport"
        onWheel={handleWheel}
        ref={viewportRef}
        style={{ touchAction: "pan-y" }}
      >
        {previewPage ? (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 flex min-h-28 items-center justify-center text-sidebar-foreground/45"
          >
            <span className="flex flex-col items-center gap-2 text-xs font-medium">
              <span className="flex size-9 items-center justify-center rounded-xl bg-sidebar-accent">
                {previewPage.icon}
              </span>
              {previewPage.label}
            </span>
          </div>
        ) : null}
        <div
          className="relative min-w-0 bg-sidebar will-change-transform motion-reduce:transition-none"
          data-testid="sidebar-page-panel"
          onTransitionEnd={(event) => {
            if (
              event.currentTarget === event.target &&
              event.propertyName === "transform"
            ) {
              finishSettle();
            }
          }}
          style={{
            transform: `translate3d(${translation}px, 0, 0)`,
            transition: transitioning
              ? `transform ${SETTLE_DURATION_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`
              : "none",
          }}
        >
          {children}
        </div>
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
                      disabled={settling.current !== "idle"}
                      onClick={() => {
                        const targetIndex = pages.indexOf(page);
                        if (targetIndex !== activeIndex) {
                          beginSettle(targetIndex);
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
