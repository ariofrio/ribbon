// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SectionPicker } from "./SectionPicker";

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

describe("SectionPicker", () => {
  it("shows the selected section and changes it from the native-style menu", async () => {
    const onSelect = vi.fn();
    render(
      <SectionPicker
        sections={[
          { id: "sec_work", name: "Work" },
          { id: "sec_release", name: "Release" },
        ]}
        selectedSectionId="sec_work"
        isLoading={false}
        onOpen={vi.fn()}
        onSelect={onSelect}
      />,
    );

    const trigger = screen.getByRole("button", { name: "Section" });
    expect(trigger.textContent).toContain("Work");
    fireEvent.pointerDown(trigger, {
      button: 0,
      ctrlKey: false,
      pointerType: "mouse",
    });
    fireEvent.click(await screen.findByRole("menuitem", { name: /Release/u }));

    expect(onSelect).toHaveBeenCalledWith("sec_release");
  });

  it("offers Unorganized as the no-section selection", async () => {
    const onSelect = vi.fn();
    render(
      <SectionPicker
        sections={[{ id: "sec_work", name: "Work" }]}
        selectedSectionId={null}
        isLoading={false}
        onOpen={vi.fn()}
        onSelect={onSelect}
      />,
    );

    const trigger = screen.getByRole("button", { name: "Section" });
    expect(trigger.textContent).toContain("Unorganized");
    fireEvent.pointerDown(trigger, {
      button: 0,
      ctrlKey: false,
      pointerType: "mouse",
    });
    fireEvent.click(
      await screen.findByRole("menuitem", { name: /Unorganized/u }),
    );

    expect(onSelect).toHaveBeenCalledWith(null);
  });
});
