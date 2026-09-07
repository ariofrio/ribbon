// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SidebarPageSwitcher } from "./sidebar-page-switcher";

const embla = vi.hoisted(() => {
  const handlers = new Map<string, () => void>();
  const selectedScrollSnap = vi.fn(() => 1);
  const scrollTo = vi.fn();
  const api = {
    off: vi.fn(),
    on: vi.fn((event: string, handler: () => void) => {
      handlers.set(event, handler);
    }),
    scrollTo,
    selectedScrollSnap,
  };
  return {
    api,
    handlers,
    selectedScrollSnap,
    scrollTo,
    useEmblaCarousel: vi.fn(() => [vi.fn(), api]),
    wheelGesturesPlugin: vi.fn(() => ({ name: "wheelGestures" })),
  };
});

vi.mock("embla-carousel-react", () => ({
  default: embla.useEmblaCarousel,
}));

vi.mock("embla-carousel-wheel-gestures", () => ({
  WheelGesturesPlugin: embla.wheelGesturesPlugin,
}));

const pages = [
  { id: null, label: "All groups", icon: createElement("span", null, "All") },
  { id: "release", label: "Release", icon: createElement("span", null, "R") },
  { id: "roadmap", label: "Roadmap", icon: createElement("span", null, "M") },
];

const renderPage = (page: (typeof pages)[number]) => (
  <div>{page.label} threads</div>
);

beforeEach(() => {
  embla.handlers.clear();
  vi.clearAllMocks();
  embla.selectedScrollSnap.mockReturnValue(1);
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => ({ matches: false })),
  });
});

afterEach(cleanup);

describe("sidebar page switcher", () => {
  it("configures one-snap Embla wheel gestures", () => {
    render(
      <SidebarPageSwitcher
        activePageId="release"
        onPageChange={vi.fn()}
        pages={pages}
        renderPage={renderPage}
      />,
    );

    expect(embla.wheelGesturesPlugin).toHaveBeenCalledWith({
      forceWheelAxis: "x",
    });
    expect(embla.useEmblaCarousel).toHaveBeenCalledWith(
      expect.objectContaining({
        dragFree: false,
        loop: false,
        skipSnaps: false,
        slidesToScroll: 1,
      }),
      [expect.objectContaining({ name: "wheelGestures" })],
    );
  });

  it("renders neighboring pages before a horizontal wheel gesture moves", () => {
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

    fireEvent.wheel(view.getByTestId("sidebar-page-viewport"), {
      deltaX: 80,
      deltaY: 0,
    });

    expect(view.getByText("All groups threads")).toBeTruthy();
    expect(view.getByText("Roadmap threads")).toBeTruthy();
    expect(
      view.getByText("Roadmap threads").closest("section")?.getAttribute("inert"),
    ).not.toBeNull();
  });

  it("uses Embla to animate icon navigation", () => {
    const view = render(
      <SidebarPageSwitcher
        activePageId="release"
        onPageChange={vi.fn()}
        pages={pages}
        renderPage={renderPage}
      />,
    );

    fireEvent.click(view.getByRole("button", { name: "Show Roadmap page" }));

    expect(embla.scrollTo).toHaveBeenCalledWith(2, false);
    expect(view.getByText("Roadmap threads")).toBeTruthy();
  });

  it("commits Embla's selected page only after settling", () => {
    const onPageChange = vi.fn();
    render(
      <SidebarPageSwitcher
        activePageId="release"
        onPageChange={onPageChange}
        pages={pages}
        renderPage={renderPage}
      />,
    );
    embla.selectedScrollSnap.mockReturnValue(2);

    act(() => embla.handlers.get("settle")?.());

    expect(onPageChange).toHaveBeenCalledWith("roadmap");
  });

  it("removes neighboring page content when a gesture settles in place", () => {
    const view = render(
      <SidebarPageSwitcher
        activePageId="release"
        onPageChange={vi.fn()}
        pages={pages}
        renderPage={renderPage}
      />,
    );
    fireEvent.wheel(view.getByTestId("sidebar-page-viewport"), {
      deltaX: 80,
      deltaY: 0,
    });
    expect(view.getByText("Roadmap threads")).toBeTruthy();

    act(() => embla.handlers.get("settle")?.());

    expect(view.queryByText("Roadmap threads")).toBeNull();
  });

  it("jumps Embla to an externally selected page", () => {
    const view = render(
      <SidebarPageSwitcher
        activePageId="release"
        onPageChange={vi.fn()}
        pages={pages}
        renderPage={renderPage}
      />,
    );
    embla.scrollTo.mockClear();

    view.rerender(
      <SidebarPageSwitcher
        activePageId="roadmap"
        onPageChange={vi.fn()}
        pages={pages}
        renderPage={renderPage}
      />,
    );

    expect(embla.scrollTo).toHaveBeenCalledWith(2, true);
  });

  it("jumps immediately for reduced-motion icon navigation", () => {
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

    expect(embla.scrollTo).toHaveBeenCalledWith(2, true);
  });
});
