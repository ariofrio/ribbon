import { describe, expect, it } from "vitest";
import { shineStyles } from "./row-shine";

describe("row shimmer styles", () => {
  it("animates one registered position that every shining child follows", () => {
    const css = shineStyles();
    expect(css).toContain("@property --ribbon-shine");
    expect(css).toMatch(/@keyframes ribbon-shine\{from\{--ribbon-shine:0\}to\{--ribbon-shine:1\}\}/);
    // Only while motion is welcome; reduced motion leaves content untouched.
    expect(css).toMatch(/^@media \(prefers-reduced-motion: no-preference\)\{/m);
    expect(css).toContain("var(--ribbon-shine-offset");
    // A fixed wave like bb's on "Thinking…", however wide the row.
    expect(css).toContain("mask-size:120px 100%");
    expect(css).not.toContain("--ribbon-shine-width");
  });

  it("lets clicks through to the row's link", () => {
    // A mask makes each piece a stacking context above the full-row link.
    expect(shineStyles()).toMatch(
      /\[data-ribbon-shine-row\] \[data-ribbon-shine\]\{[^}]*pointer-events:none/,
    );
  });
});
