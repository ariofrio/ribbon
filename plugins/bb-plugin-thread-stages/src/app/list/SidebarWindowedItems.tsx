import {
  memo,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";
import { useSidebarContentElementRef } from "../ui/sidebar.js";
import {
  refreshSidebarScrollWindows,
  subscribeSidebarScroll,
} from "./sidebarScrollUpdates.js";
import {
  encodeSidebarWindowedNavigationEntries,
  SIDEBAR_WINDOWED_NAV_ATTRIBUTE,
  type SidebarWindowedNavigationEntry,
} from "./sidebarThreadShortcuts.js";
const DEFAULT_ROW_HEIGHT_PX = 30;
const OVERSCAN_PX = 96;
const ROW_CACHE_LIMIT = 48;

interface SidebarWindowedItemsProps {
  freeze?: boolean;
  itemKeys: readonly string[];
  focusItemKey?: string;
  estimateRows: (i: number) => number;
  alwaysMountedKeys?: ReadonlySet<string>;
  getNavigationEntries?: (
    i: number,
  ) => readonly SidebarWindowedNavigationEntry[];
  renderItem: (i: number) => ReactNode;
}
const SidebarWindowedItem = memo(function SidebarWindowedItem({
  index,
  itemKey,
  contained,
  isLast,
  renderItem,
  registerWrapper,
}: {
  index: number;
  itemKey: string;
  contained: boolean;
  isLast: boolean;
  renderItem: SidebarWindowedItemsProps["renderItem"];
  registerWrapper: (key: string, node: HTMLDivElement | null) => void;
}) {
  const ref = useCallback(
    (n: HTMLDivElement | null) => registerWrapper(itemKey, n),
    [itemKey, registerWrapper],
  );
  return (
    <div
      ref={ref}
      data-sidebar-windowed-item=""
      style={{
        paddingBottom: isLast ? 0 : 1,
        ...(contained
          ? { contain: "layout style paint", overflowClipMargin: "4px" }
          : {}),
      }}
    >
      {renderItem(index)}
    </div>
  );
});
function lowerBound(a: Float64Array, x: number) {
  let l = 0,
    h = a.length - 1;
  while (l < h) {
    const m = (l + h) >>> 1;
    if (a[m + 1]! <= x) l = m + 1;
    else h = m;
  }
  return l;
}
export function SidebarWindowedItems({
  itemKeys,
  estimateRows,
  alwaysMountedKeys,
  focusItemKey,
  getNavigationEntries,
  renderItem,
  freeze = false,
}: SidebarWindowedItemsProps) {
  const scrollRef = useSidebarContentElementRef(),
    containerRef = useRef<HTMLDivElement>(null),
    wrapperByKeyRef = useRef(new Map<string, HTMLDivElement>()),
    measuredHeightsRef = useRef(
      new Map<string, { rows: number; height: number; isLast: boolean }>(),
    ),
    rowHeightRef = useRef(DEFAULT_ROW_HEIGHT_PX);
  // A new opening list must populate before the animation can reveal it.
  // Once open, a closing fold keeps the existing window instead of mounting all.
  const wasOpenRef = useRef(!freeze);
  if (!freeze) wasOpenRef.current = true;
  const frozenRef = useRef(false);
  frozenRef.current = freeze && wasOpenRef.current;
  const recentlyVisibleRef = useRef(new Map<string, number>()),
    cacheClockRef = useRef(0);
  const indexByKey = useMemo(
    () => new Map(itemKeys.map((key, i) => [key, i])),
    [itemKeys],
  );
  const [measurementVersion, setMeasurementVersion] = useState(0),
    [visibleRange, setVisibleRange] = useState<[number, number]>([0, -1]);
  const [focusedKey, setFocusedKey] = useState<string>();
  const visibleRangeRef = useRef(visibleRange);
  visibleRangeRef.current = visibleRange;
  useLayoutEffect(() => {
    for (const key of measuredHeightsRef.current.keys()) {
      if (!indexByKey.has(key)) measuredHeightsRef.current.delete(key);
    }
  }, [indexByKey]);
  const model = useMemo(() => {
    const offsets = new Float64Array(itemKeys.length + 1),
      counts = itemKeys.map((_, i) => Math.max(1, estimateRows(i)));
    for (let i = 0; i < itemKeys.length; i++) {
      const m = measuredHeightsRef.current.get(itemKeys[i]!);
      const isLast = i === itemKeys.length - 1;
      offsets[i + 1] =
        offsets[i]! +
        (m?.rows === counts[i] && m.isLast === isLast
          ? m.height
          : counts[i]! * rowHeightRef.current - Number(isLast));
    }
    return { offsets, counts };
  }, [itemKeys, estimateRows, measurementVersion]);
  const navigation = useMemo(() => {
    const chunks: string[] = [],
      offsets = [0];
    let p = 0;
    for (let i = 0; i < itemKeys.length; i++) {
      const v = encodeSidebarWindowedNavigationEntries(
        getNavigationEntries?.(i) ?? [],
      );
      chunks.push(v + " ");
      p += v.length + 1;
      offsets.push(p);
    }
    return { text: chunks.join(""), offsets };
  }, [itemKeys, getNavigationEntries]);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const keyByWrapperRef = useRef(new WeakMap<Element, string>());
  const registerWrapper = useCallback(
    (key: string, node: HTMLDivElement | null) => {
      const previous = wrapperByKeyRef.current.get(key);
      if (previous && previous !== node)
        resizeObserverRef.current?.unobserve(previous);
      if (node) {
        wrapperByKeyRef.current.set(key, node);
        keyByWrapperRef.current.set(node, key);
        resizeObserverRef.current?.observe(node);
      } else wrapperByKeyRef.current.delete(key);
    },
    [],
  );
  const resolveVisibleRange = useCallback(() => {
    if (scrollRef === null) return [0, itemKeys.length - 1] as [number, number];
    const s =
      scrollRef?.current ??
      containerRef.current?.closest<HTMLElement>("[data-sidebar=content]");
    if (!containerRef.current) return [0, -1] as [number, number];
    if (!s) return [0, itemKeys.length - 1] as [number, number];
    const v = s.getBoundingClientRect(),
      b = containerRef.current.getBoundingClientRect(),
      top = Math.max(v.top, 0) - b.top,
      bottom = Math.min(v.bottom, innerHeight) - b.top;
    if (bottom < 0 || top > model.offsets.at(-1)!)
      return [0, -1] as [number, number];
    return [
      Math.max(0, lowerBound(model.offsets, top - OVERSCAN_PX)),
      Math.min(
        itemKeys.length - 1,
        lowerBound(model.offsets, bottom + OVERSCAN_PX),
      ),
    ] as [number, number];
  }, [scrollRef, model, itemKeys.length]);
  const resolveVisibleRangeRef = useRef(resolveVisibleRange);
  resolveVisibleRangeRef.current = resolveVisibleRange;
  useLayoutEffect(() => {
    if (frozenRef.current) return;
    const next = resolveVisibleRange();
    if (
      next[0] !== visibleRangeRef.current[0] ||
      next[1] !== visibleRangeRef.current[1]
    ) {
      visibleRangeRef.current = next;
      setVisibleRange(next);
    }
  }, [resolveVisibleRange, freeze]);
  useLayoutEffect(() => {
    const scrollElement =
      scrollRef?.current ??
      containerRef.current?.closest<HTMLElement>('[data-sidebar="content"]');
    if (!scrollElement) return;
    function update() {
      if (frozenRef.current) return;
      const next = resolveVisibleRangeRef.current();
      if (
        next[0] === visibleRangeRef.current[0] &&
        next[1] === visibleRangeRef.current[1]
      )
        return;
      visibleRangeRef.current = next;
      setVisibleRange(next);
    }
    const unsubscribeScroll = subscribeSidebarScroll(scrollElement, update);
    const observer = new ResizeObserver((entries) => {
      if (frozenRef.current) return;
      const changed = entries.some((entry) => {
        const key = keyByWrapperRef.current.get(entry.target);
        if (key === undefined) return false;
        const height =
          entry.borderBoxSize[0]?.blockSize ??
          entry.target.getBoundingClientRect().height;
        return (
          Math.abs(
            (measuredHeightsRef.current.get(key)?.height ?? 0) - height,
          ) > 0.5
        );
      });
      flushSync(() => {
        if (changed) setMeasurementVersion((version) => version + 1);
        update();
      });
    });
    resizeObserverRef.current = observer;
    observer.observe(scrollElement);
    if (scrollElement.firstElementChild)
      observer.observe(scrollElement.firstElementChild);
    for (const node of wrapperByKeyRef.current.values()) observer.observe(node);
    return () => {
      resizeObserverRef.current = null;
      observer.disconnect();
      unsubscribeScroll();
    };
  }, [scrollRef]);
  useLayoutEffect(() => {
    let changed = false;
    for (const [key, n] of wrapperByKeyRef.current) {
      const i = indexByKey.get(key) ?? -1,
        h = n.getBoundingClientRect().height;
      if (i < 0 || h <= 1) continue;
      const count = model.counts[i]!;
      const old = measuredHeightsRef.current.get(key);
      const isLast = i === itemKeys.length - 1;
      if (
        !old ||
        Math.abs(old.height - h) > 0.5 ||
        old.rows !== count ||
        old.isLast !== isLast
      ) {
        measuredHeightsRef.current.set(key, { height: h, rows: count, isLast });
        changed = true;
      }
      // Calibrate the ordinary row stride, including its inter-row gap.
      // The last wrapper omits that gap; it must not shrink every estimate.
      const stride = h + Number(isLast);
      if (
        count === 1 &&
        stride >= 20 &&
        stride <= 80 &&
        Math.abs(rowHeightRef.current - stride) > 0.5
      ) {
        rowHeightRef.current = stride;
        changed = true;
      }
    }
    if (changed) setMeasurementVersion((v) => v + 1);
  }, [visibleRange, itemKeys, model]);
  useLayoutEffect(() => {
    const element =
      scrollRef?.current ??
      containerRef.current?.closest<HTMLElement>('[data-sidebar="content"]');
    if (element) refreshSidebarScrollWindows(element);
  }, [model, scrollRef]);
  useLayoutEffect(() => {
    if (focusItemKey)
      wrapperByKeyRef.current
        .get(focusItemKey)
        ?.querySelector<HTMLElement>(
          "a[data-sidebar-thread-id],button[aria-expanded]",
        )
        ?.focus();
  }, [focusItemKey]);
  const indices = new Set<number>();
  for (let i = visibleRange[0]; i <= visibleRange[1]; i++)
    if (i >= 0 && i < itemKeys.length) indices.add(i);
  for (const key of alwaysMountedKeys ?? []) {
    const i = itemKeys.indexOf(key);
    if (i >= 0) indices.add(i);
  }
  if (focusItemKey) {
    const i = itemKeys.indexOf(focusItemKey);
    if (i >= 0) indices.add(i);
  }
  if (focusedKey) {
    const index = indexByKey.get(focusedKey);
    if (index !== undefined) indices.add(index);
  }
  if (visibleRange[1] < visibleRange[0]) recentlyVisibleRef.current.clear();
  const time = ++cacheClockRef.current;
  for (const i of indices) recentlyVisibleRef.current.set(itemKeys[i]!, time);
  for (const key of recentlyVisibleRef.current.keys())
    if (!indexByKey.has(key)) recentlyVisibleRef.current.delete(key);
  const candidates = [...recentlyVisibleRef.current]
    .filter(([key]) => !indices.has(indexByKey.get(key)!))
    .sort((a, b) => b[1] - a[1]);
  // A cached parent represents its whole subtree, not one cheap leaf. Count
  // that work against the same budget rather than multiplying it at each depth.
  let retainedRows = [...indices].reduce(
    (sum, index) => sum + model.counts[index]!,
    0,
  );
  for (const [key] of candidates) {
    const index = indexByKey.get(key)!;
    if (retainedRows + model.counts[index]! <= ROW_CACHE_LIMIT) {
      indices.add(index);
      retainedRows += model.counts[index]!;
    } else recentlyVisibleRef.current.delete(key);
  }
  const ordered = [...indices].sort((a, b) => a - b);
  const content: ReactNode[] = [];
  let cursor = 0;
  function spacer(end: number) {
    if (end <= cursor) return;
    const start = cursor;
    content.push(
      <div
        key={"gap:" + start}
        data-sidebar-windowed-chunk-empty=""
        {...{
          [SIDEBAR_WINDOWED_NAV_ATTRIBUTE]: navigation.text
            .slice(navigation.offsets[start], navigation.offsets[end])
            .trim(),
        }}
        style={{
          height: model.offsets[end]! - model.offsets[start]!,
          overflowAnchor: "none",
        }}
      />,
    );
    cursor = end;
  }
  for (const i of ordered) {
    spacer(i);
    const key = itemKeys[i]!;
    content.push(
      <SidebarWindowedItem
        key={key}
        index={i}
        itemKey={key}
        isLast={i === itemKeys.length - 1}
        contained={
          !freeze &&
          scrollRef !== null &&
          key !== focusItemKey &&
          key !== focusedKey &&
          !alwaysMountedKeys?.has(key)
        }
        registerWrapper={registerWrapper}
        renderItem={renderItem}
      />,
    );
    cursor = i + 1;
  }
  spacer(itemKeys.length);
  return (
    <div
      ref={containerRef}
      style={{ overflowAnchor: "none" }}
      data-sidebar-windowed-count={itemKeys.length}
      onFocusCapture={(event) => {
        for (const [key, node] of wrapperByKeyRef.current) {
          if (node.contains(event.target)) {
            setFocusedKey(key);
            break;
          }
        }
      }}
      onBlurCapture={(event) => {
        if (
          !(event.relatedTarget instanceof Node) ||
          !event.currentTarget.contains(event.relatedTarget)
        )
          setFocusedKey(undefined);
      }}
    >
      {content}
    </div>
  );
}
