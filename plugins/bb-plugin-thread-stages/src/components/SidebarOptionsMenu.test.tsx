// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ThreadFilterOptionsMenu } from "./SidebarOptionsMenu";

afterEach(cleanup);

describe("sidebar options menus", () => {
  it("offers only the built-in-style hide action for the filter", () => {
    const onHide = vi.fn();
    render(<ThreadFilterOptionsMenu onHide={onHide} />);

    const trigger = screen.getByRole("button", {
      name: "Sections and projects options",
    });
    for (const className of [
      "m-1",
      "h-5",
      "w-5",
      "after:h-7",
      "after:w-7",
      "after:-translate-x-1/2",
      "after:-translate-y-1/2",
      "transition-colors",
      "hover:bg-state-hover",
      "hover:text-foreground",
    ]) {
      expect(trigger.classList.contains(className), className).toBe(true);
    }
    expect(trigger.classList.contains("size-7")).toBe(false);
    expect(trigger.classList.contains("hover:bg-accent")).toBe(false);

    fireEvent.keyDown(
      trigger,
      { key: "Enter" },
    );
    expect(
      screen
        .getByRole("menuitem", { name: "Hide from sidebar" })
        .querySelector('[data-icon="EyeOff"]'),
    ).not.toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Show count" })).toBeNull();

    fireEvent.click(
      screen.getByRole("menuitem", { name: "Hide from sidebar" }),
    );
    expect(onHide).toHaveBeenCalledTimes(1);
  });

  it("does not restore focus to the filter trigger after a pointer dismissal", async () => {
    render(
      <ThreadFilterOptionsMenu onHide={() => {}} />,
    );

    const trigger = screen.getByRole("button", {
      name: "Sections and projects options",
    });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "Enter" });
    expect(screen.getByRole("menu")).toBeDefined();
    await new Promise((resolve) => setTimeout(resolve, 0));

    fireEvent.pointerDown(document.body, { button: 0, pointerType: "mouse" });

    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    expect(document.activeElement).not.toBe(trigger);

    trigger.focus();
    fireEvent.keyDown(trigger, { key: "Enter" });
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });

    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });
});
