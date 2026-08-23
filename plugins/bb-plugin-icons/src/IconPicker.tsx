import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import {
  type ReactElement,
  useEffect,
  useLayoutEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  categoryLabel,
  iconLabel,
  searchIcons,
  type CatalogEntry,
} from "./icon-search";
import {
  iconColor,
  iconColorStyle,
} from "./icon-colors";
import { ICON_COLORS, type IconColor } from "./store";
import {
  ROW_HEIGHT,
  chunkRows,
  gridHeight,
  sameRange,
  visibleRows,
  type RowRange,
} from "./virtual-rows";
import { Icon } from "@/vendor/components/ui/icon";
import { Input } from "@/vendor/components/ui/input";
import { useIsCompactViewport } from "@/vendor/components/ui/hooks/use-compact-viewport";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/vendor/components/ui/popover";

export interface CatalogIcon extends Omit<CatalogEntry, "export"> {
  glyph: IconSvgElement;
}

export interface IconPickerProps {
  catalog: readonly CatalogIcon[];
  loading: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ownerName: string;
  icon: string;
  defaultIcon: string;
  color: IconColor | null;
  onPick: (icon: string) => void;
  onPickColor: (color: IconColor | null) => void;
  onReset: () => void;
  trigger: ReactElement;
}

export function IconPicker({
  catalog,
  loading,
  open,
  onOpenChange,
  ownerName,
  icon,
  defaultIcon,
  color,
  onPick,
  onPickColor,
  onReset,
  trigger,
}: IconPickerProps) {
  const [query, setQuery] = useState("");
  const [chosenCategory, setChosenCategory] = useState<string | null>(null);
  const [categoryOverflow, setCategoryOverflow] = useState({
    left: false,
    right: false,
  });
  const [catalogOverflow, setCatalogOverflow] = useState({
    top: false,
    bottom: false,
  });
  const [catalogScroller, setCatalogScroller] =
    useState<HTMLDivElement | null>(null);
  /**
   * Whether the scroll fades may animate yet.
   *
   * They are measured from a scroller this component only learns about through
   * a ref callback, and from a catalog that arrives over RPC, so the first
   * honest value always lands after the popover has painted. Transitioning to
   * it turns the picker's arrival into two movements — the popover, then a
   * fade a beat behind it. The fades therefore appear at their measured
   * opacity and only start transitioning on the frame after that.
   */
  const [fadesMayAnimate, setFadesMayAnimate] = useState(false);
  /** Bumped when the scroll area changes shape, so categories re-window. */
  const [resizeTick, setResizeTick] = useState(0);
  const isCompactViewport = useIsCompactViewport();
  const titleId = useId();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const categoryScrollerRef = useRef<HTMLDivElement>(null);
  const catalogContentRef = useRef<HTMLDivElement>(null);
  const categoryChipRefs = useRef(new Map<string, HTMLButtonElement>());
  const sectionRefs = useRef(new Map<string, HTMLElement>());
  const groups = useMemo(() => groupCatalog(catalog), [catalog]);
  const { results } = useMemo(
    () => searchIcons(catalog, query, null),
    [catalog, query],
  );
  const searching = query.trim().length > 0;
  const visibleGroups = useMemo(
    () => (searching ? groupCatalog(results) : groups),
    [groups, results, searching],
  );

  /**
   * Derived while rendering rather than chosen in an effect.
   *
   * A chip carries `transition-colors`, so selecting the first category after
   * mount animates it from unselected to selected — a second, later movement
   * on top of the popover's own entrance, which is not what bb's static menus
   * do. Naming the category during the same render paints it selected once.
   */
  const activeCategory =
    chosenCategory !== null &&
    visibleGroups.some(({ name }) => name === chosenCategory)
      ? chosenCategory
      : (visibleGroups[0]?.name ?? null);

  useEffect(() => {
    if (activeCategory === null) return;
    categoryChipRefs.current.get(activeCategory)?.scrollIntoView?.({
      behavior: "smooth",
      block: "nearest",
      inline: "nearest",
    });
  }, [activeCategory]);

  const updateCategoryOverflow = () => {
    const scroller = categoryScrollerRef.current;
    if (scroller === null) return;
    setCategoryOverflow({
      left: scroller.scrollLeft > 1,
      right:
        scroller.scrollLeft + scroller.clientWidth < scroller.scrollWidth - 1,
    });
  };

  useLayoutEffect(() => {
    updateCategoryOverflow();
    window.addEventListener("resize", updateCategoryOverflow);
    return () => window.removeEventListener("resize", updateCategoryOverflow);
  }, [visibleGroups]);

  const updateCatalogOverflow = (scroller = catalogScroller) => {
    if (scroller === null) return;
    if (!fadesMayAnimate) {
      requestAnimationFrame(() => setFadesMayAnimate(true));
    }
    setCatalogOverflow({
      top: scroller.scrollTop > 1,
      bottom:
        scroller.scrollTop + scroller.clientHeight < scroller.scrollHeight - 1,
    });
  };

  /**
   * Layout, not effect: the fades carry `transition-opacity`, so measuring
   * after the browser has painted makes them fade in a beat behind the popover
   * instead of simply being there.
   */
  useLayoutEffect(() => {
    const scroller = catalogScroller;
    if (scroller === null) return;
    updateCatalogOverflow(scroller);
    const handleResize = () => updateCatalogOverflow();
    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => updateCatalogOverflow(scroller));
    resizeObserver?.observe(scroller);
    if (catalogContentRef.current !== null) {
      resizeObserver?.observe(catalogContentRef.current);
    }
    window.addEventListener("resize", handleResize);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", handleResize);
    };
  }, [
    catalog.length,
    catalogScroller,
    loading,
    open,
    results.length,
    searching,
  ]);

  const scrollCategories = (direction: -1 | 1) => {
    categoryScrollerRef.current?.scrollBy({
      left: direction * 180,
      behavior: "smooth",
    });
  };

  const jumpToCategory = (name: string) => {
    setChosenCategory(name);
    sectionRefs.current.get(name)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  const trackVisibleCategory = (scrollingElement: HTMLDivElement) => {
    const threshold = scrollingElement.getBoundingClientRect().top + 8;
    let next = visibleGroups[0]?.name ?? null;
    for (const { name } of visibleGroups) {
      const section = sectionRefs.current.get(name);
      if (
        section !== undefined &&
        section.getBoundingClientRect().top <= threshold
      ) {
        next = name;
      } else if (section !== undefined) break;
    }
    if (next !== null) setChosenCategory(next);
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        collisionPadding={8}
        aria-labelledby={isCompactViewport ? undefined : titleId}
        mobileTitle={`Icon for ${ownerName}`}
        style={isCompactViewport ? undefined : { width: 386 }}
      >
        {/*
          A guard, not a fix for anything observed: Radix only sets
          --radix-popover-content-available-height once it has measured, and
          without a fallback the calc() is invalid until then, leaving the box
          to whatever its content happens to be. 32rem matches the max-height
          below, so a measured value only ever shrinks it.
        */}
        <div className="flex h-[calc(var(--radix-popover-content-available-height,32rem)-2rem)] max-h-[32rem] flex-col gap-3 pr-1 max-md:h-[calc(85dvh-3rem)] max-md:max-h-none">
          {isCompactViewport ? null : (
            <h2 id={titleId} className="sr-only">
              Icon for {ownerName}
            </h2>
          )}

          <div className="flex items-center gap-2 py-1">
            <div
              role="group"
              aria-label="Color"
              className="flex min-w-0 flex-1 items-center gap-2"
            >
              <ColorSwatch
                label="Theme color"
                selected={color === null}
                onClick={() => onPickColor(null)}
                className="bg-muted-foreground"
              />
              {ICON_COLORS.map((swatch) => {
                const label = titleCase(swatch);
                return (
                  <ColorSwatch
                    key={swatch}
                    label={label}
                    selected={color === swatch}
                    onClick={() => onPickColor(swatch)}
                    style={{
                      backgroundColor: iconColor(swatch) ?? undefined,
                    }}
                  />
                );
              })}
            </div>
            <button
              type="button"
              aria-label="Remove custom icon"
              onClick={onReset}
              disabled={icon === defaultIcon && color === null}
              className="shrink-0 cursor-pointer rounded-md px-1.5 py-1 text-xs text-destructive transition-colors hover:bg-destructive/15 hover:text-destructive active:bg-destructive/20 disabled:invisible"
            >
              Remove
            </button>
          </div>

          <div className="relative">
            <Icon
              name="Search"
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              ref={searchInputRef}
              role="searchbox"
              aria-label="Search icons"
              autoFocus
              placeholder="Search icons"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="pr-10 pl-9"
            />
            {query.length > 0 ? (
              <button
                type="button"
                aria-label="Clear search"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  setQuery("");
                  searchInputRef.current?.focus();
                }}
                className="absolute top-1/2 right-1 flex size-7 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-state-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <Icon name="X" aria-hidden className="size-3.5" />
              </button>
            ) : null}
          </div>

          {visibleGroups.length > 0 || loading ? (
            <nav
              aria-label="Icon categories"
              className="flex min-w-0 items-center gap-1"
            >
              <button
                type="button"
                aria-label="Previous categories"
                disabled={!categoryOverflow.left}
                onClick={() => scrollCategories(-1)}
                className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-state-hover hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
              >
                <Icon name="ChevronLeft" aria-hidden className="size-3.5" />
              </button>
              <div
                ref={categoryScrollerRef}
                onScroll={updateCategoryOverflow}
                className="flex min-w-0 flex-1 gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                {visibleGroups.map(({ name }) => (
                  <CategoryChip
                    key={name}
                    active={activeCategory === name}
                    label={titleCase(categoryLabel(name))}
                    onClick={() => jumpToCategory(name)}
                    buttonRef={(node) => {
                      if (node === null) categoryChipRefs.current.delete(name);
                      else categoryChipRefs.current.set(name, node);
                    }}
                  />
                ))}
              </div>
              <button
                type="button"
                aria-label="Next categories"
                disabled={!categoryOverflow.right}
                onClick={() => scrollCategories(1)}
                className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-state-hover hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
              >
                <Icon name="ChevronRight" aria-hidden className="size-3.5" />
              </button>
            </nav>
          ) : null}

          <div className="relative min-h-0 flex-1">
            <div
              ref={setCatalogScroller}
              role="region"
              aria-label={searching ? "Icon search results" : "Icon catalog"}
              className="h-full overflow-y-auto"
              onScroll={(event) => {
                updateCatalogOverflow(event.currentTarget);
                trackVisibleCategory(event.currentTarget);
              }}
            >
              <div ref={catalogContentRef}>
                {loading ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    Loading icons…
                  </p>
                ) : searching && results.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    No icons match.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {visibleGroups.map(({ name, entries }) => {
                      const headingId = `${titleId}-${name}`;
                      return (
                        <section
                          key={name}
                          ref={(node) => {
                            if (node === null) sectionRefs.current.delete(name);
                            else sectionRefs.current.set(name, node);
                          }}
                          aria-labelledby={headingId}
                          className="scroll-mt-1"
                        >
                          <h3
                            id={headingId}
                            className="mb-1.5 text-xs font-medium text-muted-foreground"
                          >
                            {titleCase(categoryLabel(name))}
                          </h3>
                          <IconGrid
                            entries={entries}
                            icon={icon}
                            color={color}
                            onPick={onPick}
                            scroller={catalogScroller}
                            virtualize={!isCompactViewport}
                            resizeTick={resizeTick}
                          />
                        </section>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
            <div
              aria-hidden
              data-scroll-fade="top"
              style={{ opacity: catalogOverflow.top ? 1 : 0 }}
              className={`pointer-events-none absolute inset-x-0 top-0 z-10 h-6 bg-gradient-to-b from-popover to-transparent ${fadesMayAnimate ? "transition-opacity" : ""}`}
            />
            <div
              aria-hidden
              data-scroll-fade="bottom"
              style={{ opacity: catalogOverflow.bottom ? 1 : 0 }}
              className={`pointer-events-none absolute inset-x-0 bottom-0 z-10 h-6 bg-gradient-to-t from-popover to-transparent ${fadesMayAnimate ? "transition-opacity" : ""}`}
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ColorSwatch({
  label,
  selected,
  onClick,
  className = "",
  style,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={selected}
      onClick={onClick}
      style={style}
      className={`size-5 shrink-0 cursor-pointer rounded-full border transition-colors ${className} ${
        selected
          ? "ring-2 ring-ring ring-offset-1 ring-offset-background"
          : "border-transparent"
      }`}
    />
  );
}

function CategoryChip({
  active,
  label,
  onClick,
  buttonRef,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  buttonRef?: (node: HTMLButtonElement | null) => void;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      aria-current={active ? "true" : undefined}
      onClick={onClick}
      className={`shrink-0 cursor-pointer rounded-full px-2 py-0.5 text-xs transition-colors ${
        active
          ? "bg-state-active text-foreground"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
}

/**
 * Draws only the rows of a category that are near the viewport.
 *
 * The catalog is 2,532 icons. Drawing every one of them put over fourteen
 * thousand nodes in the popover, where bb's own menus hold about twenty-five,
 * and the cost landed where it shows most: the browser built the whole grid
 * before it could paint, so the picker arrived late, and its entrance
 * animation ran on a blocked thread, dropping frames until it snapped into
 * place rather than easing.
 *
 * A category holds its full height whether or not its rows exist, so the
 * scrollbar always describes the whole catalog and nothing shifts underneath
 * the pointer. Rows are measured against the scroller rather than observed
 * individually: one listener per category, and a range that only changes when
 * the window of rows actually moves.
 *
 * A compact viewport lays the grid out with as many columns as fit rather than
 * a fixed eleven, so the row arithmetic would not hold; there the grid is
 * drawn whole.
 */
function IconGrid({
  entries,
  icon,
  color,
  onPick,
  scroller,
  virtualize,
  resizeTick,
}: {
  entries: readonly CatalogIcon[];
  icon: string;
  color: IconColor | null;
  onPick: (icon: string) => void;
  scroller: HTMLDivElement | null;
  virtualize: boolean;
  resizeTick: number;
}) {
  const gridRef = useRef<HTMLDivElement>(null);
  const rows = useMemo(() => chunkRows(entries), [entries]);
  const [range, setRange] = useState<RowRange>({ start: 0, end: 0 });

  // Measured before the browser paints, so the first frame already carries
  // the rows that belong on screen rather than filling in behind the popover.
  useLayoutEffect(() => {
    if (!virtualize || scroller === null) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const grid = gridRef.current;
      if (grid === null) return;
      // offsetTop and scrollTop, not bounding rects: every category measures
      // itself, and asking each one for a rect forces the browser to lay the
      // whole scroller out again, dozens of times, in the same frame the
      // popover is trying to appear in. The scroll area is the offset parent,
      // so subtracting the scroll gives the same number for nothing.
      const next = visibleRows(
        grid.offsetTop - scroller.scrollTop,
        scroller.clientHeight,
        rows.length,
      );
      setRange((current) => (sameRange(current, next) ? current : next));
    };
    // Scrolling fires far faster than the screen refreshes; one measure a
    // frame keeps the work off the critical path.
    const onScroll = () => {
      if (frame === 0) frame = requestAnimationFrame(measure);
    };
    measure();
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      if (frame !== 0) cancelAnimationFrame(frame);
      scroller.removeEventListener("scroll", onScroll);
    };
    // resizeTick stands in for the scroller changing shape: the picker already
    // watches it, and thirty-two categories each adding their own observer to
    // the same element would be that much waste for the same answer.
  }, [resizeTick, rows.length, scroller, virtualize]);

  if (!virtualize) {
    return (
      <div className="grid grid-cols-11 gap-1 max-md:grid-cols-[repeat(auto-fill,1.75rem)]">
        {entries.map((entry) => (
          <IconButton
            key={entry.name}
            entry={entry}
            icon={icon}
            color={color}
            onPick={onPick}
          />
        ))}
      </div>
    );
  }

  const drawn = rows.slice(range.start, range.end);
  return (
    <div ref={gridRef} style={{ height: gridHeight(rows.length) }}>
      <div style={{ transform: `translateY(${range.start * ROW_HEIGHT}px)` }}>
        {drawn.map((row, index) => (
          <div
            key={range.start + index}
            className="grid grid-cols-11 gap-1"
            style={{ height: ROW_HEIGHT - 4, marginBottom: 4 }}
          >
            {row.map((entry) => (
              <IconButton
                key={entry.name}
                entry={entry}
                icon={icon}
                color={color}
                onPick={onPick}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** One icon in the grid, drawn the same whether or not rows are windowed. */
function IconButton({
  entry,
  icon,
  color,
  onPick,
}: {
  entry: CatalogIcon;
  icon: string;
  color: IconColor | null;
  onPick: (icon: string) => void;
}) {
  return (
    <button
      type="button"
      title={iconLabel(entry.name)}
      aria-label={iconLabel(entry.name)}
      aria-pressed={entry.name === icon}
      onClick={() => onPick(entry.name)}
      style={iconColorStyle(color)}
      className={`flex size-7 cursor-pointer items-center justify-center rounded-md transition-colors duration-150 hover:duration-0 ${
        entry.name === icon
          ? "bg-state-active"
          : color === null
            ? "text-muted-foreground hover:bg-state-hover hover:text-foreground"
            : "hover:bg-state-hover"
      }`}
    >
      <HugeiconsIcon icon={entry.glyph} className="size-[18px]" aria-hidden />
    </button>
  );
}

function groupCatalog(catalog: readonly CatalogIcon[]) {
  const byCategory = new Map<string, CatalogIcon[]>();
  for (const entry of catalog) {
    const entries = byCategory.get(entry.category) ?? [];
    entries.push(entry);
    byCategory.set(entry.category, entries);
  }
  return [...byCategory.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, entries]) => ({ name, entries }));
}

function titleCase(value: string): string {
  if (value.toLowerCase() === "ai") return "AI";
  return value.replace(/\b\w/g, (character) => character.toUpperCase());
}
