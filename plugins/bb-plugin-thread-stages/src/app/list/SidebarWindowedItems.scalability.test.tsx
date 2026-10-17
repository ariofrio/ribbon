// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
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
    return new DOMRect(
      0,
      0,
      280,
      Number(node.dataset.testViewportHeight ?? 280),
    );
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
  recycle = false,
  onVisit,
  viewportHeight = 280,
  intrinsic = false,
  rowsAt,
}: {
  selected?: string;
  focus?: string;
  items?: string[];
  subtreeRows?: number;
  recycle?: boolean;
  onVisit?: (key: string) => void;
  viewportHeight?: number;
  intrinsic?: boolean;
  rowsAt?: (index: number) => number;
} = {}) {
  vi.stubGlobal("innerHeight", viewportHeight);
  const viewport = createRef<HTMLDivElement>();
  const tree = (next = items, freeze = false) => (
    <div
      ref={viewport}
      data-sidebar="content"
      data-test-viewport=""
      data-test-viewport-height={viewportHeight}
    >
      <SidebarContentElementContext.Provider value={viewport}>
        <SidebarWindowedItems
          allowIntrinsic={intrinsic}
          freeze={freeze}
          recycleItem={recycle ? () => true : undefined}
          itemKeys={next}
          estimateRows={(index) => rowsAt?.(index) ?? subtreeRows}
          alwaysMountedKeys={selected ? new Set([selected]) : undefined}
          focusItemKey={focus}
          getNavigationEntries={(i) => [
            { threadId: next[i]!, projectId: "project" },
          ]}
          renderItem={(i) => (
            <a
              data-test-row=""
              data-test-height={(rowsAt?.(i) ?? subtreeRows) * 28}
              data-sidebar-thread-id={next[i]}
              href={"#" + next[i]}
              onClick={(event) => {
                event.preventDefault();
                onVisit?.(next[i]!);
              }}
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
      return b.height > 0 && b.top < viewportHeight && b.bottom > 0;
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
  it("reveals a sibling moved into view by another window's refill", async () => {
    const viewport = createRef<HTMLDivElement>();
    const items = keys.slice(0, 100);
    render(
      <div ref={viewport} data-sidebar="content" data-test-viewport="">
        <SidebarContentElementContext.Provider value={viewport}>
          <SidebarWindowedItems
            itemKeys={items}
            estimateRows={() => 1}
            recycleItem={() => true}
            renderItem={(index) => (
              <a data-test-row="" data-test-height={index >= 50 ? 20 : 28}>
                {items[index]}
              </a>
            )}
          />
          <SidebarWindowedItems
            itemKeys={["footer"]}
            estimateRows={() => 1}
            renderItem={() => <a data-test-row="">Footer</a>}
          />
        </SidebarContentElementContext.Provider>
      </div>,
    );
    expect(screen.queryByText("Footer")).toBeNull();
    await act(async () => {
      viewport.current!.scrollTop = 2680;
      viewport.current!.dispatchEvent(new Event("scroll"));
    });
    expect(screen.getByText("Footer")).toBeTruthy();
  });
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
  const h = setup({ subtreeRows: 4 });
  for (let i = 1; i <= 12; i++) h.jump(i * 15000);
  expect(screen.getAllByRole("link").length * 4).toBeLessThanOrEqual(96);
  expect(h.holes()).toHaveLength(0);
});

it("keeps one pixel between rows and no extra gap after a run, including reorders", () => {
  const h = setup({ items: keys.slice(0, 3) });
  const run = () =>
    h.viewport.current!.querySelector<HTMLElement>(
      "[data-sidebar-windowed-count]",
    )!;
  expect(run().getBoundingClientRect().height).toBe(3 * 28 + 2);
  h.rerender([keys[2]!, keys[0]!, keys[1]!]);
  expect(run().getBoundingClientRect().height).toBe(3 * 28 + 2);
  h.rerender(keys);
  h.jump(270000);
  expect(h.holes()).toHaveLength(0);
  h.jump(0);
  expect(h.holes()).toHaveLength(0);
});

it("does not force layout for ordinary leaf rows during cold window changes", () => {
  const reads = vi.fn();
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      if (this.hasAttribute("data-sidebar-windowed-item")) reads();
      return rect(this);
    },
  );
  const h = setup();
  h.jump(120000);
  h.jump(0);
  expect(reads).not.toHaveBeenCalled();
});

