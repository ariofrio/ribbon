import { describe, expect, it } from "vitest";
import { activeAnimationDelay, shineStyles } from "./row-shine";

describe("row shimmer styles", () => {
  it("joins the shared one-second phase when a row becomes active", () => {
    expect(activeAnimationDelay(0)).toBe("0ms");
    expect(activeAnimationDelay(1250)).toBe("-250ms");
    expect(activeAnimationDelay(2250)).toBe("-250ms");
    expect(activeAnimationDelay(999.5)).toBe("-999.5ms");
    const css = shineStyles();
    expect(css).toContain("animation-delay:var(--ribbon-active-animation-delay)");
    expect(css).toMatch(/\[data-ribbon-active-row\] \[class\*="animate-spin"\]\{animation-delay:var\(--ribbon-active-animation-delay\)\}/);
  });

  it("animates one registered position that every shining child follows", () => {
    const css = shineStyles();
    expect(css).toContain("@property --ribbon-shine");
    expect(css).toMatch(/@keyframes ribbon-shine\{from\{--ribbon-shine:0\}to\{--ribbon-shine:1\}\}/);
    // Only while motion is welcome; reduced motion leaves content untouched.
    expect(css).toMatch(/^@media \(prefers-reduced-motion: no-preference\)\{/m);
    expect(css).toContain("var(--ribbon-shine-offset");
    // Like bb's icon shimmer, one wave spans two element widths.
    expect(css).toContain("mask-size:var(--ribbon-shine-width, 120px) 100%");
    expect(css).toContain("var(--ribbon-shine) * var(--ribbon-shine-width, 120px)");
  });

  it("lets clicks through to the row's link", () => {
    // A mask makes each piece a stacking context above the full-row link.
    expect(shineStyles()).toMatch(
      /\[data-ribbon-shine-row\] \[data-ribbon-shine\]\{[^}]*pointer-events:none/,
    );
  });
});
