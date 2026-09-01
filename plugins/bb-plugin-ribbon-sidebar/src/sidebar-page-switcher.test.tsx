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

afterEach(cleanup);

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
