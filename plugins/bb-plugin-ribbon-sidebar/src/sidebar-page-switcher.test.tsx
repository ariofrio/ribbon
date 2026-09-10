// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SidebarPageSwitcher } from "./sidebar-page-switcher";

const pages = [
  { id: null, label: "All groups", icon: createElement("span", null, "All") },
  { id: "release", label: "Release", icon: createElement("span", null, "R") },
  { id: "roadmap", label: "Roadmap", icon: createElement("span", null, "M") },
  { id: "later", label: "Later", icon: createElement("span", null, "L") },
];

const renderPage = (page: (typeof pages)[number]) => (
  <div>{page.label} threads</div>
);

const scrollTo = vi.fn(function (
  this: HTMLElement,
  options: ScrollToOptions,
) {
  this.scrollLeft = Number(options.left);
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get: () => 320,
  });
  Object.defineProperty(HTMLElement.prototype, "scrollWidth", {
    configurable: true,
    get: () => 1_280,
  });
  Object.defineProperty(HTMLElement.prototype, "scrollTo", {
    configurable: true,
    value: scrollTo,
  });
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => ({ matches: false })),
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("sidebar page switcher", () => {
  it("mounts immediate neighbors before a horizontal wheel can move", () => {
    const view = render(
      <SidebarPageSwitcher
        activePageId="release"
        onPageChange={vi.fn()}
        pages={pages}
        renderPage={renderPage}
      />,
    );

    expect(view.getByText("Release threads")).toBeTruthy();
    expect(view.queryByText("All groups threads")).toBeNull();
    expect(view.queryByText("Roadmap threads")).toBeNull();
    expect(view.queryByText("Later threads")).toBeNull();

    fireEvent.wheel(view.getByTestId("sidebar-page-viewport"), {
      deltaX: 80,
      deltaY: 0,
    });

    expect(view.getByText("All groups threads")).toBeTruthy();
    expect(view.getByText("Roadmap threads")).toBeTruthy();
    expect(view.queryByText("Later threads")).toBeNull();
  });

  it("uses the native scroller for icon navigation and commits on scroll end", () => {
    const onPageChange = vi.fn();
    const view = render(
      <SidebarPageSwitcher
        activePageId="release"
        onPageChange={onPageChange}
        pages={pages}
        renderPage={renderPage}
      />,
    );
    const viewport = view.getByTestId("sidebar-page-viewport");

    fireEvent.click(view.getByRole("button", { name: "Show Roadmap page" }));

    expect(scrollTo).toHaveBeenLastCalledWith({
      behavior: "smooth",
      left: 640,
    });
    expect(onPageChange).not.toHaveBeenCalled();

    fireEvent(viewport, new Event("scrollend"));

    expect(onPageChange).toHaveBeenCalledWith("roadmap");
  });

  it("clamps one wheel gesture to the adjacent page", () => {
    const onPageChange = vi.fn();
    const view = render(
      <SidebarPageSwitcher
        activePageId={null}
        onPageChange={onPageChange}
        pages={pages}
        renderPage={renderPage}
      />,
    );
    const viewport = view.getByTestId("sidebar-page-viewport");

    fireEvent.wheel(viewport, { deltaX: 900, deltaY: 0 });
    viewport.scrollLeft = 960;
    fireEvent.scroll(viewport);

    expect(viewport.scrollLeft).toBe(320);

    act(() => vi.advanceTimersByTime(1_000));

    expect(onPageChange).toHaveBeenCalledWith("release");
  });

  it("returns a short wheel gesture to its closest page", () => {
    const onPageChange = vi.fn();
    const view = render(
      <SidebarPageSwitcher
        activePageId="release"
        onPageChange={onPageChange}
        pages={pages}
        renderPage={renderPage}
      />,
    );
    const viewport = view.getByTestId("sidebar-page-viewport");

    fireEvent.wheel(viewport, { deltaX: 80, deltaY: 0 });
    viewport.scrollLeft = 400;
    fireEvent.scroll(viewport);
    act(() => vi.advanceTimersByTime(1_000));

    expect(scrollTo).toHaveBeenLastCalledWith({
      behavior: "smooth",
      left: 320,
    });
    fireEvent(viewport, new Event("scrollend"));
    expect(onPageChange).not.toHaveBeenCalled();
  });

  it("resists an outward edge gesture and returns to rest", () => {
    const view = render(
      <SidebarPageSwitcher
        activePageId={null}
        onPageChange={vi.fn()}
        pages={pages}
        renderPage={renderPage}
      />,
    );
    const viewport = view.getByTestId("sidebar-page-viewport");
    const container = view.getByTestId("sidebar-page-container");

    expect(
      fireEvent.wheel(viewport, { deltaX: -80, deltaY: 0 }),
    ).toBe(false);
    act(() => vi.advanceTimersByTime(20));

    expect(container.style.transform).toMatch(
      /^translate3d\((?:2\d|3\d)\.\d+px, 0px, 0px\)$/u,
    );

    act(() => vi.advanceTimersByTime(1_000));

    expect(container.style.transform).toBe("");
  });

  it("jumps to an externally selected page", () => {
    const view = render(
      <SidebarPageSwitcher
        activePageId="release"
        onPageChange={vi.fn()}
        pages={pages}
        renderPage={renderPage}
      />,
    );
    const viewport = view.getByTestId("sidebar-page-viewport");
    expect(viewport.scrollLeft).toBe(320);

    view.rerender(
      <SidebarPageSwitcher
        activePageId="roadmap"
        onPageChange={vi.fn()}
        pages={pages}
        renderPage={renderPage}
      />,
    );

    expect(viewport.scrollLeft).toBe(640);
  });

  it("uses instant native navigation when reduced motion is requested", () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => ({ matches: true })),
    });
    const view = render(
      <SidebarPageSwitcher
        activePageId="release"
        onPageChange={vi.fn()}
        pages={pages}
        renderPage={renderPage}
      />,
    );

    fireEvent.click(view.getByRole("button", { name: "Show Roadmap page" }));

    expect(scrollTo).toHaveBeenLastCalledWith({
      behavior: "auto",
      left: 640,
    });
  });
});
