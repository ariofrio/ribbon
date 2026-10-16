// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SidebarContentElementContext } from "../ui/sidebar.js";
import { SidebarWindowedItems } from "./SidebarWindowedItems.js";

// jsdom has no layout engine. Model ordinary block flow, including the real
// spacers, so a bad range or a bad height exposes a hole in this viewport.
function height(node: Element): number {
  const el = node as HTMLElement;
  if (el.hasAttribute("data-test-row"))
    return Number(el.dataset.testHeight ?? 28);
  if (el.style.height) return parseFloat(el.style.height);
  return (
    [...el.children].reduce((n, c) => n + height(c), 0) +
    (parseFloat(el.style.paddingBottom) || 0)
  );
}
function rect(node: HTMLElement): DOMRect {
  if (node.hasAttribute("data-test-viewport"))
    return new DOMRect(0, 0, 280, 280);
  let top = 0;
  let current: Element | null = node;
  while (current && !current.hasAttribute("data-test-viewport")) {
    for (
      let prev = current.previousElementSibling;
      prev;
      prev = prev.previousElementSibling
    )
      top += height(prev);
    current = current.parentElement;
  }
  if (current) top -= (current as HTMLElement).scrollTop;
  return new DOMRect(0, top, 280, height(node));
}
const keys = Array.from({ length: 9600 }, (_, i) => `thread-${i}`);
const resizeCallbacks: ((entries: ResizeObserverEntry[]) => void)[] = [];
beforeEach(() => {
  resizeCallbacks.length = 0;
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      return rect(this);
    },
  );
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: ResizeObserverCallback) {
        resizeCallbacks.push((entries) =>
          callback(entries, this as unknown as ResizeObserver),
        );
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function setup({
  selected,
  focus,
  items = keys,
  subtreeRows = 1,
}: { selected?: string; focus?: string; items?: string[]; subtreeRows?: number } = {}) {
  const viewport = createRef<HTMLDivElement>();
  const tree = (next = items, freeze = false) => (
    <div ref={viewport} data-sidebar="content" data-test-viewport="">
      <SidebarContentElementContext.Provider value={viewport}>
        <SidebarWindowedItems
          freeze={freeze}
          itemKeys={next}
          estimateRows={() => subtreeRows}
          alwaysMountedKeys={selected ? new Set([selected]) : undefined}
          focusItemKey={focus}
          getNavigationEntries={(i) => [
            { threadId: next[i]!, projectId: "project" },
          ]}
          renderItem={(i) => (
            <a
              data-test-row=""
              data-test-height={subtreeRows * 28}
              data-sidebar-thread-id={next[i]}
              href={"#" + next[i]}
            >
              {next[i]}
            </a>
          )}
        />
      </SidebarContentElementContext.Provider>
    </div>
  );
  const view = render(tree());
  const jump = (top: number) =>
    act(() => {
      viewport.current!.scrollTop = top;
      viewport.current!.dispatchEvent(new Event("scroll"));
    });
  const holes = () =>
    [
      ...viewport.current!.querySelectorAll<HTMLElement>(
        "[data-sidebar-windowed-chunk-empty]",
      ),
    ].filter((n) => {
      const b = n.getBoundingClientRect();
      return b.height > 0 && b.top < 280 && b.bottom > 0;
    });
  return {
    freeze: () => view.rerender(tree(items, true)),
    viewport,
    jump,
    holes,
    rerender: (next: string[]) => view.rerender(tree(next)),
  };
}
describe("SidebarWindowedItems scalability", () => {
  it("bounds mounted row behavior while traversing both ends of a long list", () => {
    const h = setup();
    expect(screen.getAllByRole("link").length).toBeLessThanOrEqual(96);
    expect(h.holes()).toHaveLength(0);
    for (const top of [120000, 240000, 270000, 120000, 0]) {
      h.jump(top);
      expect(h.holes()).toHaveLength(0);
      expect(screen.getAllByRole("link").length).toBeLessThanOrEqual(96);
    }
    expect(screen.getByRole("link", { name: "thread-0" })).toBeTruthy();
  });
  it("keeps a selected or keyboard-focused row alive outside the viewport", () => {
    const h = setup({ selected: "thread-9500", focus: "thread-9400" });
    expect(document.activeElement).toBe(
      screen.getByRole("link", { name: "thread-9400" }),
    );
    h.jump(100000);
    expect(screen.getByRole("link", { name: "thread-9500" })).toBeTruthy();
    expect(document.activeElement).toBe(
      screen.getByRole("link", { name: "thread-9400" }),
    );
    expect(screen.getAllByRole("link").length).toBeLessThanOrEqual(96);
  });
  it("preserves navigation order for every offscreen thread without mounting it", () => {
    const h = setup();
    const ordered = [
      ...h.viewport.current!.querySelectorAll<HTMLElement>(
        "[data-sidebar-windowed-item],[data-sidebar-windowed-nav]",
      ),
    ].flatMap((n) => {
      const nav = n.getAttribute("data-sidebar-windowed-nav");
      return nav
        ? nav.split(" ").map((v) => v.split(":")[0])
        : [n.querySelector("a")!.dataset.sidebarThreadId];
    });
    expect(ordered).toEqual(keys);
  });
  it("drops removed cache entries and retains the correct thread after reordering", () => {
    const h = setup();
    h.jump(150000);
    h.jump(0);
    h.rerender(["new-thread", ...keys.slice(1).reverse()]);
    expect(screen.queryByRole("link", { name: "thread-0" })).toBeNull();
    expect(
      screen.getByRole("link", { name: "new-thread" }).getAttribute("href"),
    ).toBe("#new-thread");
    expect(h.holes()).toHaveLength(0);
    expect(screen.getAllByRole("link").length).toBeLessThanOrEqual(96);
  });
});

it("keeps a tab-focused row mounted while scrolling away", () => {
  const h = setup();
  const anchor = screen.getByRole("link", { name: "thread-0" });
  act(() => anchor.focus());
  for (let i = 1; i <= 12; i++) h.jump(i * 15000);
  expect(anchor.isConnected).toBe(true);
  expect(document.activeElement).toBe(anchor);
});
it("freezes the existing window during folding instead of mounting the whole group", () => {
  const h = setup();
  const first = screen.getByRole("link", { name: "thread-0" });
  const count = screen.getAllByRole("link").length;
  h.freeze();
  expect(screen.getAllByRole("link")).toHaveLength(count);
  expect(screen.getByRole("link", { name: "thread-0" })).toBe(first);
  expect(
    getComputedStyle(first.closest("[data-sidebar-windowed-item]")!).contain,
  ).not.toBe("layout style paint");
});
it("updates heights when a mounted subtree grows before the next traverse", () => {
  const h = setup();
  const anchor = screen.getByRole("link", { name: "thread-0" }),
    wrapper = anchor.closest("[data-sidebar-windowed-item]")!;
  act(() => {
    anchor.dataset.testHeight = "140";
    for (const report of resizeCallbacks)
      report([
        {
          target: wrapper,
          borderBoxSize: [{ blockSize: 141 }],
        } as unknown as ResizeObserverEntry,
      ]);
  });
  h.jump(100000);
  expect(h.holes()).toHaveLength(0);
  h.jump(0);
  expect(h.holes()).toHaveLength(0);
  expect(screen.getByRole("link", { name: "thread-0" })).toBeTruthy();
});

it("counts retained parent subtrees against the cache budget", () => {
  const h=setup({subtreeRows:4});
  for(let i=1;i<=12;i++)h.jump(i*15000);
  expect(screen.getAllByRole('link').length*4).toBeLessThanOrEqual(96);
  expect(h.holes()).toHaveLength(0);
});
