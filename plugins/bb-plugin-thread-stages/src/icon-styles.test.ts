// @vitest-environment jsdom
//
// jsdom applies no stylesheet, so nothing here can prove a glyph is painted —
// that is what a capture is for. These pin what a capture reads past: that the
// rules name the attributes the sidebar actually writes.
import { describe, expect, it } from "vitest";
import {
  ICON_ATTRIBUTE,
  ICON_OPTIONAL_ATTRIBUTE,
  glyphDataUrl,
  iconStyles,
  publishIconStyles,
  type IconFallback,
} from "./icon-styles";

describe("glyphDataUrl", () => {
  it("draws at the viewBox every glyph in the catalog is drawn at", () => {
    const url = decodeURIComponent(glyphDataUrl([["path", { d: "M1" }]]));

    expect(url).toContain("viewBox='0 0 24 24'");
    expect(url).toContain("<path d='M1'");
  });

  it("bakes a solid stroke, because a mask reads alpha and not color", () => {
    const url = decodeURIComponent(
      glyphDataUrl([["path", { d: "M1", stroke: "currentColor" }]]),
    );

    expect(url).not.toContain("currentColor");
    expect(url).toContain("stroke='#000'");
  });

  it("writes SVG attribute names, not React ones", () => {
    const url = decodeURIComponent(
      glyphDataUrl([["path", { d: "M1", strokeLinecap: "round" }]]),
    );

    expect(url).toContain("stroke-linecap='round'");
  });

  it("leaves nothing in the payload that could close the url()", () => {
    const payload = glyphDataUrl([["path", { d: "M1" }]]).slice(
      'url("'.length,
      -'")'.length,
    );

    expect(payload).not.toContain('"');
    expect(payload).not.toContain(")");
  });
});

describe("iconStyles", () => {
  const ruleFor = (fallback: IconFallback) => {
    const match = new RegExp(
      `\\[data-thread-stages-icon="${fallback}"\\]\\{(.+?)\\}`,
      "u",
    ).exec(iconStyles());
    return match?.[1];
  };

  it("prefers what somebody picked, and falls back to this filter's own glyph", () => {
    expect(ruleFor("project")).toContain(
      "mask:var(--ribbon-icons-project-glyph,url(",
    );
    expect(ruleFor("project")).toContain(
      "background-color:var(--ribbon-icons-project-color,currentColor)",
    );
  });

  it("reads a section's own properties, never a project's", () => {
    // Each kind carries its own pair, so nothing here chains across kinds.
    expect(ruleFor("section")).toContain("var(--ribbon-icons-section-glyph,");
    expect(ruleFor("section")).not.toContain("--ribbon-icons-project");
  });

  it("gives the personal project and a section their own fallbacks", () => {
    const drawings = new Set(
      (["project", "personal", "section"] as const).map(ruleFor),
    );

    expect(drawings.size).toBe(3);
    expect([...drawings].every((rule) => rule?.includes("url("))).toBe(true);
  });

  it("collapses only the boxes that exist for the plugin's sake", () => {
    // A row icon is the project's icon and nothing else, so without the
    // plugin the row wants its old layout back. The filter keeps its own.
    expect(iconStyles()).toContain(
      `:root:not([data-ribbon-icons-ready]) [${ICON_OPTIONAL_ATTRIBUTE}]{display:none}`,
    );
    expect(iconStyles()).not.toContain(
      `:root:not([data-ribbon-icons-ready]) [${ICON_ATTRIBUTE}]{`,
    );
  });
});

describe("publishIconStyles", () => {
  it("puts one sheet in, and takes it back out", () => {
    const stop = publishIconStyles(document);
    const style = document.head.querySelector("style[data-thread-stages-icons]");

    expect(style?.textContent).toContain(ICON_ATTRIBUTE);

    stop();
    expect(
      document.head.querySelector("style[data-thread-stages-icons]"),
    ).toBeNull();
  });
});
