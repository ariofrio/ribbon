// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SidebarTopControls, SidebarNavigation } from "./sidebar-top-controls";

afterEach(cleanup);

describe("SidebarTopControls", () => {
  it("places Ribbon controls immediately above New thread in their sidebar", async () => {
    render(
      <aside>
        <SidebarNavigation
          items={[]}
          activeItemId={null}
          isCompactViewport={false}
          experimental_activate={() => {}}
          experimental_Original={() => (
            <button type="button">New thread</button>
          )}
        />
        <div>
          <SidebarTopControls>
            <button type="button">Atlas</button>
          </SidebarTopControls>
        </div>
      </aside>,
    );

    const atlas = await screen.findByRole("button", { name: "Atlas" });
    const primaryActions = screen.getByRole("button", {
      name: "New thread",
    }).parentElement!;
    await waitFor(() =>
      expect(primaryActions.firstElementChild?.contains(atlas)).toBe(true),
    );
    expect(
      getComputedStyle(atlas.parentElement as HTMLElement).marginBottom,
    ).toBe("16px");
    expect(primaryActions.lastElementChild?.textContent).toBe("New thread");
  });
});
