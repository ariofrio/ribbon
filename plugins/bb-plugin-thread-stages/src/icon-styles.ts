import { BubbleChatIcon, Folder01Icon } from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";

/**
 * The icons this sidebar draws for projects, taken from the Icons plugin
 * through CSS rather than fetched.
 *
 * That plugin publishes one custom property per owner someone has chosen an
 * icon for, keyed by an attribute a consumer puts on its own box, and marks
 * the document once its stylesheet is in. So a row names its project and the
 * glyph arrives through the cascade: nothing to fetch, nothing to subscribe
 * to, and no work at all per row — a list of any length costs what one row
 * costs. See that plugin's README for the names.
 *
 * Written as one stylesheet of plain CSS rather than as classes on the spans,
 * because the rule that collapses a row's icon has to name `:root`, which is
 * outside the scope root bb compiles a plugin's own stylesheet into.
 */
const READY_ATTRIBUTE = "data-ribbon-icons-ready";

/** Marks a box wanting an icon, and says which glyph it falls back to. */
export const ICON_ATTRIBUTE = "data-thread-stages-icon";

/**
 * Marks a box that should not exist at all without the Icons plugin.
 *
 * A thread row's icon is the project's icon and nothing else, so with no
 * plugin to supply one the row wants its old layout back rather than the same
 * folder repeated down the list. The filter's icon is its own design and stays
 * either way.
 */
export const ICON_OPTIONAL_ATTRIBUTE = "data-thread-stages-icon-optional";

/** Which glyph a box falls back to when nobody has chosen one. */
export type IconFallback = "project" | "personal";

/**
 * A glyph as a CSS mask.
 *
 * A mask reads shape, not color, so the drawing carries a solid stroke and the
 * box's `background-color` supplies the real one — which is what keeps an icon
 * taking the color of the row it sits in.
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
  return [
    `[${ICON_ATTRIBUTE}]{`,
    "display:inline-block;flex:none;inline-size:1rem;block-size:1rem;",
    // No color of its own unless someone picked one, so the icon reads as part
    // of the title beside it rather than a dimmer thing near it.
    "background-color:var(--ribbon-icons-project-color,currentColor);",
    "-webkit-mask:var(--ribbon-icons-project-glyph,var(--thread-stages-icon-fallback)) center/contain no-repeat;",
    "mask:var(--ribbon-icons-project-glyph,var(--thread-stages-icon-fallback)) center/contain no-repeat}",
    "\n",
    `[${ICON_ATTRIBUTE}="project"]{--thread-stages-icon-fallback:${glyphDataUrl(Folder01Icon)}}`,
    "\n",
    `[${ICON_ATTRIBUTE}="personal"]{--thread-stages-icon-fallback:${glyphDataUrl(BubbleChatIcon)}}`,
    "\n",
    `:root:not([${READY_ATTRIBUTE}]) [${ICON_OPTIONAL_ATTRIBUTE}]{display:none}`,
  ].join("");
}

/**
 * Puts the stylesheet in the document, and takes it back out.
 *
 * One element for the whole plugin, inserted once: the rules key off
 * attributes, so nothing here has to be redone when the list moves, when a
 * project is added, or when someone changes an icon.
 */
export function publishIconStyles(target: Document = document): () => void {
  const style = target.createElement("style");
  style.dataset.threadStagesIcons = "";
  style.textContent = iconStyles();
  target.head.append(style);
  return () => style.remove();
}