it("rechecks a remounted composite before revealing its previously measured expanded height", () => {
  const h = setup({ subtreeRows: 4 });
  const first = screen.getByRole("link", { name: "thread-0" });
  const wrapper = first.closest("[data-sidebar-windowed-item]")!;
  act(() => {
    first.dataset.testHeight = "1000";
    for (const report of resizeCallbacks)
      report([
        {
          target: wrapper,
          borderBoxSize: [{ blockSize: 1001 }],
        } as unknown as ResizeObserverEntry,
      ]);
  });
  for (let i = 1; i <= 12; i++) h.jump(i * 15000);
  expect(screen.queryByRole("link", { name: "thread-0" })).toBeNull();
  h.jump(0);
  expect(h.holes()).toHaveLength(0);
});

describe("recycled thread rows", () => {
  it("reuses a bounded set of links across distant jumps and binds clicks to the new thread", () => {
    const onVisit = vi.fn();
    const h = setup({ recycle: true, onVisit });
    const links = new Set(screen.getAllByRole("link"));
    for (const top of [120000, 240000, 0]) {
      h.jump(top);
      expect(h.holes()).toHaveLength(0);
      const current = screen.getAllByRole("link");
      expect(current.every((link) => links.has(link))).toBe(true);
      const link = current[0]!;
      fireEvent.click(link);
      expect(onVisit).toHaveBeenLastCalledWith(link.textContent);
    }
  });

  it("keeps the same focused and selected links while recycling surrounding rows", () => {
    const h = setup({ recycle: true, selected: "thread-0" });
    const selected = screen.getByRole("link", { name: "thread-0" });
    const focused = screen.getByRole("link", { name: "thread-1" });
    act(() => focused.focus());
    h.jump(120000);
    expect(screen.getByRole("link", { name: "thread-0" })).toBe(selected);
    expect(document.activeElement).toBe(focused);
    expect(focused.textContent).toBe("thread-1");
    expect(h.holes()).toHaveLength(0);
  });

  it("does not retarget the original pointer target before release", async () => {
    const h = setup({ recycle: true });
    const target = screen.getByRole("link", { name: "thread-0" });
    fireEvent.pointerDown(target);
    h.jump(120000);
    expect(target.isConnected).toBe(true);
    expect(target.textContent).toBe("thread-0");
    fireEvent.pointerUp(document);
    await act(async () => {
      await Promise.resolve();
    });
    h.jump(240000);
    expect(screen.queryByRole("link", { name: "thread-0" })).toBeNull();
    expect(h.holes()).toHaveLength(0);
  });

  it.each(["data-sidebar-hover-actions-open", "data-sidebar-row-busy"])(
    "preserves a row with %s until its interaction settles",
    (attribute) => {
      const h = setup({ recycle: true });
      const target = screen.getByRole("link", { name: "thread-0" });
      target.setAttribute(attribute, "true");
      h.jump(120000);
      expect(target.isConnected).toBe(true);
      expect(target.textContent).toBe("thread-0");
      target.removeAttribute(attribute);
      h.jump(240000);
      expect(screen.queryByRole("link", { name: "thread-0" })).toBeNull();
    },
  );

  it("keeps native navigation destinations in logical order after recycling", () => {
    const h = setup({ recycle: true });
    h.jump(120000);
    const ordered = [
      ...h.viewport.current!.querySelectorAll<HTMLElement>(
        "[data-sidebar-windowed-item],[data-sidebar-windowed-nav]",
      ),
    ].flatMap((node) => {
      const entries = node.getAttribute("data-sidebar-windowed-nav");
      return entries
        ? entries.split(" ").map((entry) => entry.split(":")[0])
        : [node.querySelector("a")!.dataset.sidebarThreadId];
    });
    expect(ordered).toEqual(keys);
  });
});

it("keeps row bindings stable while the viewport remains inside the existing buffer", () => {
  const h = setup({ recycle: true });
  const original = screen
    .getAllByRole("link")
    .map((link) => ({ link, title: link.textContent }));
  h.jump(200);
  expect(h.holes()).toHaveLength(0);
  for (const { link, title } of original) expect(link.textContent).toBe(title);
});

