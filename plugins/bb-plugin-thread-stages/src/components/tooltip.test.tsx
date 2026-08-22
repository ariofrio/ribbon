// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/vendor/components/ui/tooltip";

afterEach(cleanup);

describe("Tooltip", () => {
  it("portals standard BB tooltip chrome into the plugin style scope", async () => {
    render(
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>Explain</TooltipTrigger>
          <TooltipContent className="max-w-none">Helpful text</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );

    fireEvent.focus(screen.getByRole("button", { name: "Explain" }));

    const accessibleTooltip = await screen.findByRole("tooltip");
    const content = document.querySelector<HTMLElement>(
      "[data-bb-portaled-overlay][data-state]",
    );
    expect(accessibleTooltip.textContent).toBe("Helpful text");
    expect(content).not.toBeNull();
    if (content === null) return;
    expect(content.getAttribute("data-bb-portaled-overlay")).toBe("");
    expect(content.getAttribute("data-bb-plugin-root")).toBe("");
    expect(content.className).toContain("bg-primary");
    expect(content.className).toContain("max-w-none");
    expect(content.className).not.toContain(
      "max-w-[min(20rem,var(--radix-tooltip-content-available-width))]",
    );
  });
});
