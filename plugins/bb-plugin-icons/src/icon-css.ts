import type { IconSvgElement } from "@hugeicons/react";
import { iconColor } from "./icon-colors";
import { PERSONAL_PROJECT_ID, type IconColor, type IconOwnerKind } from "./store";

/**
 * The box this plugin marks where it stands in for one of bb's own glyphs.
 *
 * The published contract is only the variables below; this attribute is how
 * this plugin consumes them on its own placeholders, the same way any other
 * plugin consumes them on its own rows.
 */
export const GLYPH_ATTRIBUTE = "data-ribbon-icons-glyph";

/**
 * A glyph as a CSS mask.
 *
 * A mask reads shape, not color, so the drawing carries a solid stroke and the
 * consumer's `background-color` supplies the real one — which is what keeps an
 * icon taking the color of the label it sits beside.
 */
export function glyphDataUrl(glyph: IconSvgElement): string {
  const children = glyph
    .map(([tag, attrs]) => `<${tag} ${attributes(attrs)}/>`)
    .join("");
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none'` +
    ` stroke='#000' stroke-width='1.5'>${children}</svg>`;
  // Single quotes inside, percent-encoded outside: the result has to survive
  // both a CSS url() and an HTML attribute without closing either early.
  return `url("data:image/svg+xml,${encodeURIComponent(svg).replace(/'/gu, "%27")}")`;
}

function attributes(attrs: Readonly<Record<string, string | number>>): string {
  return Object.entries(attrs)
    .map(([name, value]) => {
      const key = name.replace(/[A-Z]/gu, (c) => `-${c.toLowerCase()}`);
      // `currentColor` means nothing to a mask: it reads the alpha it is given.
      const drawn = value === "currentColor" ? "#000" : String(value);
      return `${key}='${drawn.replace(/'/gu, "")}'`;
    })
    .join(" ");
}

interface StyledIcon {
  kind: IconOwnerKind;
  id: string;
  color: IconColor | null;
  glyph: IconSvgElement;
}

interface IconsView {
  icons: readonly StyledIcon[];
}

/**
 * The sheet the plugin publishes: one rule per owner someone has picked an
 * icon for, keyed by the attribute a consumer puts on its own box.
 *
 * Nothing here decides precedence. Each kind carries its own variables, so a
 * consumer writes whatever fallback it wants — its own glyph today, another
 * kind's tomorrow — and this sheet never has to know.
 */
export function iconStylesheet(view: IconsView): string {
  return view.icons
    .map((icon) => {
      const color = iconColor(icon.color);
      const declarations = [
        `--ribbon-icons-${icon.kind}-glyph:${glyphDataUrl(icon.glyph)}`,
        ...(color === null ? [] : [`--ribbon-icons-${icon.kind}-color:${color}`]),
      ].join(";");
      return `[data-ribbon-icons-${icon.kind}="${cssEscape(icon.id)}"]{${declarations}}`;
    })
    .join("\n");
}

/** Owner ids come from bb, but a rule is text: never let one end the selector. */
function cssEscape(id: string): string {
  return id.replace(/["\\]/gu, "\\$&");
}

/** The glyphs bb's own surfaces fall back to, as the backend sends them. */
export interface IconDefaults {
  project: IconSvgElement;
  personal: IconSvgElement;
}

/**
 * How this plugin paints the placeholders it puts into bb's chrome.
 *
 * These are ordinary consumer rules — the same `var()` chain any other plugin
 * writes — kept here rather than as classes on the placeholder because those
 * nodes sit outside the scope root bb compiles this plugin's stylesheet into.
 * Drawing them this way is what takes React out of bb's own DOM everywhere the
 * icon only has to be looked at.
 *
 * A placeholder wears whatever classes bb had on the glyph it stands in for,
 * so the size below is only for the surfaces where bb drew nothing to copy;
 * `:where` keeps it out of the way of any class that says otherwise.
 */
export function decorationStylesheet(defaults: IconDefaults): string {
  const project = glyphDataUrl(defaults.project);
  const personal = glyphDataUrl(defaults.personal);
  return [
    `:where([${GLYPH_ATTRIBUTE}]){inline-size:1rem;block-size:1rem}`,
    `[${GLYPH_ATTRIBUTE}]{display:inline-block;flex:none;` +
      "background-color:var(--ribbon-icons-project-color,currentColor);" +
      `-webkit-mask:var(--ribbon-icons-project-glyph,${project}) center/contain no-repeat;` +
      `mask:var(--ribbon-icons-project-glyph,${project}) center/contain no-repeat}`,
    // bb's personal project cannot be given an icon, so its fallback is the
    // whole of what it ever shows.
    `[${GLYPH_ATTRIBUTE}][data-ribbon-icons-project="${PERSONAL_PROJECT_ID}"]{` +
      `-webkit-mask-image:var(--ribbon-icons-project-glyph,${personal});` +
      `mask-image:var(--ribbon-icons-project-glyph,${personal})}`,
  ].join("\n");
}
