// Fits and checks the project-icon palette against every theme bb ships.
//
//   node scripts/fit-palette.mjs          report how the shipped palette scores
//   node scripts/fit-palette.mjs --fit    search for new anchors
//
// The icons sit on two surfaces, the header and the sidebar, in seven themes
// across two modes. A palette is good here when every color stays legible on
// all of them and no two colors collapse into each other, so this scores both:
// the smallest WCAG contrast ratio anywhere, and the smallest OKLab distance
// between any two colors anywhere.
import { iconColor } from "../src/icons/icon-colors.ts";

/** Canvas and ink for each built-in theme; every other surface derives from them. */
const THEME_TOKENS = {
  default: {
    light: { canvas: "oklch(1 0 0)", ink: "oklch(0.3211 0 0)" },
    dark: { canvas: "oklch(0.2046 0 0)", ink: "oklch(0.9219 0 0)" },
  },
  nord: {
    light: { canvas: "#eceff4", ink: "#2e3440" },
    dark: { canvas: "#2e3440", ink: "#d8dee9" },
  },
  dracula: {
    light: { canvas: "#f8f8f2", ink: "#282a36" },
    dark: { canvas: "#282a36", ink: "#f8f8f2" },
  },
  solarized: {
    light: { canvas: "#fdf6e3", ink: "#657b83" },
    dark: { canvas: "#002b36", ink: "#93a1a1" },
  },
  gruvbox: {
    light: { canvas: "#fbf1c7", ink: "#3c3836" },
    dark: { canvas: "#282828", ink: "#ebdbb2" },
  },
  catppuccin: {
    light: { canvas: "#eff1f5", ink: "#4c4f69" },
    dark: { canvas: "#1e1e2e", ink: "#cdd6f4" },
  },
};

/** bb tints the sidebar by mixing this much ink into the canvas. */
const SIDEBAR_INK = { light: 0.022, dark: 0.043 };

const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const linearToSrgb = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

function hexToRgb(hex) {
  const value = hex.trim().replace("#", "");
  const full = value.length === 3 ? [...value].map((c) => c + c).join("") : value;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
}

