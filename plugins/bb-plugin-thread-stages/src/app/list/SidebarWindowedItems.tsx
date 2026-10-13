import {
  memo,
  startTransition,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";
import {
  SIDEBAR_CONTENT_SELECTOR,
  useSidebarContentElementRef,
} from "../ui/sidebar.js";
import {
  encodeSidebarWindowedNavigationEntries,
  SIDEBAR_WINDOWED_NAV_ATTRIBUTE,
  type SidebarWindowedNavigationEntry,
} from "./sidebarThreadShortcuts.js";

const WINDOW_VIEWPORT_MARGIN_PX = 1_200;
const DEFAULT_ROW_HEIGHT_PX = 30;

interface MeasuredItemHeight {
  height: number;
  rows: number;
}

interface SidebarWindowedItemsProps {
  itemKeys: readonly string[];
  focusItemKey?: string;
  estimateRows: (index: number) => number;
  alwaysMountedKeys?: ReadonlySet<string>;
  getNavigationEntries?: (
    index: number,
  ) => readonly SidebarWindowedNavigationEntry[];
  renderItem: (index: number) => ReactNode;
}

const EMPTY_KEY_SET: ReadonlySet<string> = new Set();

// Window changes must not rebuild the rows that are already on screen.
// Their render callback is unchanged during an observer update, but can
// change when the parent supplies new thread data or drag state.
const SidebarWindowedItem = memo(function SidebarWindowedItem({
  index,
  isRealized,
  placeholderHeight,
  navigationValue,
  wrapperRef,
  renderItem,
}: {
  index: number;
  isRealized: boolean;
  placeholderHeight?: number;
  navigationValue?: string;
  wrapperRef: (node: HTMLDivElement | null) => void;
  renderItem: SidebarWindowedItemsProps["renderItem"];
}) {
  return (
    <div
      ref={wrapperRef}
      data-sidebar-windowed-item=""
      {...(navigationValue !== undefined
        ? { [SIDEBAR_WINDOWED_NAV_ATTRIBUTE]: navigationValue }
        : undefined)}
      style={isRealized ? undefined : { height: placeholderHeight }}
    >
      {isRealized ? renderItem(index) : null}
    </div>
  );
});

function mergeRealizedKeys(
  previous: ReadonlySet<string>,
  {
    add,
    remove,
    retain,
  }: {
    add?: ReadonlySet<string> | readonly string[];
    remove?: ReadonlySet<string> | readonly string[];
    retain?: ReadonlySet<string>;
  },
): ReadonlySet<string> {
  let next: Set<string> | null = null;
  const current = () => next ?? previous;
  if (retain) {
    for (const key of previous) {
      if (!retain.has(key)) {
        next ??= new Set(previous);
        next.delete(key);
      }
    }
  }
  for (const key of remove ?? EMPTY_KEY_SET) {
    if (current().has(key)) {
      next ??= new Set(previous);
      next.delete(key);
    }
  }
  for (const key of add ?? EMPTY_KEY_SET) {
    if (!current().has(key)) {
      next ??= new Set(previous);
      next.add(key);
    }
  }
  return next ?? previous;
}

export function SidebarWindowedItems({
  itemKeys,
  focusItemKey,
  estimateRows,
  alwaysMountedKeys = EMPTY_KEY_SET,
  getNavigationEntries,
  renderItem,
}: SidebarWindowedItemsProps) {
  const scrollElementRef = useSidebarContentElementRef();
  const windowingEnabled = itemKeys.length > 0 && scrollElementRef !== null;

  const [realizedKeys, setRealizedKeys] =
    useState<ReadonlySet<string>>(EMPTY_KEY_SET);
  const realizedKeysRef = useRef(realizedKeys);
  const focusItemKeyRef = useRef(focusItemKey);
  const measuredHeightsRef = useRef(new Map<string, MeasuredItemHeight>());
  const rowHeightRef = useRef(DEFAULT_ROW_HEIGHT_PX);
  const wrapperByKeyRef = useRef(new Map<string, HTMLDivElement>());
  const keyByWrapperRef = useRef(new Map<Element, string>());
  const wrapperRefCallbacksRef = useRef(
    new Map<string, (node: HTMLDivElement | null) => void>(),
  );
  const observerRef = useRef<IntersectionObserver | null>(null);
  const viewportObserverRef = useRef<IntersectionObserver | null>(null);
  const alwaysMountedKeysRef = useRef(alwaysMountedKeys);
  alwaysMountedKeysRef.current = alwaysMountedKeys;
  const rowsByKey = useMemo(
    () =>
      new Map(
        itemKeys.map((key, index) => [key, Math.max(1, estimateRows(index))]),
      ),
    [itemKeys, estimateRows],
  );
  const rowsByKeyRef = useRef(rowsByKey);
  rowsByKeyRef.current = rowsByKey;
  const navigationByKey = useMemo(() => {
    const values = new Map<string, string>();
    if (getNavigationEntries) {
      itemKeys.forEach((key, index) => {
        const entries = getNavigationEntries(index);
        if (entries.length > 0) {
          values.set(key, encodeSidebarWindowedNavigationEntries(entries));
        }
      });
    }
    return values;
  }, [itemKeys, getNavigationEntries]);

  useLayoutEffect(() => {
    realizedKeysRef.current = realizedKeys;
    focusItemKeyRef.current = focusItemKey;
  });

  const keySignature = useMemo(() => itemKeys.join("\u0000"), [itemKeys]);

  useLayoutEffect(() => {
    if (!focusItemKey) return;
    const wrapper = wrapperByKeyRef.current.get(focusItemKey);
    const target = wrapper?.querySelector<HTMLElement>(
      "a[data-sidebar-thread-id], button[aria-expanded]",
    );
    target?.focus();
  }, [focusItemKey]);

  const getWrapperRefCallback = useCallback((key: string) => {
    const callbacks = wrapperRefCallbacksRef.current;
    let callback = callbacks.get(key);
    if (!callback) {
      callback = (node: HTMLDivElement | null) => {
        const previous = wrapperByKeyRef.current.get(key);
        if (previous && previous !== node) {
          keyByWrapperRef.current.delete(previous);
          observerRef.current?.unobserve(previous);
          viewportObserverRef.current?.unobserve(previous);
        }
        if (node) {
          wrapperByKeyRef.current.set(key, node);
          keyByWrapperRef.current.set(node, key);
          observerRef.current?.observe(node);
          viewportObserverRef.current?.observe(node);
        } else {
          wrapperByKeyRef.current.delete(key);
        }
      };
      callbacks.set(key, callback);
    }
    return callback;
  }, []);

  const resolveScrollElement = useCallback((): Element | null => {
    const fromRef = scrollElementRef?.current ?? null;
    if (fromRef) {
      return fromRef;
    }
    const firstWrapper = wrapperByKeyRef.current.values().next();
    return firstWrapper.done
      ? null
      : firstWrapper.value.closest(SIDEBAR_CONTENT_SELECTOR);
  }, [scrollElementRef]);

  const recordMeasuredHeight = useCallback((key: string, height: number) => {
    if (height <= 0) {
      return;
    }
    const rows = rowsByKeyRef.current.get(key) ?? 0;
    measuredHeightsRef.current.set(key, { height, rows });
    // A subtree mixes measured rows with estimated placeholders. Only a
    // single rendered row can calibrate the estimates for the rest of the list.
    if (rows === 1) {
      const perRow = height / rows;
      if (perRow >= 20 && perRow <= 80) {
        rowHeightRef.current = perRow;
      }
    }
  }, []);

  useLayoutEffect(() => {
    if (!windowingEnabled) {
      setRealizedKeys((previous) =>
        previous.size > 0 ? EMPTY_KEY_SET : previous,
      );
      return;
    }

    const keySet = new Set(itemKeys);
    for (const staleMap of [
      measuredHeightsRef.current,
      wrapperRefCallbacksRef.current,
    ] as const) {
      for (const key of staleMap.keys()) {
        if (!keySet.has(key)) {
          staleMap.delete(key);
        }
      }
    }

    const scrollElement = resolveScrollElement();
    const promoteAll =
      !scrollElement || typeof IntersectionObserver === "undefined";

    const promoted = new Set<string>();
    if (promoteAll) {
      for (const key of itemKeys) {
        promoted.add(key);
      }
    } else if (scrollElement.clientHeight > 0) {
      const viewport = scrollElement.getBoundingClientRect();
      const viewportTop = viewport.top;
      const viewportBottom = viewport.bottom;
      for (const [key, element] of wrapperByKeyRef.current) {
        if (realizedKeys.has(key) || !keySet.has(key)) {
          continue;
        }
        const rect = element.getBoundingClientRect();
        if (rect.bottom >= viewportTop && rect.top <= viewportBottom) {
          promoted.add(key);
        }
      }
    }

    setRealizedKeys((previous) =>
      mergeRealizedKeys(previous, { add: promoted, retain: keySet }),
    );

    const observer = observerRef.current;
    if (observer) {
      for (const element of wrapperByKeyRef.current.values()) {
        observer.observe(element);
        viewportObserverRef.current?.observe(element);
      }
    }
    // oxlint-disable-next-line react/exhaustive-deps
  }, [windowingEnabled, keySignature]);

  useEffect(() => {
    if (!windowingEnabled || typeof IntersectionObserver === "undefined") {
      return;
    }
    const scrollElement = resolveScrollElement();
    if (!scrollElement) {
      return;
    }

    let observer: IntersectionObserver | null = null;
    let viewportObserver: IntersectionObserver | null = null;
    let resizeObserver: ResizeObserver | null = null;

    const connect = () => {
      if (observer || scrollElement.clientHeight === 0) {
        return;
      }
      observer = new IntersectionObserver(
        (entries) => {
          const intended = new Map<string, boolean>();
          for (const entry of entries) {
            const key = keyByWrapperRef.current.get(entry.target);
            if (key === undefined) {
              continue;
            }
            if (entry.isIntersecting) {
              intended.set(key, true);
            } else if (!alwaysMountedKeysRef.current.has(key)) {
              intended.set(key, false);
              // A placeholder is an estimate, not a measurement. Feeding it
              // back into the row height makes estimates oscillate as we scroll.
              if (entry.target.childElementCount > 0) {
                recordMeasuredHeight(key, entry.boundingClientRect.height);
              }
            }
          }
          if (intended.size === 0) {
            return;
          }
          const entering: string[] = [];
          const leaving: string[] = [];
          for (const [key, isEntering] of intended) {
            (isEntering ? entering : leaving).push(key);
          }
          const update = () =>
            setRealizedKeys((previous) =>
              mergeRealizedKeys(previous, { add: entering, remove: leaving }),
            );
          startTransition(update);
        },
        {
          root: scrollElement,
          rootMargin: `${WINDOW_VIEWPORT_MARGIN_PX}px 0px`,
        },
      );
      viewportObserver = new IntersectionObserver((entries) => {
        const newlyVisible: string[] = [];
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const key = keyByWrapperRef.current.get(entry.target);
          if (key !== undefined &&
              !realizedKeysRef.current.has(key) &&
              !alwaysMountedKeysRef.current.has(key) &&
              focusItemKeyRef.current !== key) {
            newlyVisible.push(key);
          }
        }
        // The viewport observer catches a row whose buffered render is still
        // pending when fast scrolling carries it onto the screen.
        if (newlyVisible.length > 0) {
          flushSync(() => setRealizedKeys((previous) =>
            mergeRealizedKeys(previous, { add: newlyVisible }),
          ));
        }
      }, { root: scrollElement });
      viewportObserverRef.current = viewportObserver;
      observerRef.current = observer;
      for (const element of wrapperByKeyRef.current.values()) {
        observer.observe(element);
        viewportObserver.observe(element);
      }
      resizeObserver?.disconnect();
      resizeObserver = null;
    };

    connect();
    if (!observer && typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => connect());
      resizeObserver.observe(scrollElement);
    }

    return () => {
      resizeObserver?.disconnect();
      observerRef.current = null;
      observer?.disconnect();
      viewportObserverRef.current = null;
      viewportObserver?.disconnect();
    };
  }, [windowingEnabled, resolveScrollElement, recordMeasuredHeight]);

  return (
    <>
      {itemKeys.map((key, index) => {
        const isRealized =
          !windowingEnabled ||
          realizedKeys.has(key) ||
          alwaysMountedKeys.has(key) ||
          focusItemKey === key;
        const rows = rowsByKey.get(key) ?? 1;
        let placeholderHeight: number | undefined;
        let navigationValue: string | undefined;
        if (!isRealized) {
          const measured = measuredHeightsRef.current.get(key);
          placeholderHeight =
            measured && measured.rows === rows
              ? measured.height
              : rows * rowHeightRef.current;
          navigationValue = navigationByKey.get(key);
        }
        return (
          <SidebarWindowedItem
            key={key}
            index={index}
            isRealized={isRealized}
            wrapperRef={getWrapperRefCallback(key)}
            navigationValue={navigationValue}
            placeholderHeight={placeholderHeight}
            renderItem={renderItem}
          />
        );
      })}
    </>
  );
}
