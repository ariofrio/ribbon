import type { IconColor } from "./store";

/**
 * A palette designed for this job rather than borrowed from one built for text
 * and buttons. Each color keeps one hue across the whole app and picks its
 * lightness per mode through CSS `light-dark()`: bb sets `color-scheme` on the
 * same `:root, .light` / `.dark` selectors every theme overrides its tokens on,
 * so the mode signal is always in step with the palette in effect.
 *
 * Choosing per mode is what lets the hues stay themselves. The obvious
 * alternative — one anchor mixed into `var(--foreground)` — has to pull the
 * color most of the way to the theme's ink before it clears 3:1 on a light
 * canvas, and by then yellow reads olive and red reads mauve. Here nothing is
 * mixed, so a color is only ever a lighter or darker version of itself.
 *
 * Fitted against every built-in theme in both modes, on both surfaces these
 * icons sit on — the header and the sidebar — maximizing the smallest distance
 * between any two colors subject to every color clearing 3.5:1. Lightness is
 * held inside a narrow band per mode so the eight read as one family, and each
 * chroma is at least 90% of the most that hue can hold at that lightness, which
 * keeps them vivid without leaving sRGB. Hue windows keep each name honest, so
 * colors already stored stay valid.
 *
 * Measured over those 12 combinations: contrast 3.54 at worst, and the closest
 * pair anywhere is 0.126 apart in OKLab, against 0.021 for a flat 500-weight
 * palette — roughly six times the separation, well past the ~0.05 two 16px
 * glyphs need to be told apart.
 *
 * scripts/fit-palette.mjs re-runs both halves of that: it reports how these
 * anchors score, and searches for new ones with `--fit` when a theme is added.
 */
interface ColorAnchor {
  hue: number;
  /** On a light canvas, where the color has to be dark enough to be seen. */
  light: { lightness: number; chroma: number };
  dark: { lightness: number; chroma: number };
}

const ICON_ANCHORS: Record<IconColor, ColorAnchor> = {
  red: {
    hue: 23.5,
    light: { lightness: 0.531, chroma: 0.212 },
    dark: { lightness: 0.8, chroma: 0.103 },
  },
  orange: {
    hue: 52.9,
    light: { lightness: 0.595, chroma: 0.151 },
    dark: { lightness: 0.72, chroma: 0.179 },
  },
  yellow: {
    hue: 95,
    light: { lightness: 0.52, chroma: 0.107 },
    dark: { lightness: 0.8, chroma: 0.159 },
  },
  green: {
    hue: 140,
    light: { lightness: 0.56, chroma: 0.171 },
    dark: { lightness: 0.729, chroma: 0.235 },
  },
  teal: {
    hue: 191.6,
    light: { lightness: 0.556, chroma: 0.086 },
    dark: { lightness: 0.793, chroma: 0.136 },
  },
  blue: {
    hue: 256,
    light: { lightness: 0.522, chroma: 0.175 },
    dark: { lightness: 0.72, chroma: 0.148 },
  },
  purple: {
    hue: 306,
    light: { lightness: 0.6, chroma: 0.279 },
    dark: { lightness: 0.8, chroma: 0.128 },
  },
  pink: {
    hue: 345.5,
    light: { lightness: 0.52, chroma: 0.207 },
    dark: { lightness: 0.72, chroma: 0.21 },
  },
};

function anchorColor(
  anchor: ColorAnchor["light"] | ColorAnchor["dark"],
  hue: number,
): string {
  return `oklch(${anchor.lightness} ${anchor.chroma} ${hue})`;
}

export function iconColor(color: IconColor | null): string | null {
  if (color === null) return null;
  const { hue, light, dark } = ICON_ANCHORS[color];
  return `light-dark(${anchorColor(light, hue)}, ${anchorColor(dark, hue)})`;
}

export function lightIconColor(color: IconColor | null): string | null {
  if (color === null) return null;
  const { hue, light } = ICON_ANCHORS[color];
  return anchorColor(light, hue);
}

/** Inline so it survives outside the plugin's `@scope` root, such as bb's header. */
export function iconColorStyle(
  color: IconColor | null,
): { color: string } | undefined {
  const value = iconColor(color);
  return value === null ? undefined : { color: value };
}
