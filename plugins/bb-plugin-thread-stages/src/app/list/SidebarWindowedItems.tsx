import {
  memo,
  useCallback,
  useLayoutEffect,
  useRef,
  type ReactNode,
} from "react";
import { useSidebarContentElementRef } from "../ui/sidebar.js";
import type { SidebarWindowedNavigationEntry } from "./sidebarThreadShortcuts.js";

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

// Keep rows and their drag registrations mounted while the browser isolates
// their layout and paint. Scrolling must not wait for React to fill placeholders.
const SidebarWindowedItem = memo(function SidebarWindowedItem({
  itemKey,
  index,
  contained,
  registerWrapper,
  renderItem,
}: {
  itemKey: string;
  index: number;
  contained: boolean;
  registerWrapper: (key: string, node: HTMLDivElement | null) => void;
  renderItem: SidebarWindowedItemsProps["renderItem"];
}) {
  const wrapperRef = useCallback(
    (node: HTMLDivElement | null) => registerWrapper(itemKey, node),
    [itemKey, registerWrapper],
  );
  return (
    <div
      ref={wrapperRef}
      data-sidebar-windowed-item=""
      style={
        contained
          ? {
              contain: "layout style paint",
              overflowClipMargin: "4px",
            }
          : undefined
      }
    >
      {renderItem(index)}
    </div>
  );
});

export function SidebarWindowedItems({
  itemKeys,
  focusItemKey,
  alwaysMountedKeys,
  renderItem,
}: SidebarWindowedItemsProps) {
  const scrollElementRef = useSidebarContentElementRef();
  const wrapperByKeyRef = useRef(new Map<string, HTMLDivElement>());
  const registerWrapper = useCallback(
    (key: string, node: HTMLDivElement | null) => {
      if (node) wrapperByKeyRef.current.set(key, node);
      else wrapperByKeyRef.current.delete(key);
    },
    [],
  );

  useLayoutEffect(() => {
    if (!focusItemKey) return;
    const wrapper = wrapperByKeyRef.current.get(focusItemKey);
    const target = wrapper?.querySelector<HTMLElement>(
      "a[data-sidebar-thread-id], button[aria-expanded]",
    );
    target?.focus();
  }, [focusItemKey]);

  // Overflow portals opt out through the sidebar context. Their complete
  // contents must determine their size, as must selected/renamed/folding rows.
  return itemKeys.map((key, index) => (
    <SidebarWindowedItem
      key={key}
      itemKey={key}
      index={index}
      contained={
        scrollElementRef !== null &&
        key !== focusItemKey &&
        !alwaysMountedKeys?.has(key)
      }
      registerWrapper={registerWrapper}
      renderItem={renderItem}
    />
  ));
}
