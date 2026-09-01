// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SidebarPageSwitcher } from "./sidebar-page-switcher";

const pages = [
  { id: null, label: "All groups", icon: createElement("span", null, "All") },
  { id: "release", label: "Release", icon: createElement("span", null, "R") },
  { id: "roadmap", label: "Roadmap", icon: createElement("span", null, "M") },
];

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("sidebar page switcher", () => {
  it("switches pages in their visual direction when an icon is activated", () => {
    const onPageChange = vi.fn();
    const view = render(
      <SidebarPageSwitcher
        activePageId="release"
        onPageChange={onPageChange}
        pages={pages}
      >
        <div>Release threads</div>
      </SidebarPageSwitcher>,
    );
    const viewport = view.getByTestId("sidebar-page-viewport");
    Object.defineProperty(viewport, "clientWidth", { value: 320 });

    fireEvent.click(view.getByRole("button", { name: "Show Roadmap page" }));

    const panel = view.getByTestId("sidebar-page-panel");
    expect(getComputedStyle(panel).transform).toBe(
      "translate3d(-320px, 0, 0)",
    );
    expect(onPageChange).not.toHaveBeenCalled();

    fireEvent.transitionEnd(panel, { propertyName: "transform" });

    expect(onPageChange).toHaveBeenCalledWith("roadmap");
  });

  it("tracks a horizontal touchpad gesture and settles to the projected page", () => {
    vi.useFakeTimers();
    const onPageChange = vi.fn();
    const view = render(
      <SidebarPageSwitcher
        activePageId="release"
        onPageChange={onPageChange}
        pages={pages}
      >
        <div>Release threads</div>
      </SidebarPageSwitcher>,
    );
    const viewport = view.getByTestId("sidebar-page-viewport");
    const panel = view.getByTestId("sidebar-page-panel");
    Object.defineProperty(viewport, "clientWidth", { value: 320 });

    fireEvent.wheel(viewport, { deltaX: 58, deltaY: 2 });
    fireEvent.wheel(viewport, { deltaX: 58, deltaY: 1 });

    expect(
      Number.parseFloat(getComputedStyle(panel).transform.slice(12)),
    ).toBeLessThan(0);
    expect(onPageChange).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(100));
    expect(getComputedStyle(panel).transform).toBe(
      "translate3d(-320px, 0, 0)",
    );
    fireEvent.transitionEnd(panel, { propertyName: "transform" });

    expect(onPageChange).toHaveBeenCalledWith("roadmap");
  });

  it("moves to the previous page on a gesture in the opposite direction", () => {
    vi.useFakeTimers();
    const onPageChange = vi.fn();
    const view = render(
      <SidebarPageSwitcher
        activePageId="roadmap"
        onPageChange={onPageChange}
        pages={pages}
      >
        <div>Roadmap threads</div>
      </SidebarPageSwitcher>,
    );
    const viewport = view.getByTestId("sidebar-page-viewport");
    const panel = view.getByTestId("sidebar-page-panel");
    Object.defineProperty(viewport, "clientWidth", { value: 320 });

    fireEvent.wheel(viewport, { deltaX: -180, deltaY: 0 });
    act(() => vi.advanceTimersByTime(100));

    expect(getComputedStyle(panel).transform).toBe(
      "translate3d(320px, 0, 0)",
    );
    fireEvent.transitionEnd(panel, { propertyName: "transform" });
    expect(onPageChange).toHaveBeenCalledWith("release");
  });

  it("leaves vertical scrolling alone and returns a short drag to its page", () => {
    vi.useFakeTimers();
    const onPageChange = vi.fn();
    const view = render(
      <SidebarPageSwitcher
        activePageId="release"
        onPageChange={onPageChange}
        pages={pages}
      >
        <div>Release threads</div>
      </SidebarPageSwitcher>,
    );
    const viewport = view.getByTestId("sidebar-page-viewport");
    const panel = view.getByTestId("sidebar-page-panel");
    Object.defineProperty(viewport, "clientWidth", { value: 320 });

    fireEvent.wheel(viewport, { deltaX: 4, deltaY: 40 });
    expect(getComputedStyle(panel).transform).toBe(
      "translate3d(0px, 0, 0)",
    );

    fireEvent.wheel(viewport, { deltaX: 12, deltaY: 1 });
    act(() => vi.advanceTimersByTime(100));
    expect(getComputedStyle(panel).transform).toBe(
      "translate3d(0px, 0, 0)",
    );
    fireEvent.transitionEnd(panel, { propertyName: "transform" });

    expect(onPageChange).not.toHaveBeenCalled();
  });
});
