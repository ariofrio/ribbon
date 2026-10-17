import {
  memo,
  cloneElement,
  isValidElement,
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
const RECYCLED_OVERSCAN_PX = 32;
const ROW_CACHE_LIMIT = 48;
const RECYCLED_ROW_TARGET = 24;
const MIN_SPARE_CELLS = 4;
const INTRINSIC_ROW_LIMIT = 8;

interface SidebarWindowedItemsProps {
  /** Only when an outer window already bounds these child rows. */
  allowIntrinsic?: boolean;
  /** Only opt in for rows whose owner state is external or reset on identity changes. */
  recycleItem?: (index: number) => boolean;
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
  recycled,
}: {
  index: number;
  itemKey: string;
  contained: boolean;
  isLast: boolean;
  recycled: boolean;
  renderItem: SidebarWindowedItemsProps["renderItem"];
  registerWrapper: (key: string, node: HTMLDivElement | null) => void;
}) {
  const ref = useCallback(
    (n: HTMLDivElement | null) => registerWrapper(itemKey, n),
    [itemKey, registerWrapper],
  );
  const content = renderItem(index);
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
      {recycled && isValidElement(content)
        ? cloneElement(content, { key: "row-content" })
        : content}
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
  recycleItem,
  allowIntrinsic = false,
  freeze = false,
}: SidebarWindowedItemsProps) {
  const recycling = recycleItem !== undefined;
  const overscan = recycling ? RECYCLED_OVERSCAN_PX : OVERSCAN_PX;
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
  const [pressedKeys, setPressedKeys] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const heldPointersRef = useRef(new Map<number, string>());
  useLayoutEffect(() => {
    if (!recycling) return;
    const release = (event: PointerEvent) => {
      const pointerId = event.pointerId;
      if (!heldPointersRef.current.has(pointerId)) return;
      // Finish the original event before a row can be rebound. Capture also
      // sees releases from editors and buttons that stop propagation.
      queueMicrotask(() => {
        heldPointersRef.current.delete(pointerId);
        setPressedKeys(new Set(heldPointersRef.current.values()));
      });
    };
    const clear = () => {
      if (heldPointersRef.current.size === 0) return;
      heldPointersRef.current.clear();
      setPressedKeys(new Set());
    };
    document.addEventListener("pointerup", release, true);
    document.addEventListener("pointercancel", release, true);
    window.addEventListener("blur", clear);
    return () => {
      document.removeEventListener("pointerup", release, true);
      document.removeEventListener("pointercancel", release, true);
      window.removeEventListener("blur", clear);
    };
  }, [recycling]);
  const committedSlotsRef = useRef(new Map<string, number>());
  const committedSlotOrderRef = useRef<readonly number[]>([]);
  const committedBufferRef = useRef<{
    first: number;
    keys: readonly string[];
  } | null>(null);
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
  // Small child windows already have a bounded parent. Keep recycling their
  // cells, but let intrinsic layout replace their own scroll/resize machinery.
  const intrinsic =
    allowIntrinsic &&
    itemKeys.length <= INTRINSIC_ROW_LIMIT &&
    model.counts.reduce((sum, rows) => sum + rows, 0) <= INTRINSIC_ROW_LIMIT;
  const measurementContextRef = useRef({
    indexByKey,
    model,
    length: itemKeys.length,
  });
  measurementContextRef.current = {
    indexByKey,
    model,
    length: itemKeys.length,
  };
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
  const pendingMeasurementKeysRef = useRef(new Set<string>());
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const keyByWrapperRef = useRef(new WeakMap<Element, string>());
  const registerWrapper = useCallback(
    (key: string, node: HTMLDivElement | null) => {
      const previous = wrapperByKeyRef.current.get(key);
      if (previous && previous !== node)
        resizeObserverRef.current?.unobserve(previous);
      if (node) {
        if (previous !== node) pendingMeasurementKeysRef.current.add(key);
        wrapperByKeyRef.current.set(key, node);
        keyByWrapperRef.current.set(node, key);
        resizeObserverRef.current?.observe(node);
      } else {
        wrapperByKeyRef.current.delete(key);
        pendingMeasurementKeysRef.current.delete(key);
      }
    },
    [],
  );
  const resolveVisibleRange = useCallback(() => {
    if (intrinsic || scrollRef === null)
      return [0, itemKeys.length - 1] as [number, number];
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
      Math.max(0, lowerBound(model.offsets, top - overscan)),
      Math.min(
        itemKeys.length - 1,
        lowerBound(model.offsets, bottom + overscan),
      ),
    ] as [number, number];
  }, [scrollRef, model, itemKeys.length, overscan, intrinsic]);
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
    if (intrinsic) return;
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
      const context = measurementContextRef.current;
      let changed = false;
      for (const entry of entries) {
        const key = keyByWrapperRef.current.get(entry.target);
        const index =
          key === undefined ? undefined : context.indexByKey.get(key);
        if (key === undefined || index === undefined) continue;
        const height =
          entry.borderBoxSize[0]?.blockSize ??
          entry.target.getBoundingClientRect().height;
        if (height <= 1) continue;
        const rows = context.model.counts[index]!;
        const isLast = index === context.length - 1;
        const expected =
          context.model.offsets[index + 1]! - context.model.offsets[index]!;
        measuredHeightsRef.current.set(key, { height, rows, isLast });
        if (Math.abs(expected - height) > 0.5) changed = true;
        const stride = height + Number(isLast);
        if (
          rows === 1 &&
          stride >= 20 &&
          stride <= 80 &&
          Math.abs(rowHeightRef.current - stride) > 0.5
        ) {
          rowHeightRef.current = stride;
          changed = true;
        }
      }
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
  }, [scrollRef, intrinsic]);
  // Leaf rows use the calibrated stride until ResizeObserver reports their
  // size. Reading every leaf here forces a second layout during cold mounts.
  // A new composite can contain a collapsed preview, so measure that unknown
  // shape before paint rather than exposing a spacer below a short subtree.
  useLayoutEffect(() => {
    if (intrinsic) return;
    let changed = false;
    for (const [key, node] of wrapperByKeyRef.current) {
      const index = indexByKey.get(key);
      if (index === undefined) continue;
      const rows = model.counts[index]!;
      if (rows === 1) {
        pendingMeasurementKeysRef.current.delete(key);
        continue;
      }
      const isLast = index === itemKeys.length - 1;
      const previous = measuredHeightsRef.current.get(key);
      if (
        !pendingMeasurementKeysRef.current.has(key) &&
        previous?.rows === rows &&
        previous.isLast === isLast
      )
        continue;
      const height = node.getBoundingClientRect().height;
      if (height <= 1) continue;
      measuredHeightsRef.current.set(key, { height, rows, isLast });
      pendingMeasurementKeysRef.current.delete(key);
      const expected = model.offsets[index + 1]! - model.offsets[index]!;
      if (Math.abs(expected - height) > 0.5) changed = true;
    }
    if (changed) setMeasurementVersion((version) => version + 1);
  }, [visibleRange, itemKeys, indexByKey, model, intrinsic]);
  useLayoutEffect(() => {
    if (intrinsic) return;
    const element =
      scrollRef?.current ??
      containerRef.current?.closest<HTMLElement>('[data-sidebar="content"]');
    if (element) refreshSidebarScrollWindows(element);
  }, [model, scrollRef, intrinsic]);
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
  const visibleIndices = new Set(indices);
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
  let buffer: { first: number; keys: readonly string[] } | null = null;
  const lockedKeys = new Set(alwaysMountedKeys);
  if (focusedKey) lockedKeys.add(focusedKey);
  if (focusItemKey) lockedKeys.add(focusItemKey);
  for (const key of pressedKeys) lockedKeys.add(key);
  if (recycleItem) {
    const rowCacheLimit = Math.max(
      RECYCLED_ROW_TARGET,
      visibleIndices.size + MIN_SPARE_CELLS,
    );
    for (const [key, node] of wrapperByKeyRef.current) {
      if (
        node.querySelector(
          '[data-sidebar-hover-actions-open="true"], [data-sidebar-row-busy="true"], [data-sidebar-row-interacting="true"]',
        )
      )
        lockedKeys.add(key);
    }
    for (const key of lockedKeys) {
      const index = indexByKey.get(key);
      if (index !== undefined) indices.add(index);
    }
    // A scroll inside the existing buffer only changes the range calculation.
    // Keep the same row bindings until its edge is crossed, then refill once.
    const previous = committedBufferRef.current;
    const previousEnd = previous
      ? previous.first + previous.keys.length - 1
      : -1;
    const keepPrevious =
      previous !== null &&
      visibleRange[1] >= visibleRange[0] &&
      visibleRange[0] >= previous.first &&
      visibleRange[1] <= previousEnd &&
      previous.keys.every(
        (key, offset) => itemKeys[previous.first + offset] === key,
      );
    // Interaction pins are additional lifetime requirements, not spare cache.
    // A retained large subtree must not starve an unrelated visible window.
    const buffered = new Set(visibleIndices);
    if (keepPrevious)
      for (let i = previous.first; i <= previousEnd; i++) buffered.add(i);
    const bufferedRows = [...buffered].reduce(
      (sum, index) => sum + model.counts[index]!,
      0,
    );
    if (keepPrevious && bufferedRows <= rowCacheLimit) {
      for (const index of buffered) indices.add(index);
      buffer = previous;
    } else if (visibleRange[1] >= visibleRange[0]) {
      const nextBuffer = new Set(visibleIndices);
      let retainedRows = [...nextBuffer].reduce(
        (sum, index) => sum + model.counts[index]!,
        0,
      );
      let left = visibleRange[0] - 1;
      let right = visibleRange[1] + 1;
      while (left >= 0 || right < itemKeys.length) {
        let added = false;
        if (
          right < itemKeys.length &&
          retainedRows + model.counts[right]! <= rowCacheLimit
        ) {
          if (!nextBuffer.has(right)) {
            nextBuffer.add(right);
            indices.add(right);
            retainedRows += model.counts[right]!;
          }
          right++;
          added = true;
        } else right = itemKeys.length;
        if (left >= 0 && retainedRows + model.counts[left]! <= rowCacheLimit) {
          if (!nextBuffer.has(left)) {
            nextBuffer.add(left);
            indices.add(left);
            retainedRows += model.counts[left]!;
          }
          left--;
          added = true;
        } else left = -1;
        if (!added) break;
      }
      // Pins can be far away; the reusable buffer is the contiguous run
      // around the visible range, not every retained interaction.
      let first = visibleRange[0],
        last = visibleRange[1];
      while (nextBuffer.has(first - 1)) first--;
      while (nextBuffer.has(last + 1)) last++;
      buffer = { first, keys: itemKeys.slice(first, last + 1) };
    }
  } else {
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
  }
  const ordered = [...indices].sort((a, b) => a - b);
  const slots = new Map<string, number>();
  // Preserve interacting identities; reuse other cells in physical order so
  // a refill changes row bindings without moving their DOM subtrees.
  for (const index of ordered) {
    const key = itemKeys[index]!;
    const slot = committedSlotsRef.current.get(key);
    if (recycleItem?.(index) && lockedKeys.has(key) && slot !== undefined)
      slots.set(key, slot);
  }
  const usedSlots = new Set(slots.values());
  const availableSlots = committedSlotOrderRef.current.filter(
    (slot) => !usedSlots.has(slot),
  );
  let availableIndex = 0;
  let nextSlot = 0;
  for (const index of ordered) {
    const key = itemKeys[index]!;
    if (!recycleItem?.(index) || slots.has(key)) continue;
    let slot = availableSlots[availableIndex++];
    if (slot === undefined) {
      while (usedSlots.has(nextSlot)) nextSlot++;
      slot = nextSlot++;
    }
    slots.set(key, slot);
    usedSlots.add(slot);
  }
  useLayoutEffect(() => {
    committedSlotsRef.current = slots;
    committedSlotOrderRef.current = ordered.flatMap((index) => {
      const slot = slots.get(itemKeys[index]!);
      return slot === undefined ? [] : [slot];
    });
    committedBufferRef.current = buffer;
  });
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
        key={slots.has(key) ? "slot:" + slots.get(key) : "item:" + key}
        recycled={slots.has(key)}
        index={i}
        itemKey={key}
        isLast={i === itemKeys.length - 1}
        contained={!freeze && scrollRef !== null && !lockedKeys.has(key)}
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
      onPointerDownCapture={(event) => {
        if (!(event.target instanceof Node)) return;
        for (const [key, node] of wrapperByKeyRef.current) {
          if (node.contains(event.target)) {
            heldPointersRef.current.set(event.pointerId, key);
            setPressedKeys(new Set(heldPointersRef.current.values()));
            break;
          }
        }
      }}
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
