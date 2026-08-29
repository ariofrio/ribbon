import { describe, expect, it } from "vitest";
import { decorationStylesheet, glyphDataUrl, iconStylesheet } from "./icon-css";

const circle = [
  ["path", { d: "M12 3a9 9 0 100 18", stroke: "currentColor" }],
] as const;
const square = [["rect", { x: 4, y: 4, width: 16, height: 16 }]] as const;

describe("glyphDataUrl", () => {
  it("draws the glyph at the viewBox every Hugeicon shares", () => {
    const url = decodeURIComponent(glyphDataUrl(circle));

    expect(url).toContain("viewBox='0 0 24 24'");
    expect(url).toContain("<path d='M12 3a9 9 0 100 18'");
  });

  it("bakes a solid stroke, because a mask reads shape and not color", () => {
    const url = decodeURIComponent(glyphDataUrl(circle));

    expect(url).not.toContain("currentColor");
    expect(url).toContain("stroke='%23000'".replace("%23", "#"));
  });

  it("keeps numeric attributes and camelCase names CSS-safe", () => {
    const url = decodeURIComponent(glyphDataUrl([["rect", { strokeWidth: 1.5 }]]));

    expect(url).toContain("stroke-width='1.5'");
  });

  it("escapes what would end the CSS url() early", () => {
    const url = glyphDataUrl(square);
    const payload = url.slice('url("'.length, -'")'.length);

    expect(url.startsWith('url("data:image/svg+xml,')).toBe(true);
    expect(payload).not.toContain('"');
    expect(payload).not.toContain(")");
  });
});

describe("iconStylesheet", () => {
  const state = {
    icons: [
      { kind: "project" as const, id: "proj_a", icon: "rocket", color: "teal" as const, glyph: circle },
      { kind: "section" as const, id: "sec_x", icon: "list", color: null, glyph: square },
    ],
    defaults: { project: square, personal: circle, section: square },
    personalProjectId: null,
    projects: [],
    projectsRead: true,
  };

  it("gives each owner kind its own variables, so nothing chains across kinds", () => {
    const css = iconStylesheet(state);

    expect(css).toContain('[data-ribbon-icons-project="proj_a"]');
    expect(css).toContain("--ribbon-icons-project-glyph:");
    expect(css).toContain('[data-ribbon-icons-section="sec_x"]');
    expect(css).toContain("--ribbon-icons-section-glyph:");
  });

  it("sets a color only where someone picked one", () => {
    const css = iconStylesheet(state);
    const project = css.slice(css.indexOf('[data-ribbon-icons-project="proj_a"]'));
    const section = css.slice(css.indexOf('[data-ribbon-icons-section="sec_x"]'));

    expect(project).toContain("--ribbon-icons-project-color:");
    expect(section.slice(0, section.indexOf("}"))).not.toContain("color:");
  });

  it("says nothing about an owner nobody has picked for", () => {
    expect(iconStylesheet({ ...state, icons: [] })).toBe("");
  });
});

describe("decorationStylesheet", () => {
  const sheet = decorationStylesheet({ project: square, personal: circle });

  it("prefers what was picked, and falls back to bb's own glyph", () => {
    expect(sheet).toContain(
      `mask:var(--ribbon-icons-project-glyph,${glyphDataUrl(square)}) center/contain no-repeat`,
    );
    expect(sheet).toContain(
      "background-color:var(--ribbon-icons-project-color,currentColor)",
    );
  });

  it("gives the personal project the glyph bb gives it", () => {
    expect(sheet).toContain(
      `[data-ribbon-icons-glyph][data-ribbon-icons-project="proj_personal"]`,
    );
    expect(sheet).toContain(
      `mask-image:var(--ribbon-icons-project-glyph,${glyphDataUrl(circle)})`,
    );
  });

  it("sizes at no specificity, so bb's own class still decides", () => {
    expect(sheet).toContain(
      ":where([data-ribbon-icons-glyph]){inline-size:1rem;block-size:1rem}",
    );
  });
});
