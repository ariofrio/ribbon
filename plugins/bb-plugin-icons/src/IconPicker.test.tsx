// @vitest-environment jsdom
import { CircleIcon } from "@hugeicons/core-free-icons";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IconPicker } from "./IconPicker";
import { iconColor } from "./icon-colors";

const catalog = [
  {
    name: "sparkles",
    category: "ai",
    tags: [],
    glyph: CircleIcon,
  },
  {
    name: "circle",
    category: "shapes",
    tags: [],
    glyph: CircleIcon,
  },
  {
    name: "rocket",
    category: "space",
    tags: ["launch"],
    glyph: CircleIcon,
  },
];

function mockMatchMedia(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

afterEach(() => {
  cleanup();
  document.head.querySelector("[data-cursor-test-styles]")?.remove();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  mockMatchMedia(false);
  const styles = document.createElement("style");
  styles.dataset.cursorTestStyles = "";
  styles.textContent = `
    .cursor-pointer { cursor: pointer; }
    .gap-1 { column-gap: 4px; row-gap: 4px; }
    .grid-cols-11 { grid-template-columns: repeat(11, minmax(0, 1fr)); }
    .pr-1 { padding-right: 4px; }
    .size-7 { width: 28px; height: 28px; }
  `;
  document.head.append(styles);
});

describe("IconPicker", () => {
  it("offers Remove for a stored icon even when it is the owner's default", () => {
    // Reachable before this glyph left the catalog: the row exists, outranks
    // the section's icon everywhere, and inferring "nothing chosen" from the
    // glyph left the only way back disabled and invisible.
    render(
      <IconPicker
        catalog={catalog}
        loading={false}
        open
        onOpenChange={vi.fn()}
        ownerName="Example project"
        stored
        icon="folder-01"
        defaultIcon="folder-01"
        color={null}
        onPick={vi.fn()}
        onPickColor={vi.fn()}
        onReset={vi.fn()}
        trigger={<button type="button">Icon</button>}
      />,
    );

    const remove = screen.getByRole("button", {
      name: "Remove custom icon",
    }) as HTMLButtonElement;
    expect(remove.disabled).toBe(false);
    expect(getComputedStyle(remove).visibility).not.toBe("hidden");
  });

  it("offers no Remove for an owner that has never been given an icon", () => {
    render(
      <IconPicker
        catalog={catalog}
        loading={false}
        open
        onOpenChange={vi.fn()}
        ownerName="Example project"
        stored={false}
        icon="folder-01"
        defaultIcon="folder-01"
        color={null}
        onPick={vi.fn()}
        onPickColor={vi.fn()}
        onReset={vi.fn()}
        trigger={<button type="button">Icon</button>}
      />,
    );

    expect(
      (screen.getByRole("button", { name: "Remove custom icon" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("offers theme color first without duplicating the selected header icon", () => {
    render(
      <IconPicker
        catalog={catalog}
        loading={false}
        open
        onOpenChange={vi.fn()}
        ownerName="Example project"
        stored
        icon="circle"
        defaultIcon="folder"
        color="red"
        onPick={vi.fn()}
        onPickColor={vi.fn()}
        onReset={vi.fn()}
        trigger={<button type="button">Change icon</button>}
      />,
    );

    const swatches = within(screen.getByRole("group", { name: "Color" }))
      .getAllByRole("button");
    expect(swatches[0]).toBe(screen.getByRole("button", { name: "Theme color" }));
    expect(swatches[1]).toBe(screen.getByRole("button", { name: "Red" }));
    expect(screen.getByRole("button", { name: "circle" }).style.color).toBe(
      iconColor("red"),
    );
    expect(screen.queryByLabelText("Selected icon: circle")).toBeNull();
  });

  it("removes the icon and color customization together", () => {
    const onPickColor = vi.fn();
    const onReset = vi.fn();
    render(
      <IconPicker
        catalog={catalog}
        loading={false}
        open
        onOpenChange={vi.fn()}
        ownerName="Example project"
        stored
        icon="folder"
        defaultIcon="folder"
        color="red"
        onPick={vi.fn()}
        onPickColor={onPickColor}
        onReset={onReset}
        trigger={<button type="button">Change icon</button>}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Remove custom icon" }));
    expect(onReset).toHaveBeenCalledOnce();
    expect(onPickColor).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Theme color" }));
    expect(onPickColor).toHaveBeenCalledWith(null);
  });

  it("keeps search results grouped and filters the category pills", () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
    render(
      <IconPicker
        catalog={catalog}
        loading={false}
        open
        onOpenChange={vi.fn()}
        ownerName="Example project"
        stored
        icon="circle"
        defaultIcon="folder"
        color={null}
        onPick={vi.fn()}
        onPickColor={vi.fn()}
        onReset={vi.fn()}
        trigger={<button type="button">Change icon</button>}
      />,
    );

    const categories = screen.getByRole("navigation", {
      name: "Icon categories",
    });
    screen.getByRole("heading", { name: "AI" });
    screen.getByRole("heading", { name: "Shapes" });
    screen.getByRole("heading", { name: "Space" });

    fireEvent.click(within(categories).getByRole("button", { name: "Space" }));
    expect(scrollIntoView).toHaveBeenCalled();

    fireEvent.change(screen.getByRole("searchbox", { name: "Search icons" }), {
      target: { value: "circ" },
    });
    const filteredCategories = screen.getByRole("navigation", {
      name: "Icon categories",
    });
    expect(
      within(filteredCategories).queryByRole("button", { name: "AI" }),
    ).toBeNull();
    const shapesCategory = within(filteredCategories).getByRole("button", {
      name: "Shapes",
    });
    expect(shapesCategory.getAttribute("aria-current")).toBe("true");
    expect(
      within(filteredCategories).queryByRole("button", { name: "Space" }),
    ).toBeNull();
    const searchResults = screen.getByRole("region", {
      name: "Icon search results",
    });
    expect(
      within(searchResults).queryByRole("heading", { name: "AI" }),
    ).toBeNull();
    within(searchResults).getByRole("heading", { name: "Shapes" });
    expect(
      within(searchResults).queryByRole("heading", { name: "Space" }),
    ).toBeNull();
    within(searchResults).getByRole("button", { name: "circle" });
    expect(screen.queryByText(/Showing \d+ of \d+/)).toBeNull();
  });

  it("clears search with a plugin-rendered control", () => {
    render(
      <IconPicker
        catalog={catalog}
        loading={false}
        open
        onOpenChange={vi.fn()}
        ownerName="Example project"
        stored
        icon="circle"
        defaultIcon="folder"
        color={null}
        onPick={vi.fn()}
        onPickColor={vi.fn()}
        onReset={vi.fn()}
        trigger={<button type="button">Change icon</button>}
      />,
    );

    const search = screen.getByRole("searchbox", { name: "Search icons" });
    fireEvent.change(search, { target: { value: "launch" } });
    expect(screen.queryByRole("button", { name: "circle" })).toBeNull();

    const clearSearch = screen.getByRole("button", { name: "Clear search" });
    expect(fireEvent.mouseDown(clearSearch)).toBe(false);
    fireEvent.click(clearSearch);

    expect(search).toHaveProperty("value", "");
    screen.getByRole("button", { name: "circle" });
    expect(
      screen.queryByRole("button", { name: "Clear search" }),
    ).toBeNull();
  });

  it("uses the hand cursor for every popover button", () => {
    render(
      <IconPicker
        catalog={catalog}
        loading={false}
        open
        onOpenChange={vi.fn()}
        ownerName="Example project"
        stored
        icon="circle"
        defaultIcon="folder"
        color="red"
        onPick={vi.fn()}
        onPickColor={vi.fn()}
        onReset={vi.fn()}
        trigger={<button type="button">Change icon</button>}
      />,
    );

    fireEvent.change(screen.getByRole("searchbox", { name: "Search icons" }), {
      target: { value: "circ" },
    });
    const popover = screen.getByRole("dialog", {
      name: "Icon for Example project",
    });

    const enabledButtons = within(popover)
      .getAllByRole("button")
      .filter((button) => !button.hasAttribute("disabled"));
    for (const button of enabledButtons) {
      const label =
        button.getAttribute("aria-label") ?? button.textContent ?? "button";
      expect(getComputedStyle(button).cursor, label).toBe("pointer");
    }

    const iconButton = within(popover).getByRole("button", { name: "circle" });
    const iconButtonStyle = getComputedStyle(iconButton);
    expect(iconButtonStyle.width).toBe("28px");
    expect(iconButtonStyle.height).toBe("28px");
  });

  it("fills the popover with uniformly spaced icon buttons", () => {
    render(
      <IconPicker
        catalog={catalog}
        loading={false}
        open
        onOpenChange={vi.fn()}
        ownerName="Example project"
        stored
        icon="circle"
        defaultIcon="folder"
        color={null}
        onPick={vi.fn()}
        onPickColor={vi.fn()}
        onReset={vi.fn()}
        trigger={<button type="button">Change icon</button>}
      />,
    );

    const popover = screen.getByRole("dialog", {
      name: "Icon for Example project",
    });
    const iconButton = within(popover).getByRole("button", { name: "circle" });
    const iconGrid = iconButton.parentElement;
    expect(iconGrid).not.toBeNull();

    const popoverStyle = getComputedStyle(popover);
    const gridStyle = getComputedStyle(iconGrid!);
    const contentColumn = popover.firstElementChild;
    const catalogRegion = within(popover).getByRole("region", {
      name: "Icon catalog",
    });
    expect(contentColumn).not.toBeNull();
    expect(popoverStyle.width).toBe("386px");
    expect(getComputedStyle(contentColumn!).paddingRight).toBe("4px");
    expect(Number.parseFloat(getComputedStyle(catalogRegion).paddingRight)).toBe(
      0,
    );
    expect(gridStyle.gridTemplateColumns).toBe(
      "repeat(11, minmax(0, 1fr))",
    );
    expect(gridStyle.columnGap).toBe("4px");
    expect(gridStyle.rowGap).toBe("4px");
  });

  it("windows compact rows using the columns that actually fit", async () => {
    mockMatchMedia(true);
    const resizeObservers: Array<{
      callback: ResizeObserverCallback;
      targets: Element[];
    }> = [];
    vi.stubGlobal(
      "ResizeObserver",
      class {
        private readonly observer: (typeof resizeObservers)[number];

        constructor(callback: ResizeObserverCallback) {
          this.observer = { callback, targets: [] };
          resizeObservers.push(this.observer);
        }

        observe(target: Element) {
          this.observer.targets.push(target);
        }
        unobserve() {}
        disconnect() {}
      },
    );
    const compactCatalog = Array.from({ length: 200 }, (_, index) => ({
      name: `compact-${index}`,
      category: "shapes",
      tags: [],
      glyph: CircleIcon,
    }));
    const onPick = vi.fn();
    render(
      <IconPicker
        catalog={compactCatalog}
        loading={false}
        open
        onOpenChange={vi.fn()}
        ownerName="Example project"
        stored
        icon="circle"
        defaultIcon="folder"
        color={null}
        onPick={onPick}
        onPickColor={vi.fn()}
        onReset={vi.fn()}
        trigger={<button type="button">Change icon</button>}
      />,
    );

    const catalogRegion = await screen.findByRole("region", {
      name: "Icon catalog",
    });
    const catalogContent = catalogRegion.firstElementChild as HTMLElement;
    const shapesSection = screen.getByRole("region", { name: "Shapes" });
    const grid = shapesSection.querySelector<HTMLElement>("h3 + div");
    expect(grid).not.toBeNull();
    Object.defineProperties(catalogRegion, {
      clientHeight: { configurable: true, value: 64 },
      scrollTop: { configurable: true, value: 0, writable: true },
    });
    Object.defineProperty(catalogContent, "clientWidth", {
      configurable: true,
      value: 124,
    });
    Object.defineProperty(grid!, "offsetTop", {
      configurable: true,
      value: 0,
    });

    act(() => {
      const catalogObserver = resizeObservers.find(({ targets }) =>
        targets.includes(catalogRegion),
      );
      if (catalogObserver === undefined) {
        throw new Error("Catalog was not observed");
      }
      catalogObserver.callback(
        [{ target: catalogRegion } as unknown as ResizeObserverEntry],
        {} as ResizeObserver,
      );
    });

    const drawnButtons = within(shapesSection).getAllByRole("button");
    expect(drawnButtons).toHaveLength(28);
    expect(getComputedStyle(grid!).height).toBe("1596px");
    fireEvent.click(drawnButtons[0]!);
    expect(onPick).toHaveBeenCalledWith("compact-0");

    Object.defineProperty(catalogContent, "clientWidth", {
      configurable: true,
      value: 188,
    });
    act(() => {
      const catalogObserver = resizeObservers.find(({ targets }) =>
        targets.includes(catalogRegion),
      );
      if (catalogObserver === undefined) {
        throw new Error("Catalog was not observed");
      }
      catalogObserver.callback(
        [{ target: catalogRegion } as unknown as ResizeObserverEntry],
        {} as ResizeObserver,
      );
    });

    expect(within(shapesSection).getAllByRole("button")).toHaveLength(42);
    expect(getComputedStyle(grid!).height).toBe("1084px");
  });

  it("selects the category currently at the top of the scrolling catalog", () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
    render(
      <IconPicker
        catalog={catalog}
        loading={false}
        open
        onOpenChange={vi.fn()}
        ownerName="Example project"
        stored
        icon="circle"
        defaultIcon="folder"
        color={null}
        onPick={vi.fn()}
        onPickColor={vi.fn()}
        onReset={vi.fn()}
        trigger={<button type="button">Change icon</button>}
      />,
    );
    scrollIntoView.mockClear();

    const catalogRegion = screen.getByRole("region", {
      name: "Icon catalog",
    });
    const shapesSection = screen.getByRole("region", { name: "Shapes" });
    const spaceSection = screen.getByRole("region", { name: "Space" });
    Object.defineProperty(catalogRegion, "scrollTop", {
      configurable: true,
      value: 200,
    });
    Object.defineProperty(shapesSection, "offsetTop", {
      configurable: true,
      value: 200,
    });
    Object.defineProperty(spaceSection, "offsetTop", {
      configurable: true,
      value: 300,
    });
    vi.spyOn(catalogRegion, "getBoundingClientRect").mockReturnValue({
      ...catalogRegion.getBoundingClientRect(),
      top: 100,
    });
    vi.spyOn(shapesSection, "getBoundingClientRect").mockReturnValue({
      ...shapesSection.getBoundingClientRect(),
      top: 80,
    });
    vi.spyOn(spaceSection, "getBoundingClientRect").mockReturnValue({
      ...spaceSection.getBoundingClientRect(),
      top: 105,
    });

    fireEvent.scroll(catalogRegion);

    expect(
      screen
        .getByRole("button", { name: "Space" })
        .getAttribute("aria-current"),
    ).toBe("true");
    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "nearest",
      inline: "nearest",
    });
  });

  it("shows scroll-edge fades only where more icons are hidden", () => {
    const resizeObservers: Array<{
      callback: ResizeObserverCallback;
      targets: Element[];
    }> = [];
    vi.stubGlobal(
      "ResizeObserver",
      class {
        private readonly observer: (typeof resizeObservers)[number];

        constructor(callback: ResizeObserverCallback) {
          this.observer = { callback, targets: [] };
          resizeObservers.push(this.observer);
        }

        observe(target: Element) {
          this.observer.targets.push(target);
        }
        unobserve() {}
        disconnect() {}
      },
    );
    render(
      <IconPicker
        catalog={catalog}
        loading={false}
        open
        onOpenChange={vi.fn()}
        ownerName="Example project"
        stored
        icon="circle"
        defaultIcon="folder"
        color={null}
        onPick={vi.fn()}
        onPickColor={vi.fn()}
        onReset={vi.fn()}
        trigger={<button type="button">Change icon</button>}
      />,
    );

    const catalogRegion = screen.getByRole("region", {
      name: "Icon catalog",
    });
    Object.defineProperties(catalogRegion, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 300 },
      scrollTop: { configurable: true, value: 0, writable: true },
    });
    const topFade = document.querySelector<HTMLElement>(
      '[data-scroll-fade="top"]',
    );
    const bottomFade = document.querySelector<HTMLElement>(
      '[data-scroll-fade="bottom"]',
    );
    expect(topFade).not.toBeNull();
    expect(bottomFade).not.toBeNull();

    act(() => {
      const catalogObserver = resizeObservers.find(({ targets }) =>
        targets.includes(catalogRegion),
      );
      if (catalogObserver === undefined) {
        throw new Error("Catalog was not observed");
      }
      catalogObserver.callback([], {} as ResizeObserver);
    });
    expect(getComputedStyle(topFade!).opacity).toBe("0");
    expect(getComputedStyle(bottomFade!).opacity).toBe("1");

    catalogRegion.scrollTop = 100;
    fireEvent.scroll(catalogRegion);
    expect(getComputedStyle(topFade!).opacity).toBe("1");
    expect(getComputedStyle(bottomFade!).opacity).toBe("1");

    catalogRegion.scrollTop = 200;
    fireEvent.scroll(catalogRegion);
    expect(getComputedStyle(topFade!).opacity).toBe("1");
    expect(getComputedStyle(bottomFade!).opacity).toBe("0");
  });

  it("opens as a non-modal editor", () => {
    render(
      <IconPicker
        catalog={[]}
        loading={false}
        open
        onOpenChange={vi.fn()}
        ownerName="Example project"
        stored
        icon="Folder"
        defaultIcon="Folder"
        color={null}
        onPick={vi.fn()}
        onPickColor={vi.fn()}
        onReset={vi.fn()}
        trigger={<button type="button">Change icon</button>}
      />,
    );

    screen.getByRole("dialog", { name: "Icon for Example project" });
    expect(getComputedStyle(document.body).pointerEvents).not.toBe("none");
  });

  it("announces one title in the compact drawer", () => {
    mockMatchMedia(true);
    render(
      <IconPicker
        catalog={[]}
        loading={false}
        open
        onOpenChange={vi.fn()}
        ownerName="Example project"
        stored
        icon="Folder"
        defaultIcon="Folder"
        color={null}
        onPick={vi.fn()}
        onPickColor={vi.fn()}
        onReset={vi.fn()}
        trigger={<button type="button">Change icon</button>}
      />,
    );

    expect(
      screen.getAllByRole("heading", { name: "Icon for Example project" }),
    ).toHaveLength(1);
  });
});
