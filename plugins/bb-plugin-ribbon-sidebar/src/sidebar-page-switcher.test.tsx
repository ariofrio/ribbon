// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SidebarPageSwitcher } from "./sidebar-page-switcher";

const pages = [
  { id: null, label: "All groups", icon: createElement("span", null, "All") },
  { id: "release", label: "Release", icon: createElement("span", null, "R") },
  { id: "roadmap", label: "Roadmap", icon: createElement("span", null, "M") },
];

const renderPage = (page: (typeof pages)[number]) => (
  <div>{page.label} threads</div>
);

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("sidebar page switcher", () => {
  it("renders the active and adjacent pages in one native snap track", () => {
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
    const viewport = view.getByTestId("sidebar-page-viewport");

    fireEvent.wheel(viewport, { deltaX: 80, deltaY: 0 });

    expect(view.getByText("All groups threads")).toBeTruthy();
    expect(view.getByText("Roadmap threads")).toBeTruthy();
    expect(viewport.style.scrollSnapType).toBe("x mandatory");
    expect(
      view.getByText("Roadmap threads").closest("section")?.getAttribute("inert"),
    ).not.toBeNull();
  });

  it("scrolls to a page when its icon is activated", () => {
    const view = render(
      <SidebarPageSwitcher
        activePageId="release"
        onPageChange={vi.fn()}
        pages={pages}
        renderPage={renderPage}
      />,
    );
    const viewport = view.getByTestId("sidebar-page-viewport");
    Object.defineProperty(viewport, "clientWidth", { value: 320 });
    const scrollTo = vi.fn();
    viewport.scrollTo = scrollTo;

    fireEvent.click(view.getByRole("button", { name: "Show Roadmap page" }));

    expect(scrollTo).toHaveBeenCalledWith({ behavior: "smooth", left: 640 });
  });

  it("commits the nearest page after native scrolling settles", () => {
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
    Object.defineProperty(viewport, "clientWidth", { value: 320 });
    viewport.scrollLeft = 500;

    fireEvent(viewport, new Event("scrollend"));

    expect(onPageChange).toHaveBeenCalledWith("roadmap");
  });

  it("limits one horizontal wheel gesture to the adjacent page", () => {
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
    Object.defineProperty(viewport, "clientWidth", { value: 320 });
    Object.defineProperty(viewport, "scrollWidth", { value: 960 });

    fireEvent.wheel(viewport, { deltaX: 1_200, deltaY: 0 });
    viewport.scrollLeft = 640;
    fireEvent.scroll(viewport);

    expect(viewport.scrollLeft).toBe(320);

    fireEvent(viewport, new Event("scrollend"));

    expect(onPageChange).toHaveBeenCalledWith("release");
  });

  it.each([
    { activePageId: null, deltaX: -180, direction: 1, scrollLeft: 0 },
    {
      activePageId: "roadmap",
      deltaX: 180,
      direction: -1,
      scrollLeft: 640,
    },
  ])(
    "rubber bands an outward wheel gesture at either $activePageId edge",
    ({ activePageId, deltaX, direction, scrollLeft }) => {
      vi.useFakeTimers();
      const view = render(
        <SidebarPageSwitcher
          activePageId={activePageId}
          onPageChange={vi.fn()}
          pages={pages}
          renderPage={renderPage}
        />,
      );
      const viewport = view.getByTestId("sidebar-page-viewport");
      Object.defineProperty(viewport, "clientWidth", { value: 320 });
      Object.defineProperty(viewport, "scrollWidth", { value: 960 });
      viewport.scrollLeft = scrollLeft;
      const wheel = new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        deltaX,
        deltaY: 0,
      });

      fireEvent(viewport, wheel);

      expect(wheel.defaultPrevented).toBe(true);
      const resistedDistance = Number.parseFloat(
        viewport.style.transform.match(/translate3d\(([^p]+)px/u)?.[1] ?? "0",
      );
      expect(Math.sign(resistedDistance)).toBe(direction);
      expect(Math.abs(resistedDistance)).toBeLessThan(Math.abs(deltaX));

      vi.runAllTimers();

      expect(viewport.style.transform).toBe("translate3d(0px, 0, 0)");
    },
  );

  it("keeps the active page when native snapping returns to it", () => {
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
    Object.defineProperty(viewport, "clientWidth", { value: 320 });
    viewport.scrollLeft = 370;

    fireEvent(viewport, new Event("scrollend"));

    expect(onPageChange).not.toHaveBeenCalled();
  });
});
