import type { IconSvgElement } from "@hugeicons/react";

/**
 * The glyph a section shows when the user has not chosen one.
 *
 * Projects default to a folder and the personal project to a chat bubble
 * because bb draws them that way itself. A section has the same claim, but no
 * Hugeicons entry matches it — bb composes its own SectionAdd mark for the
 * same reason, three stacked bars with the lower two cut short to leave room
 * for a plus. This is that mark without the plus: the same corner radii and
 * stroke, with every bar run out to full width.
 */
const bar = (top: number): IconSvgElement[number] => [
  "path",
  {
    d: `M2 ${top + 1.4}C2 ${top + 0.24173} 2.24173 ${top} 3.4 ${top}H20.6C21.7583 ${top} 22 ${top + 0.24173} 22 ${top + 1.4}V${top + 2.6}C22 ${top + 3.75827} 21.7583 ${top + 4} 20.6 ${top + 4}H3.4C2.24173 ${top + 4} 2 ${top + 3.75827} 2 ${top + 2.6}V${top + 1.4}Z`,
    stroke: "currentColor",
    strokeLinecap: "round",
    strokeWidth: "1.5",
    key: String(top),
  },
];

export const SECTION_GLYPH: IconSvgElement = [bar(2), bar(10), bar(18)];
