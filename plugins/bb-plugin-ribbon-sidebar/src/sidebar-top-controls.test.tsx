// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SidebarTopControls } from "./sidebar-top-controls";

afterEach(cleanup);

describe("SidebarTopControls", () => {
  it("places Ribbon controls immediately above New thread in their sidebar", async () => {
    render(
      <aside data-sidebar="sidebar">
        <div data-testid="app-sidebar-primary-actions">
          <button type="button">New thread</button>
        </div>
        <div data-sidebar="content">
          <SidebarTopControls>
            <button type="button">Atlas</button>
          </SidebarTopControls>
        </div>
      </aside>,
    );

    const atlas = await screen.findByRole("button", { name: "Atlas" });
    const primaryActions = screen
      .getByRole("button", { name: "New thread" })
      .parentElement!;
    await waitFor(() =>
      expect(primaryActions.firstElementChild?.contains(atlas)).toBe(true),
    );
    expect(primaryActions.firstElementChild?.getAttribute("data-bb-plugin")).toBe(
      "ribbon-sidebar",
    );
    expect(primaryActions.lastElementChild?.textContent).toBe("New thread");
  });
});