function rgbToOklab([r, g, b]) {
  const [R, G, B] = [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)];
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** Unclamped, so callers can tell whether a color left sRGB. */
function oklchToLinearSrgb([L, C, H]) {
  const h = (H * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map(linearToSrgb);
}

const inGamut = (rgb) => rgb.every((c) => c >= -0.0005 && c <= 1.0005);

/** The most chroma a hue can hold at a lightness without leaving sRGB. */
export function maxChroma(lightness, hue) {
  let lo = 0;
  let hi = 0.45;
  for (let i = 0; i < 24; i += 1) {
    const mid = (lo + hi) / 2;
    if (inGamut(oklchToLinearSrgb([lightness, mid, hue]))) lo = mid;
    else hi = mid;
  }
  return lo;
}

/**
 * What a browser actually paints: out-of-gamut colors lose chroma until they
 * fit, holding lightness and hue. Clamping the channels instead would darken
 * them, which quietly inflates every contrast score.
 */
export function toRgb([L, C, H]) {
  const chroma = inGamut(oklchToLinearSrgb([L, C, H])) ? C : maxChroma(L, H);
  return oklchToLinearSrgb([L, chroma, H]).map((c) => Math.min(1, Math.max(0, c)));
}

function rgbToOklch(rgb) {
  const [L, a, b] = rgbToOklab(rgb);
  return [L, Math.hypot(a, b), (Math.atan2(b, a) * 180) / Math.PI];
}

function parseColor(input) {
  const text = input.trim();
  if (text.startsWith("#")) return rgbToOklch(hexToRgb(text));
  const m = /oklch\(\s*([\d.]+)%?\s+([\d.]+)\s+([\d.]+)/.exec(text);
  if (m === null) throw new Error(`unsupported color: ${input}`);
  const l = Number(m[1]) > 1 ? Number(m[1]) / 100 : Number(m[1]);
  return [l, Number(m[2]), Number(m[3])];
}

/** CSS `color-mix(in oklch, a weight, b)`, including powerless hue. */
function mixOklch(a, b, weight) {
  const hueA = a[1] < 0.002 ? b[2] : a[2];
  const hueB = b[1] < 0.002 ? a[2] : b[2];
  const delta = ((hueB - hueA + 540) % 360) - 180;
  return [
    a[0] * weight + b[0] * (1 - weight),
    a[1] * weight + b[1] * (1 - weight),
    hueA + delta * (1 - weight),
  ];
}

const luminance = (rgb) => {
  const [r, g, b] = rgb.map(srgbToLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const contrast = (x, y) => {
  const [hi, lo] = [luminance(x), luminance(y)].sort((m, n) => n - m);
  return (hi + 0.05) / (lo + 0.05);
};
export const deltaE = (x, y) => {
  const [a, b] = [rgbToOklab(x), rgbToOklab(y)];
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
};

/** Every theme and mode, with the header and sidebar surfaces they produce. */
export const SURFACES = Object.entries(THEME_TOKENS).flatMap(([theme, modes]) =>
  Object.entries(modes).map(([mode, tokens]) => {
    const canvas = parseColor(tokens.canvas);
    const ink = parseColor(tokens.ink);
    return {
      name: `${theme}/${mode}`,
      mode,
      surfaces: [toRgb(canvas), toRgb(mixOklch(ink, canvas, SIDEBAR_INK[mode]))],
    };
  }),
);

export const COLORS = ["red", "orange", "yellow", "green", "teal", "blue", "purple", "pink"];

/** Pulls the two anchors back out of the CSS the plugin actually emits. */
function shippedAnchors() {
  const anchors = {};
  for (const color of COLORS) {
    const css = iconColor(color);
    const m = /light-dark\(oklch\(([^)]+)\),\s*oklch\(([^)]+)\)\)/.exec(css ?? "");
    if (m === null) throw new Error(`cannot read the anchors for ${color}: ${css}`);
    const [light, dark] = [m[1], m[2]].map((part) => part.trim().split(/\s+/).map(Number));
    anchors[color] = { light, dark };
  }
  return anchors;
}

/**
 * Worst contrast and worst pairwise distance over every surface, plus where
 * each worst case happens so a regression names the theme that broke.
 */
export function evaluate(anchors) {
  let minContrast = Infinity;
  let minDelta = Infinity;
  let contrastAt = null;
  let deltaAt = null;
  const perSurface = [];
  for (const { name, mode, surfaces } of SURFACES) {
    const rendered = COLORS.map((color) => toRgb(anchors[color][mode]));
    let localContrast = Infinity;
    let localDelta = Infinity;
    rendered.forEach((rgb, index) => {
      for (const surface of surfaces) {
        const ratio = contrast(rgb, surface);
        if (ratio < localContrast) localContrast = ratio;
        if (ratio < minContrast) {
          minContrast = ratio;
          contrastAt = `${name} ${COLORS[index]}`;
        }
      }
    });
    for (let i = 0; i < rendered.length; i += 1) {
      for (let j = i + 1; j < rendered.length; j += 1) {
        const d = deltaE(rendered[i], rendered[j]);
        if (d < localDelta) localDelta = d;
        if (d < minDelta) {
          minDelta = d;
          deltaAt = `${name} ${COLORS[i]}/${COLORS[j]}`;
        }
      }
    }
    perSurface.push({ name, contrast: localContrast, delta: localDelta });
  }
  return { minContrast, minDelta, contrastAt, deltaAt, perSurface };
}

export const evaluateShipped = () => evaluate(shippedAnchors());

/** Hue windows that keep each name honest, in OKLCH degrees. */
const HUE_WINDOWS = {
  red: [22, 32], orange: [40, 55], yellow: [80, 95], green: [140, 160],
  teal: [175, 195], blue: [248, 266], purple: [295, 312], pink: [340, 358],
};
/** Lightness stays in a narrow band per mode so the eight read as one family. */
const BANDS = { light: [0.52, 0.6], dark: [0.72, 0.8] };
/** Each color keeps most of the chroma its hue can hold, so none look washed out. */
const MIN_SATURATION = 0.9;
const CONTRAST_FLOOR = 3.5;

function fit() {
  const rand = (lo, hi) => lo + Math.random() * (hi - lo);
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const build = (p) => Object.fromEntries(COLORS.map((c) => [c, {
    light: [p[c].light.lightness, Math.max(0.02, p[c].light.saturation * maxChroma(p[c].light.lightness, p[c].hue)), p[c].hue],
    dark: [p[c].dark.lightness, Math.max(0.02, p[c].dark.saturation * maxChroma(p[c].dark.lightness, p[c].hue)), p[c].hue],
  }]));
  const objective = (p) => {
    const s = evaluate(build(p));
    return s.minContrast < CONTRAST_FLOOR ? s.minContrast - 100 : s.minDelta;
  };
  const seed = () => Object.fromEntries(COLORS.map((c) => [c, {
    hue: rand(...HUE_WINDOWS[c]),
    light: { lightness: rand(...BANDS.light), saturation: rand(MIN_SATURATION, 1) },
    dark: { lightness: rand(...BANDS.dark), saturation: rand(MIN_SATURATION, 1) },
  }]));
  const copy = (p) => Object.fromEntries(COLORS.map((c) => [c, {
    hue: p[c].hue, light: { ...p[c].light }, dark: { ...p[c].dark },
  }]));

  let winner = null;
  for (let restart = 0; restart < 20; restart += 1) {
    let current = seed();
    let currentScore = objective(current);
    let best = current;
    let bestScore = currentScore;
    for (let step = 0; step < 9000; step += 1) {
      const temperature = 0.02 * (1 - step / 9000);
      const next = copy(current);
      const color = COLORS[Math.floor(Math.random() * COLORS.length)];
      const knob = Math.floor(Math.random() * 5);
      if (knob === 0) {
        next[color].hue = clamp(next[color].hue + rand(-6, 6), ...HUE_WINDOWS[color]);
      } else {
        const mode = knob < 3 ? "light" : "dark";
        if (knob % 2 === 1) {
          next[color][mode].lightness = clamp(next[color][mode].lightness + rand(-0.03, 0.03), ...BANDS[mode]);
        } else {
          next[color][mode].saturation = clamp(next[color][mode].saturation + rand(-0.06, 0.06), MIN_SATURATION, 1);
        }
      }
      const score = objective(next);
      if (score > currentScore || Math.random() < Math.exp((score - currentScore) / (temperature || 1e-6))) {
        current = next;
        currentScore = score;
        if (score > bestScore) {
          best = next;
          bestScore = score;
        }
      }
    }
    if (winner === null || bestScore > winner.score) winner = { anchors: build(best), score: bestScore };
  }
  return winner.anchors;
}

function report(anchors, label) {
  const result = evaluate(anchors);
  console.log(`${label}: worst contrast ${result.minContrast.toFixed(2)} (${result.contrastAt}), closest pair ${result.minDelta.toFixed(3)} (${result.deltaAt})`);
  for (const row of result.perSurface) {
    console.log(`  ${row.name.padEnd(20)} contrast ${row.contrast.toFixed(2)}  deltaE ${row.delta.toFixed(3)}`);
  }
  return result;
}

if (process.argv[1]?.endsWith("fit-palette.mjs")) {
  if (process.argv.includes("--fit")) {
    const anchors = fit();
    report(anchors, "fitted");
    console.log(JSON.stringify(Object.fromEntries(COLORS.map((c) => [c, {
      hue: +anchors[c].light[2].toFixed(1),
      light: { lightness: +anchors[c].light[0].toFixed(3), chroma: +anchors[c].light[1].toFixed(3) },
      dark: { lightness: +anchors[c].dark[0].toFixed(3), chroma: +anchors[c].dark[1].toFixed(3) },
    }])), null, 2));
  } else {
    const result = report(shippedAnchors(), "shipped");
    if (result.minContrast < CONTRAST_FLOOR) {
      console.error(`FAIL: ${result.contrastAt} is below the ${CONTRAST_FLOOR}:1 floor.`);
      process.exit(1);
    }
  }
}