it("releases a pressed row even when its control stops pointerup propagation", async () => {
  const h = setup({ recycle: true });
  const target = screen.getByRole("link", { name: "thread-0" });
  target.addEventListener("pointerup", (event) => event.stopPropagation());
  fireEvent.pointerDown(target);
  h.jump(120000);
  fireEvent.pointerUp(target);
  await act(async () => {
    await Promise.resolve();
  });
  h.jump(240000);
  expect(screen.queryByRole("link", { name: "thread-0" })).toBeNull();
});

it("keeps a spare buffer when the viewport is taller than the nominal row budget", () => {
  const h = setup({ recycle: true, viewportHeight: 1400 });
  act(() => {
    const entries = [
      ...h.viewport.current!.querySelectorAll("[data-sidebar-windowed-item]"),
    ].map(
      (target) =>
        ({
          target,
          borderBoxSize: [{ blockSize: height(target) }],
        }) as unknown as ResizeObserverEntry,
    );
    for (const report of resizeCallbacks) report(entries);
  });
  const original = screen
    .getAllByRole("link")
    .map((link) => ({ link, title: link.textContent }));
  h.jump(87);
  expect(h.holes()).toHaveLength(0);
  for (const { link, title } of original) expect(link.textContent).toBe(title);
});
it("does not let a distant retained subtree consume the viewport's reuse buffer", () => {
  const h = setup({
    recycle: true,
    selected: "thread-5000",
    rowsAt: (index) => (index === 5000 ? 4000 : 1),
  });
  const original = screen
    .getAllByRole("link")
    .map((link) => ({ link, title: link.textContent }));
  h.jump(200);
  expect(h.holes()).toHaveLength(0);
  for (const { link, title } of original) expect(link.textContent).toBe(title);
});

it("renders tiny child lists without geometry reads or scroll observers", () => {
  const reads = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect");
  const h = setup({ items: keys.slice(0, 3), recycle: true, intrinsic: true });
  const original = screen.getAllByRole("link");
  h.rerender(keys.slice(100, 103));
  expect(screen.getAllByRole("link")).toEqual(original);
  expect(screen.getAllByRole("link").map(node => node.textContent)).toEqual(keys.slice(100, 103));
  expect(reads).not.toHaveBeenCalled();
  expect(resizeCallbacks).toHaveLength(0);
});

it("still windows a short list whose items represent large subtrees", () => {
  const h = setup({ items: keys.slice(0, 8), subtreeRows: 100, intrinsic: true });
  expect(screen.getAllByRole("link").length).toBeLessThan(8);
  expect(h.holes()).toHaveLength(0);
  expect(resizeCallbacks.length).toBeGreaterThan(0);
});

it("switches between tiny and large lists without leaving visible gaps", () => {
  const h = setup({ items: keys.slice(0, 3), focus: "thread-1", intrinsic: true });
  expect(document.activeElement?.textContent).toBe("thread-1");
  h.rerender(keys);
  expect(h.holes()).toHaveLength(0);
  expect(screen.getAllByRole("link").length).toBeLessThan(100);
  h.rerender(keys.slice(0, 3));
  expect(screen.getAllByRole("link")).toHaveLength(3);
  expect(h.holes()).toHaveLength(0);
});

it("keeps independent small windows observed unless their parent bounds them", () => {
  setup({ items: keys.slice(0, 3) });
  expect(resizeCallbacks.length).toBeGreaterThan(0);
});

it("preserves overlapping bindings on small forward refills and physical order on return", () => {
  const h = setup({ recycle: true });
  const overlapping = screen.getByRole("link", { name: "thread-14" });
  h.jump(430);
  expect(h.holes()).toHaveLength(0);
  expect(screen.getByRole("link", { name: "thread-14" })).toBe(overlapping);
  const physicalOrder = screen.getAllByRole("link");
  h.jump(0);
  expect(h.holes()).toHaveLength(0);
  expect(screen.getAllByRole("link")).toEqual(physicalOrder);
  expect(screen.getAllByRole("link").map(node => node.textContent)).toEqual(keys.slice(0, 24));
});
