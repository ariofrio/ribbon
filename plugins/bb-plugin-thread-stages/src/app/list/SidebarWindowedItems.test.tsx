// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SidebarContentElementContext } from "../ui/sidebar.js";
import { SidebarWindowedItems } from "./SidebarWindowedItems.js";

function sidebar(children: ReactNode) {
  return (
    <SidebarContentElementContext.Provider
      value={{ current: document.createElement("div") }}
    >
      {children}
    </SidebarContentElementContext.Provider>
  );
}

function wrapper(index: number) {
  return document.querySelectorAll<HTMLElement>("[data-sidebar-windowed-item]")[
    index
  ]!;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("SidebarWindowedItems", () => {
  it("keeps offscreen rows mounted without scroll observers or geometry reads", () => {
    const observe = vi.fn();
    vi.stubGlobal("IntersectionObserver", observe);
    const measure = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect");
    render(
      sidebar(
        <SidebarWindowedItems
          itemKeys={Array.from({ length: 600 }, (_, i) => `${i}`)}
          estimateRows={() => 1}
          renderItem={(i) => (
            <a href="#thread" data-sidebar-thread-id={`${i}`}>
              Thread {i}
            </a>
          )}
        />,
      ),
    );
    expect(screen.getAllByRole("link")).toHaveLength(600);
    expect(observe).not.toHaveBeenCalled();
    expect(measure).not.toHaveBeenCalled();
  });

  it("uses browser rendering containment for rows and whole subtrees", () => {
    render(
      sidebar(
        <SidebarWindowedItems
          itemKeys={["row", "subtree"]}
          estimateRows={(i) => (i === 0 ? 1 : 4)}
          renderItem={(i) => <span>Item {i}</span>}
        />,
      ),
    );
    expect(getComputedStyle(wrapper(0)).contain).toBe("layout style paint");
    expect(getComputedStyle(wrapper(1)).contain).toBe("layout style paint");
    expect(getComputedStyle(wrapper(0)).contentVisibility).not.toBe("auto");
  });

  it("leaves selected, renamed, folding and focused items uncontained", () => {
    render(
      sidebar(
        <SidebarWindowedItems
          itemKeys={["selected", "focused", "other"]}
          alwaysMountedKeys={new Set(["selected"])}
          focusItemKey="focused"
          estimateRows={() => 1}
          renderItem={(i) => (
            <a href="#thread" data-sidebar-thread-id={`${i}`}>
              Thread {i}
            </a>
          )}
        />,
      ),
    );
    expect(getComputedStyle(wrapper(0)).contain).not.toBe("layout style paint");
    expect(getComputedStyle(wrapper(1)).contain).not.toBe("layout style paint");
    expect(getComputedStyle(wrapper(2)).contain).toBe("layout style paint");
    expect(document.activeElement).toBe(
      screen.getByRole("link", { name: "Thread 1" }),
    );
  });

  it("does not remount or rerender rows when the scroll container emits scroll events", () => {
    const mount = vi.fn();
    const unmount = vi.fn();
    function Row({ index }: { index: number }) {
      useEffect(() => {
        mount(index);
        return () => unmount(index);
      }, [index]);
      return <span>Item {index}</span>;
    }
    const renderItem = vi.fn((i) => <Row index={i} />);
    const scroller = document.createElement("div");
    render(
      <SidebarContentElementContext.Provider value={{ current: scroller }}>
        <SidebarWindowedItems
          itemKeys={["a", "b"]}
          estimateRows={() => 1}
          renderItem={renderItem}
        />
      </SidebarContentElementContext.Provider>,
    );
    const nodes = [wrapper(0).firstChild, wrapper(1).firstChild];
    renderItem.mockClear();
    mount.mockClear();
    act(() => {
      for (let i = 0; i < 10; i++) scroller.dispatchEvent(new Event("scroll"));
    });
    expect(renderItem).not.toHaveBeenCalled();
    expect(mount).not.toHaveBeenCalled();
    expect(unmount).not.toHaveBeenCalled();
    expect([wrapper(0).firstChild, wrapper(1).firstChild]).toEqual(nodes);
  });

  it("focuses an offscreen item on request without refocusing on updates", () => {
    const tree = (focusItemKey?: string) =>
      sidebar(
        <SidebarWindowedItems
          itemKeys={["a", "b"]}
          focusItemKey={focusItemKey}
          estimateRows={() => 1}
          renderItem={(i) => (
            <a href="#thread" data-sidebar-thread-id={`${i}`}>
              Thread {i}
            </a>
          )}
        />,
      );
    const { rerender } = render(tree());
    rerender(tree("b"));
    const target = screen.getByRole("link", { name: "Thread 1" });
    expect(document.activeElement).toBe(target);
    target.blur();
    rerender(tree("b"));
    expect(document.activeElement).not.toBe(target);
  });

  it("focuses a collapsed group disclosure when it has no thread link", () => {
    render(
      sidebar(
        <SidebarWindowedItems
          itemKeys={["group"]}
          focusItemKey="group"
          estimateRows={() => 1}
          renderItem={() => <button aria-expanded={false}>Worktree</button>}
        />,
      ),
    );
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Worktree" }),
    );
  });

  it("leaves overflow portals uncontained so their contents determine menu size", () => {
    render(
      sidebar(
        createPortal(
          <SidebarContentElementContext.Provider value={null}>
            <SidebarWindowedItems
              itemKeys={["a", "b"]}
              estimateRows={() => 1}
              renderItem={(i) => <span>Overflow {i}</span>}
            />
          </SidebarContentElementContext.Provider>,
          document.body,
        ),
      ),
    );
    expect(screen.getByText("Overflow 1")).toBeTruthy();
    expect(getComputedStyle(wrapper(0)).contain).not.toBe("layout style paint");
  });

  it("renders without containment when no sidebar provider exists", () => {
    render(
      <SidebarWindowedItems
        itemKeys={["a"]}
        estimateRows={() => 1}
        renderItem={() => <span>Row</span>}
      />,
    );
    expect(screen.getByText("Row")).toBeTruthy();
    expect(getComputedStyle(wrapper(0)).contain).not.toBe("layout style paint");
  });

  it("keeps rows with unchanged keys mounted when items are removed and reordered", () => {
    const mount = vi.fn();
    const unmount = vi.fn();
    function Row({ id }: { id: string }) {
      useEffect(() => {
        mount(id);
        return () => unmount(id);
      }, [id]);
      return <span>{id}</span>;
    }
    const tree = (keys: string[]) =>
      sidebar(
        <SidebarWindowedItems
          itemKeys={keys}
          estimateRows={() => 1}
          renderItem={(i) => <Row id={keys[i]!} />}
        />,
      );
    const { rerender } = render(tree(["a", "b", "c"]));
    const c = screen.getByText("c");
    mount.mockClear();
    rerender(tree(["c", "a", "d"]));
    expect(screen.getByText("c")).toBe(c);
    expect(mount.mock.calls).toEqual([["d"]]);
    expect(unmount.mock.calls).toEqual([["b"]]);
  });
});
