// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FilterEntityRemoveDialog,
  FilterEntityRenameDialog,
} from "./FilterEntityDialogs";

afterEach(cleanup);

describe("filter entity dialogs", () => {
  it("renames a project from its current name", async () => {
    const onRename = vi.fn(async () => {});
    render(
      <FilterEntityRenameDialog
        target={{ kind: "project", id: "proj_alpha", name: "Alpha" }}
        onOpenChange={() => {}}
        onRename={onRename}
      />,
    );

    expect(screen.getByRole("heading", { name: "Rename project" })).toBeDefined();
    const input = screen.getByRole("textbox", { name: "Project name" });
    expect((input as HTMLInputElement).value).toBe("Alpha");
    fireEvent.change(input, { target: { value: "Alpha two" } });
    fireEvent.click(screen.getByRole("button", { name: "Rename project" }));

    await vi.waitFor(() =>
      expect(onRename).toHaveBeenCalledWith({
        kind: "project",
        id: "proj_alpha",
        name: "Alpha",
      }, "Alpha two"),
    );
  });

  it("uses BB's exact section and project removal consequences", () => {
    const onRemove = vi.fn(async () => {});
    const { rerender } = render(
      <FilterEntityRemoveDialog
        target={{ kind: "project", id: "proj_alpha", name: "Alpha" }}
        onOpenChange={() => {}}
        onRemove={onRemove}
      />,
    );

    expect(screen.getByText('Remove "Alpha" and all of its threads? This cannot be undone.')).toBeDefined();
    expect(screen.getByRole("button", { name: "Remove project" })).toBeDefined();

    rerender(
      <FilterEntityRemoveDialog
        target={{ kind: "section", id: "section_1", name: "Waiting" }}
        onOpenChange={() => {}}
        onRemove={onRemove}
      />,
    );
    expect(screen.getByText("Threads in this section will move back to Unorganized.")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Remove section" }));
  });
});
