// @vitest-environment jsdom
import { installTestPluginRuntime } from "@get-bb/plugin-sdk/testing/app";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectBreadcrumb } from "./ProjectBreadcrumb";

installTestPluginRuntime();

afterEach(cleanup);

beforeEach(() => {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
});

describe("ProjectBreadcrumb", () => {
  function renderBreadcrumb() {
    const onOpenSettings = vi.fn();
    const onRename = vi.fn().mockResolvedValue(undefined);
    const onRemove = vi.fn().mockResolvedValue(undefined);
    const { container } = render(
      <span data-breadcrumbs-root="">
        <ProjectBreadcrumb
          projectName="bb-plugins"
          onOpenSettings={onOpenSettings}
          onRename={onRename}
          onRemove={onRemove}
        />
      </span>,
    );

    return { container, onOpenSettings, onRename, onRemove };
  }

  async function openProjectMenu() {
    const trigger = screen.getByRole("button", {
      name: "bb-plugins actions",
    });
    fireEvent.pointerDown(trigger, {
      button: 0,
      ctrlKey: false,
      pointerType: "mouse",
    });
    await screen.findByRole("menuitem", { name: "Project settings" });
    return trigger;
  }

  it("opens the project menu from the breadcrumb title", async () => {
    const { container } = renderBreadcrumb();

    const trigger = await openProjectMenu();
    expect(trigger.textContent).toBe("bb-plugins");
    expect(
      container.querySelector('[data-icon="ChevronRight"]'),
    ).not.toBeNull();
    expect(screen.getByRole("menuitem", { name: "Rename" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Remove" })).toBeTruthy();
  });

  it("opens project settings without a native sidebar menu", async () => {
    const { onOpenSettings } = renderBreadcrumb();
    await openProjectMenu();

    fireEvent.click(screen.getByRole("menuitem", { name: "Project settings" }));

    expect(onOpenSettings).toHaveBeenCalledOnce();
  });

  it("renames the project through its own dialog", async () => {
    const { onRename } = renderBreadcrumb();
    await openProjectMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Rename" }));

    const input = await screen.findByRole("textbox", { name: "Project name" });
    fireEvent.change(input, { target: { value: "Renamed project" } });
    fireEvent.click(screen.getByRole("button", { name: "Rename project" }));

    await waitFor(() => {
      expect(onRename).toHaveBeenCalledWith("Renamed project");
    });
  });

  it("confirms removal through its own dialog", async () => {
    const { onRemove } = renderBreadcrumb();
    await openProjectMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Remove" }));

    expect(await screen.findByText("Remove project?")).toBeTruthy();
    expect(
      screen.getByText(
        'Remove "bb-plugins" and all of its threads? This cannot be undone.',
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remove project" }));

    await waitFor(() => {
      expect(onRemove).toHaveBeenCalledOnce();
    });
  });
});
