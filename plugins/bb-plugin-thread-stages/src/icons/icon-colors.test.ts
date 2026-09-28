import { describe, expect, it } from "vitest";
import { COLORS, SURFACES, evaluateShipped } from "../../scripts/fit-palette.mjs";
import { iconColor, iconColorStyle } from "./icon-colors";
import type { IconColor } from "./store";

describe("project icon colors", () => {
  it("gives every color its own lightness per mode", () => {
    expect(iconColor("teal")).toBe(
      "light-dark(oklch(0.556 0.086 191.6), oklch(0.793 0.136 191.6))",
    );
  });

  it("has no color without a color", () => {
    expect(iconColor(null)).toBeNull();
    expect(iconColorStyle(null)).toBeUndefined();
    expect(iconColorStyle("red")).toEqual({ color: iconColor("red") });
  });

  /**
   * The palette's whole justification is how it measures on bb's themes, so
   * the measurement is a test: a hand-tweaked anchor that looks fine on one
   * theme fails here rather than shipping muddy on another.
   */
  it("stays legible on every built-in theme, in both modes", () => {
    const { minContrast, contrastAt } = evaluateShipped();

    expect(SURFACES).toHaveLength(12);
    expect(`${contrastAt} ${minContrast.toFixed(2)}`).toBe("nord/light orange 3.54");
    expect(minContrast).toBeGreaterThanOrEqual(3.5);
  });

  it("keeps any two colors far enough apart to tell at 16px", () => {
    const { minDelta, deltaAt } = evaluateShipped();

    expect(deltaAt).toBe("default/light orange/yellow");
    // ~0.02 is the just-noticeable difference; small glyphs need well past it.
    expect(minDelta).toBeGreaterThan(0.1);
  });

  it("covers every color the picker offers", () => {
    for (const color of COLORS as IconColor[]) {
      expect(iconColor(color)).toMatch(/^light-dark\(oklch\(/u);
    }
  });
});
