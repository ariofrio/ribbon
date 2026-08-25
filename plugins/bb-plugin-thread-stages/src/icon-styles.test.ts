// @vitest-environment jsdom
//
// jsdom applies no stylesheet, so nothing here can prove a glyph is painted —
// that is what a capture is for. What these pin is the half a capture reads
// past: that the rules name the attributes the sidebar actually writes, that a
// glyph survives being turned into a URL, and that the sheet leaves the
// document as cleanly as it entered.
import { describe, expect, it } from "vitest";
import {
  ICON_ATTRIBUTE,
  ICON_OPTIONAL_ATTRIBUTE,
  glyphDataUrl,
  iconStyles,
  publishIconStyles,
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
  it("prefers the plugin's icon over the fallback, per box", () => {
    const sheet = iconStyles();

    expect(sheet).toContain(
      "var(--ribbon-icons-project-glyph,var(--thread-stages-icon-fallback))",
    );
    expect(sheet).toContain(
      "background-color:var(--ribbon-icons-project-color,currentColor)",
    );
  });

  it("gives the personal project its own fallback", () => {
    const sheet = iconStyles();
    const project = sheet.match(
      /\[data-thread-stages-icon="project"\]\{--thread-stages-icon-fallback:(.+?)\}/u,
    );
    const personal = sheet.match(
      /\[data-thread-stages-icon="personal"\]\{--thread-stages-icon-fallback:(.+?)\}/u,
    );

    expect(project?.[1]).toBeDefined();
    expect(personal?.[1]).toBeDefined();
    expect(project?.[1]).not.toBe(personal?.[1]);
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
