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

  it("moves the wave by translation alone, which the compositor runs", () => {
    const css = shineStyles();
    // A custom property or mask position animated per frame restyles and
    // repaints every piece on the main thread.
    expect(css).not.toContain("@property");
    expect(css).not.toMatch(/@keyframes[^{]*\{[^}]*mask-position/);
    // The window and its content slide one wave in opposite directions.
    expect(css).toContain(
      "@keyframes ribbon-shine-window{from{translate:0}to{translate:var(--ribbon-shine-width, 120px) 0}}",
    );
    expect(css).toContain(
      "@keyframes ribbon-shine-content{from{translate:0}to{translate:calc(-1 * var(--ribbon-shine-width, 120px)) 0}}",
    );
    // Only while motion is welcome; reduced motion leaves content untouched.
    expect(css).toMatch(/^@media \(prefers-reduced-motion: no-preference\)\{/m);
    // Like bb's icon shimmer, one wave spans two element widths, and each
    // piece's mask starts where the piece sits in its row.
    expect(css).toContain("mask-size:var(--ribbon-shine-width, 120px) 100%");
    expect(css).toContain("mask-position:calc(-1 * var(--ribbon-shine-offset, 0px)) 0");
  });

  it("lets clicks through to the row's link", () => {
    // A mask makes each window a stacking context above the full-row link.
    expect(shineStyles()).toMatch(
      /\[data-ribbon-shine-row\] \[data-ribbon-shine\]\{[^}]*pointer-events:none/,
    );
  });
});
