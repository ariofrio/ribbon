import {
  BubbleChatIcon,
  Folder01Icon,
  ListViewIcon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";

/**
 * The icons this sidebar draws, taken from the Icons plugin through CSS rather
 * than fetched: a box names its owner and the glyph arrives through the
 * cascade. That plugin's README documents the names.
 *
 * Plain CSS rather than classes on the spans, because the rule that collapses a
 * row's icon has to name `:root`, which is outside the scope root bb compiles
 * a plugin's own stylesheet into.
 */
const READY_ATTRIBUTE = "data-ribbon-icons-ready";

/** Marks a box wanting an icon, and says which glyph it falls back to. */
export const ICON_ATTRIBUTE = "data-ribbon-sidebar-icon";

/**
 * Marks a box that should not exist without the Icons plugin.
 *
 * A row would otherwise show the same folder repeated down the list. The scope
 * filter and the group headings draw their own glyphs and stay either way.
 */
export const ICON_OPTIONAL_ATTRIBUTE = "data-ribbon-sidebar-icon-optional";

/** The title/preview grid whose optional icon owns its first column. */
export const ICON_LAYOUT_ATTRIBUTE = "data-ribbon-sidebar-icon-layout";

/**
 * Whose icon a box wants, and the glyph it keeps until somebody picks one. The
 * fallback is this plugin's own; the contract leaves it to the consumer.
 */
export type IconFallback = "project" | "personal" | "section";

const FALLBACKS: Record<
  IconFallback,
  { kind: "project" | "section"; glyph: IconSvgElement }
> = {
  project: { kind: "project", glyph: Folder01Icon },
  personal: { kind: "project", glyph: BubbleChatIcon },
  section: { kind: "section", glyph: ListViewIcon },
};

/**
 * A glyph as a CSS mask.
 *
 * A mask reads shape, not color, so the drawing carries a solid stroke and the
 * box's `background-color` supplies the real one.
 */
export function glyphDataUrl(glyph: IconSvgElement): string {
  const children = glyph
    .map(([tag, attrs]) => `<${tag} ${attributes(attrs)}/>`)
    .join("");
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none'` +
    ` stroke='#000' stroke-width='1.5'>${children}</svg>`;
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

export function iconStyles(): string {
  const rules = [`[${ICON_ATTRIBUTE}]{${BOX}}`];
  for (const [fallback, { kind, glyph }] of Object.entries(FALLBACKS)) {
    const chosen = `var(--ribbon-icons-${kind}-glyph,${glyphDataUrl(glyph)})`;
    rules.push(
      `[${ICON_ATTRIBUTE}="${fallback}"]{` +
        // No color of its own unless someone picked one, so the icon reads as
        // part of the label beside it.
        `background-color:var(--ribbon-icons-${kind}-color,currentColor);` +
        `-webkit-mask:${chosen} center/contain no-repeat;` +
        `mask:${chosen} center/contain no-repeat}`,
    );
  }
  rules.push(
    `:root:not([${READY_ATTRIBUTE}]) [${ICON_OPTIONAL_ATTRIBUTE}]{display:none}`,
    `:root:not([${READY_ATTRIBUTE}]) [${ICON_LAYOUT_ATTRIBUTE}]{` +
      "grid-template-columns:minmax(0,1fr);column-gap:0}",
    `:root:not([${READY_ATTRIBUTE}]) [${ICON_LAYOUT_ATTRIBUTE}]` +
      `>:not([${ICON_ATTRIBUTE}]){grid-column-start:1}`,
  );
  return rules.join("\n");
}

const BOX = "display:inline-block;flex:none;inline-size:1rem;block-size:1rem";

/**
 * Puts the stylesheet in the document, and takes it back out.
 *
 * One element for the whole plugin: the rules key off attributes, so nothing
 * here is redone when the list moves or an icon changes.
 */
export function publishIconStyles(target: Document = document): () => void {
  const style = target.createElement("style");
  style.dataset.ribbonSidebarIcons = "";
  style.textContent = iconStyles();
  target.head.append(style);
  return () => style.remove();
}
