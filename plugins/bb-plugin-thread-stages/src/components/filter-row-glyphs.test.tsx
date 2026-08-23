// @vitest-environment jsdom
//
// The filter rows hide two glyphs bb draws for itself and draw their own in the
// same slots, and they do it with CSS rather than with props:
//
//   HIDE_BUILTIN_INDICATOR_CLASS       = "[&>span:first-child]:hidden"
//   HIDE_BUILTIN_SUBMENU_CHEVRON_CLASS = "[&>svg]:hidden"
//
// jsdom applies no stylesheet, so nothing here can prove the rules take effect —
// that is what a rendered-effect check against a running bb is for. What these
// tests can prove is the half that a re-vendor silently breaks: that the
// elements those selectors name are still the ones bb renders, and still the
// only ones they can reach. If bb moves its indicator out of first position, or
// gives a row a second direct-child svg, the selector keeps compiling and
// quietly stops meaning what it says. That is the failure these pin.
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { CompactViewportOverrideProvider } from "@/vendor/components/ui/hooks/use-compact-viewport";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/vendor/components/ui/dropdown-menu";

afterEach(cleanup);

function openMenu(children: React.ReactNode) {
  render(
    <CompactViewportOverrideProvider isCompactViewport={false}>
      <DropdownMenu open>
        <DropdownMenuTrigger>open</DropdownMenuTrigger>
        <DropdownMenuContent>{children}</DropdownMenuContent>
      </DropdownMenu>
    </CompactViewportOverrideProvider>,
  );
}

describe("the glyph slots the filter rows override", () => {
  it("puts bb's radio indicator first, which is what [&>span:first-child] names", () => {
    openMenu(
      <DropdownMenuRadioGroup value="a">
        <DropdownMenuRadioItem value="a">
          <span data-row-content="">Storefront</span>
        </DropdownMenuRadioItem>
      </DropdownMenuRadioGroup>,
    );
    const row = screen.getByRole("menuitemradio");
    const first = row.firstElementChild;

    expect(first?.tagName).toBe("SPAN");
    // bb's, not the row's own content: hiding first-child must not hide the label.
    expect(first?.hasAttribute("data-row-content")).toBe(false);
    expect(first?.querySelector("[data-icon]")).not.toBeNull();
  });

  it("gives a radio row no other direct-child span to catch by accident", () => {
    openMenu(
      <DropdownMenuRadioGroup value="a">
        <DropdownMenuRadioItem value="a">
          <span data-row-content="">Storefront</span>
        </DropdownMenuRadioItem>
      </DropdownMenuRadioGroup>,
    );
    const row = screen.getByRole("menuitemradio");
    const ownSpans = Array.from(row.children).filter(
      (child) => child.tagName === "SPAN" && child.hasAttribute("data-row-content"),
    );
    // The row's own span exists but is never first, so the selector is precise.
    expect(ownSpans).toHaveLength(1);
    expect(row.firstElementChild).not.toBe(ownSpans[0]);
  });

  it("appends bb's submenu chevron as a direct svg, which is what [&>svg] names", () => {
    openMenu(
      <DropdownMenuSub open>
        <DropdownMenuSubTrigger>
          <span data-row-content="">Storefront</span>
        </DropdownMenuSubTrigger>
      </DropdownMenuSub>,
    );
    const trigger = screen.getByRole("menuitem");
    const directSvgs = Array.from(trigger.children).filter(
      (child) => child.tagName.toLowerCase() === "svg",
    );

    // Exactly one, and it is bb's: a row drawing its own chevron nests it in a
    // span, so [&>svg] can only ever reach this one.
    expect(directSvgs).toHaveLength(1);
    expect(directSvgs[0]?.getAttribute("data-icon")).toBe("ChevronRight");
  });
});
