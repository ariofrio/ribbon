// Frames each shot: opens the seeded bb in Chromium, lets the shot arrange the
// UI, shades everything except the parts the plugin adds, and crops to a 16:9
// rectangle around them.
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { chromium } from "playwright";

// Not this project's to ship; the file says so and why.
import { KEY_GLYPHS, KEY_GLYPH_EM } from "./key-glyphs.mjs";

export const ASPECT_RATIO = 16 / 9;
/** bb's own default window: DEFAULT_WINDOW_WIDTH x DEFAULT_WINDOW_HEIGHT. */
export const VIEWPORT = { width: 1280, height: 900 };
/**
 * Every card is cropped to this width, so they share one zoom level and the UI
 * reads at the same size in each. Only where each crop sits differs, because
 * each plugin adds something somewhere else.
 */
export const CARD_WIDTH = 560;
export const THEMES = ["light", "dark"];

export const FULL_WINDOW_FILE = (theme, name = "screenshot") => `${name}-${theme}.png`;
export const CARD_FILE = (theme) => `card-${theme}.png`;
export const CARD_BESIDE_FILE = (theme) => `card-beside-${theme}.png`;

/** The mode a split shot pairs with the one it is named for. */
const OTHER_THEME = { light: "dark", dark: "light" };

/**
 * Grows a box into a 16:9 window that stays inside the viewport, so shots of
 * the same area come out the same size and line up next to each other.
 */
export function cropRectangle({
  box,
  padding,
  width: fixedWidth,
  viewport,
  align = "center",
  aspectRatio = ASPECT_RATIO,
}) {
  let width = fixedWidth ?? box.width + padding * 2;
  let height = fixedWidth === undefined ? box.height + padding * 2 : width / aspectRatio;
  if (width / height > aspectRatio) height = width / aspectRatio;
  else width = height * aspectRatio;
  if (width > viewport.width) {
    width = viewport.width;
    height = width / aspectRatio;
  }
  if (height > viewport.height) {
    height = viewport.height;
    width = height * aspectRatio;
  }
  const centerX = box.x + box.width / 2;
  // A column taller than the crop has no meaningful centre; "start" frames it
  // from its top instead, which is where a sidebar begins.
  const top = align === "start" ? box.y - padding : box.y + box.height / 2 - height / 2;
  return {
    width: Math.round(width),
    height: Math.round(height),
    x: Math.round(Math.min(Math.max(centerX - width / 2, 0), viewport.width - width)),
    y: Math.round(Math.min(Math.max(top, 0), viewport.height - height)),
  };
}

export function unionBox(boxes) {
  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  return {
    x: left,
    y: top,
    width: Math.max(...boxes.map((box) => box.x + box.width)) - left,
    height: Math.max(...boxes.map((box) => box.y + box.height)) - top,
  };
}

const OVERLAY_ID = "bb-plugins-screenshot-overlay";
const MINIMUM_CUTOUT_RADIUS = 8;

/** A shortcut has no UI of its own, so the keys are drawn onto the shade. */
export function keyChipStyle(theme) {
  const ink = theme === "dark" ? "#f5f5f5" : "#ffffff";
  const fill = theme === "dark" ? "rgba(32,32,32,0.96)" : "rgba(24,24,24,0.92)";
  const edge = theme === "dark" ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.18)";
  return [
    `background:${fill}`,
    `color:${ink}`,
    `border:1px solid ${edge}`,
    "border-radius:8px",
    "padding:6px 12px",
    // bb's own webfont, so a chip is drawn from a file rather than from
    // whatever the capturing machine calls its interface font.
    'font: 600 17px/1 "Inter Variable", Inter, sans-serif',
    "letter-spacing:0.06em",
    "white-space:nowrap",
    "display:flex",
    "align-items:center",
    "gap:0.34em",
    "box-shadow:0 6px 20px rgba(0,0,0,0.45)",
  ].join(";");
}

/**
 * Runs in the page: shades everything outside the measured rectangles, and
 * writes each box's keys, when it has them, on the shaded side.
 */
export function paintOverlay({ boxes, dim, id, keyStyle, glyphs, glyphEm }) {
  document.getElementById(id)?.remove();
  const svgNamespace = "http://www.w3.org/2000/svg";

  const overlay = document.createElement("div");
  overlay.id = id;
  overlay.style.cssText =
    "position:fixed;inset:0;z-index:2147483647;pointer-events:none";

  const svg = document.createElementNS(svgNamespace, "svg");
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", "100%");
  svg.style.cssText = "position:absolute;inset:0";

  const mask = document.createElementNS(svgNamespace, "mask");
  mask.setAttribute("id", `${id}-mask`);
  const cover = document.createElementNS(svgNamespace, "rect");
  cover.setAttribute("width", "100%");
  cover.setAttribute("height", "100%");
  cover.setAttribute("fill", "white");
  mask.append(cover);

  for (const box of boxes) {
    const hole = document.createElementNS(svgNamespace, "rect");
    hole.setAttribute("x", String(box.x));
    hole.setAttribute("y", String(box.y));
    hole.setAttribute("width", String(box.width));
    hole.setAttribute("height", String(box.height));
    hole.setAttribute("rx", String(box.radius));
    hole.setAttribute("fill", "black");
    mask.append(hole);
  }

  const shade = document.createElementNS(svgNamespace, "rect");
  shade.setAttribute("width", "100%");
  shade.setAttribute("height", "100%");
  shade.setAttribute("fill", dim);
  shade.setAttribute("mask", `url(#${id}-mask)`);

  svg.append(mask, shade);
  overlay.append(svg);

  const chipBoxes = [];
  for (const box of boxes) {
    if (!box.keys) continue;
    const chip = document.createElement("div");
    // Each key is its own child so a symbol can be an outline while a letter
    // stays text, spaced by the chip's own gap rather than by the spaces.
    for (const key of box.keys.split(/\s+/u).filter((each) => each !== "")) {
      const outline = glyphs[key];
      if (outline === undefined) {
        const letter = document.createElement("span");
        letter.textContent = key;
        chip.append(letter);
        continue;
      }
      const [left, bottom, right, top] = outline.box;
      const drawing = document.createElementNS(svgNamespace, "svg");
      // Stored y-up, as a font measures it, and flipped once here.
      drawing.setAttribute(
        "viewBox",
        `${left} ${-top} ${right - left} ${top - bottom}`,
      );
      drawing.style.cssText = [
        `width:${(right - left) / glyphEm}em`,
        `height:${(top - bottom) / glyphEm}em`,
        "display:block",
      ].join(";");
      const outlinePath = document.createElementNS(svgNamespace, "path");
      outlinePath.setAttribute("d", outline.path);
      outlinePath.setAttribute("fill", "currentColor");
      outlinePath.setAttribute("transform", "scale(1 -1)");
      drawing.append(outlinePath);
      chip.append(drawing);
    }
    const gap = 14;
    const placement =
      box.keysPlacement ??
      (box.y + box.height + 56 < window.innerHeight ? "below" : "above");
    const anchor = box.keysAnchor ?? "center";
    const along = { start: 0, center: 0.5, end: 1 }[anchor];
    const shift = { start: "0", center: "-50%", end: "-100%" }[anchor];
    const inset = anchor === "center" ? 0 : gap * (anchor === "start" ? 1 : -1);
    const acrossX = box.x + box.width * along + inset;
    const acrossY = box.y + box.height * along + inset;
    const anchors = {
      below: [acrossX, box.y + box.height + gap, shift, "0"],
      above: [acrossX, box.y - gap, shift, "-100%"],
      left: [box.x - gap, acrossY, "-100%", shift],
      right: [box.x + box.width + gap, acrossY, "0", shift],
    };
    const [left, top, shiftX, shiftY] = anchors[placement];
    chip.style.cssText = `position:absolute;left:${left}px;top:${top}px;transform:translate(${shiftX}, ${shiftY});${keyStyle}`;
    overlay.append(chip);
    chipBoxes.push(chip);
  }

  document.body.append(overlay);
  // The keys are part of the picture, so the crop has to make room for them.
  return chipBoxes.map((chip) => {
    const rectangle = chip.getBoundingClientRect();
    return {
      x: rectangle.x,
      y: rectangle.y,
      width: rectangle.width,
      height: rectangle.height,
    };
  });
}

/**
 * Measures each match in the page rather than through boundingBox(), because a
 * cutout that does not carry the element's own corner radius reads as a sticker
 * laid over the UI instead of a hole cut around it.
 */
async function boxesFor(locators, { label }) {
  const boxes = [];
  for (const locator of locators) {
    const measured = await locator.evaluateAll((nodes) =>
      nodes
        .map((node) => {
          const rectangle = node.getBoundingClientRect();
          const style = getComputedStyle(node);
          const corner = (value) => {
            const number = Number.parseFloat(value);
            if (Number.isNaN(number)) return 0;
            return value.trimStart().endsWith("%")
              ? (Math.min(rectangle.width, rectangle.height) * number) / 100
              : number;
          };
          return {
            x: rectangle.x,
            y: rectangle.y,
            width: rectangle.width,
            height: rectangle.height,
            radius: Math.max(
              corner(style.borderTopLeftRadius),
              corner(style.borderTopRightRadius),
              corner(style.borderBottomLeftRadius),
              corner(style.borderBottomRightRadius),
            ),
          };
        })
        .filter((box) => box.width > 0 && box.height > 0),
    );
    if (measured.length === 0) {
      throw new Error(`${label}: nothing visible matched ${locator}`);
    }
    boxes.push(...measured);
  }
  return boxes;
}

/**
 * Growing a rounded rectangle by p grows its corners by p too. Square-cornered
 * elements still get a rounded cutout, because a sharp one reads as a crop mark
 * rather than a highlight, and no corner can exceed half the shorter side.
 */
function padBox(box, padding) {
  const width = box.width + padding * 2;
  const height = box.height + padding * 2;
  return {
    x: box.x - padding,
    y: box.y - padding,
    width,
    height,
    radius: Math.min(
      Math.max((box.radius ?? 0) + padding, MINIMUM_CUTOUT_RADIUS),
      Math.min(width, height) / 2,
    ),
  };
}

/**
 * State the capturing machine brings with it. bb's sidebar footer carries an
 * update chip for everything waiting on this host — bb itself, and each agent
 * CLI it found — so the same shot taken on two machines differs in the corner
 * for reasons no plugin here is responsible for. These shots are about the
 * plugins, so the chips stay out of them.
 */
const HOST_STATE_STYLE =
  '[data-sidebar="footer"] a[href="/settings/updates"] { display: none !important; }';

export async function openApp({ browser, stack, fixture, theme, viewport, style }) {
  const context = await browser.newContext({
    viewport: viewport ?? VIEWPORT,
    deviceScaleFactor: 2,
    colorScheme: theme,
    reducedMotion: "reduce",
  });
  // bb resolves its palette from this key before first paint, so the app never
  // renders in the wrong mode and no theme toggle has to be clicked.
  await context.addInitScript(
    (mode) => window.localStorage.setItem("bb.theme", mode),
    theme,
  );
  // The sidebar opens focused on the product rather than on everything bb
  // knows about, which is what a section is for and what the shots are of.
  // Ribbon keeps this choice per client, so it is set here rather than seeded
  // on the server.
  await context.addInitScript(
    (id) =>
      window.localStorage.setItem(
        "bb.plugin.ribbon-sidebar.preferences.v1",
        JSON.stringify({
          view: {
            scope: {
              kind: "group",
              group: { groupingKey: "builtin:sections", groupId: id },
            },
            groupingKey: "plugin:thread-stages:stages",
          },
          collapsed: [
            "plugin:thread-stages:stages/Deferred",
            "plugin:thread-stages:stages/Completed",
          ],
        }),
      ),
    fixture.section.id,
  );
  // Thread stages no longer registers a list, so every shot starts on Ribbon.
  await context.addInitScript(() => {
    if (window.localStorage.getItem("bb.sidebar.threadListProvider") === null) {
      window.localStorage.setItem(
        "bb.sidebar.threadListProvider",
        JSON.stringify("ribbon-sidebar/ribbon-sidebar"),
      );
    }
  });
  await context.addInitScript(
    (css) => {
      const sheet = document.createElement("style");
      sheet.textContent = css;
      document.addEventListener("DOMContentLoaded", () =>
        document.head.append(sheet),
      );
    },
    style === undefined ? HOST_STATE_STYLE : `${HOST_STATE_STYLE}\n${style}`,
  );
  const page = await context.newPage();
  // Registered before the first navigation, because the mount every shot waits
  // for happens during it: a listener added after `goto` observes none of the
  // window a plugin fails in, and a run that ends in a timeout then has nothing
  // to say about why.
  const diagnostics = [];
  page.on("console", (message) => {
    if (message.type() !== "error" && message.type() !== "warning") return;
    diagnostics.push(`${message.type()}: ${message.text()}`);
  });
  page.on("pageerror", (error) => {
    diagnostics.push(`pageerror: ${error.stack ?? error.message}`);
  });
  await page.goto(stack.serverUrl, { waitUntil: "networkidle" });
  return { context, page, diagnostics };
}

/**
 * The window a full-window capture is missing. The web client draws bb's
 * chrome but not its silhouette, so the frame supplies exactly that: macOS's
 * corner radius, the hairline its edge catches, and the shadow it casts —
 * tuned per mode, because the same pair of images is read on a white page and
 * on a near-black one. No traffic lights: bb sits them over the top of its own
 * sidebar, where this capture shows the sidebar toggle instead, and painting
 * them in would put real controls in the wrong place.
 */
const WINDOW_FRAME = {
  // macOS's own window rounding, so the silhouette matches the app rather than
  // a card.
  //
  // No shadow: a shadow falls to the sides as well as below, and the margin it
  // needs is margin a reader sees — it holds the window's edge inside the
  // column the text beside it is flush with. The hairline alone says window,
  // and it costs one pixel of margin, which is what the ring is drawn in.
  radius: 10,
  padding: { top: 1, side: 1, bottom: 1 },
  light: { edge: "rgba(0, 0, 0, 0.16)", shadow: null },
  dark: { edge: "rgba(255, 255, 255, 0.16)", shadow: null },
};

const HERO_SHADOW_BLUR = 12;
const HERO_FRAME = {
  ...WINDOW_FRAME,
  padding: {
    top: HERO_SHADOW_BLUR,
    side: HERO_SHADOW_BLUR,
    bottom: HERO_SHADOW_BLUR,
  },
  light: {
    ...WINDOW_FRAME.light,
    shadow: `0 0 ${HERO_SHADOW_BLUR}px rgba(0, 0, 0, 0.24)`,
  },
  dark: {
    ...WINDOW_FRAME.dark,
    shadow: `0 0 ${HERO_SHADOW_BLUR}px rgba(0, 0, 0, 0.56)`,
  },
};

/**
 * A card is a crop of an interface, not a window, so it gets a tile's corners
 * and a shadow that lifts it off the README's page — and no edge, which would
 * draw a window frame around something that is not a window. The radius is
 * wider than the window's because a card is shown at about half its size in
 * the table, where a window's 10px would all but disappear.
 */
const CARD_FRAME = {
  radius: 14,
  // Stacked above a heading, a card needs space beneath it and none at its
  // sides: both its edges are the column's.
  padding: { top: 0, left: 0, right: 0, bottom: 28 },
  light: { edge: null, shadow: null },
  dark: { edge: null, shadow: null },
};

/**
 * The same card for the layout that floats it, where the paragraph beside it
 * runs into its left edge. The margin belongs to that arrangement alone, which
 * is why it is a second file rather than padding on the only one: stacked, it
 * would push the picture off the margin the text is flush with.
 */
const CARD_BESIDE_FRAME = {
  ...CARD_FRAME,
  padding: { top: 0, left: 24, right: 0, bottom: 0 },
};

/** Draws an image into its frame's corners, edge, and shadow. */
async function writeFramed({ browser, frame, image, size, theme, output }) {
  const { radius } = frame;
  const padding = {
    top: frame.padding.top,
    bottom: frame.padding.bottom,
    left: frame.padding.left ?? frame.padding.side,
    right: frame.padding.right ?? frame.padding.side,
  };
  const { edge, shadow } = frame[theme];
  const context = await browser.newContext({
    viewport: {
      width: size.width + padding.left + padding.right,
      height: size.height + padding.top + padding.bottom,
    },
    deviceScaleFactor: 2,
  });
  const sheet = await context.newPage();
  await sheet.setContent(
    `<body style="margin:0;background:transparent">
       <div id="frame" style="
         width:${size.width + padding.left + padding.right}px;
         padding:${padding.top}px ${padding.right}px ${padding.bottom}px ${padding.left}px;
         box-sizing:border-box">
         <img src="data:image/png;base64,${image.toString("base64")}"
              style="display:block;width:${size.width}px;height:${size.height}px;
                     border-radius:${radius}px;
                     box-shadow:${[shadow, edge === null ? null : `0 0 0 1px ${edge}`]
                       .filter((layer) => layer !== null)
                       .join(", ") || "none"}">
       </div>
     </body>`,
  );
  await sheet
    .locator("#frame")
    .screenshot({ path: mkdirFor(output), omitBackground: true });
  await context.close();
}

/**
 * Joins two captures along the diagonal, which is how the theme plugin shows
 * both of its palettes in one image. The base holds the top-left triangle, so
 * a reader meets the mode they are already in and sees the other alongside it.
 */
async function writeDiagonalSplit({ browser, base, corner, output, size }) {
  const context = await browser.newContext({ viewport: size, deviceScaleFactor: 2 });
  const sheet = await context.newPage();
  await sheet.setContent(
    `<body style="margin:0"><canvas id="c" width="${size.width * 2}" height="${size.height * 2}" style="width:${size.width}px;height:${size.height}px;display:block"></canvas></body>`,
  );
  await sheet.evaluate(
    async ({ baseUrl, cornerUrl }) => {
      const load = (url) =>
        new Promise((resolve) => {
          const image = new Image();
          image.addEventListener("load", () => resolve(image));
          image.src = url;
        });
      const canvas = document.getElementById("c");
      const drawing = canvas.getContext("2d");
      drawing.drawImage(await load(baseUrl), 0, 0);
      drawing.save();
      drawing.beginPath();
      drawing.moveTo(canvas.width, 0);
      drawing.lineTo(canvas.width, canvas.height);
      drawing.lineTo(0, canvas.height);
      drawing.closePath();
      drawing.clip();
      drawing.drawImage(await load(cornerUrl), 0, 0);
      drawing.restore();
    },
    {
      baseUrl: `data:image/png;base64,${base.toString("base64")}`,
      cornerUrl: `data:image/png;base64,${corner.toString("base64")}`,
    },
  );
  const joined = await sheet
    .locator("#c")
    .screenshot(output === undefined ? {} : { path: mkdirFor(output) });
  await context.close();
  return joined;
}

function mkdirFor(output) {
  mkdirSync(dirname(output), { recursive: true });
  return output;
}

/**
 * Neither default is a difference in shading. Hinting rounds every glyph
 * advance to a whole pixel and the error accumulates along a line, moving
 * where text wraps and where an ellipsis lands; LCD antialiasing writes colour
 * into the edge of every glyph, against a stripe no README is read on. Both
 * are no-ops on macOS, which does neither.
 */
const TEXT_RENDERING = ["--font-render-hinting=none", "--disable-lcd-text"];

export async function capture({ stack, fixture, shots, shotFiles }) {
  const browser = await chromium.launch({ args: TEXT_RENDERING });
  const captured = [];
  try {
    for (const shot of shots) {
      const shotStartedAt = performance.now();
      // Nothing is written while a shot is being taken. Every capture is an
      // ingredient: a split shot pairs each mode's with the other's, and all of
      // them are framed before they land.
      const outputs = shotFiles(shot);
      await shot.setup?.({ fixture, stack });
      // bb's default window, unless a shot pictures something that reads
      // better in a smaller one.
      const windowSize = shot.viewport ?? VIEWPORT;
      const frames = { fullWindow: {}, card: {} };
      const renderStartedAt = performance.now();
      for (const theme of shot.themes ?? THEMES) {
        const takeCard = async ({ page, focusBoxes }, viewport) => {
          const clip = cropRectangle({
            box: unionBox(focusBoxes),
            padding: shot.focusPadding ?? 20,
            width: CARD_WIDTH,
            align: shot.focusAlign,
            viewport,
          });
          frames.card.clip = clip;
          return await page.screenshot({ clip });
        };
        const takeFullWindow = ({ page }) =>
          page.screenshot({ clip: { x: 0, y: 0, ...windowSize } });
        // A shot of the whole collection has no card and nothing to focus on,
        // so it never measures one.
        const wantsCard = outputs[CARD_FILE(theme)] !== undefined;
        if (shot.card === undefined) {
          const [fullWindow, card] = await render({
            browser,
            stack,
            fixture,
            shot,
            theme,
            viewport: windowSize,
            async take(frame) {
              return [
                await takeFullWindow(frame),
                wantsCard ? await takeCard(frame, windowSize) : undefined,
              ];
            },
          });
          frames.fullWindow[theme] = fullWindow;
          frames.card[theme] = card;
          continue;
        }
        // A shot whose subject is dwarfed by bb's default window asks for a
        // smaller one for its card. The crop width does not change with it, so
        // the card still reads at the same zoom as every other card; only the
        // window around the subject shrinks.
        frames.fullWindow[theme] = await render({
          browser,
          stack,
          fixture,
          shot,
          theme,
          viewport: windowSize,
          take: takeFullWindow,
        });
        frames.card[theme] = await render({
          browser,
          stack,
          fixture,
          shot,
          theme,
          viewport: shot.card.viewport,
          style: shot.card.style,
          take: (frame) => takeCard(frame, shot.card.viewport),
        });
      }
      const renderSeconds = (performance.now() - renderStartedAt) / 1000;
      const composeStartedAt = performance.now();
      for (const theme of shot.themes ?? THEMES) {
        const other = OTHER_THEME[theme];
        for (const [name, frame, taken, size] of [
          [
            FULL_WINDOW_FILE(theme, shot.fileName),
            shot.fileName === "hero" ? HERO_FRAME : WINDOW_FRAME,
            frames.fullWindow,
            windowSize,
          ],
          [CARD_FILE(theme), CARD_FRAME, frames.card, frames.card.clip],
          [
            CARD_BESIDE_FILE(theme),
            CARD_BESIDE_FRAME,
            frames.card,
            frames.card.clip,
          ],
        ]) {
          if (outputs[name] === undefined) continue;
          await writeFramed({
            browser,
            frame,
            image: shot.split
              ? await writeDiagonalSplit({
                  browser,
                  base: taken[theme],
                  corner: taken[other],
                  size,
                })
              : taken[theme],
            size: { width: size.width, height: size.height },
            theme,
            output: outputs[name],
          });
        }
      }
      const composeSeconds = (performance.now() - composeStartedAt) / 1000;
      await shot.teardown?.({ fixture, stack });
      captured.push(shot);
      console.log(
        `  ${shot.id} [timing: ${(
          (performance.now() - shotStartedAt) /
          1000
        ).toFixed(1)}s; render ${renderSeconds.toFixed(1)}s; compose ${composeSeconds.toFixed(1)}s]`,
      );
    }
  } finally {
    await browser.close();
  }
  return captured;
}

/**
 * A running thread spins forever, so every capture would otherwise catch it at
 * a different angle and every recapture would report a change that is not one.
 * Only looping animations are paused: bb opens its menus and dialogs with
 * animations that run once, and pausing those leaves an empty box where the
 * menu should be.
 */
async function freezeLoopingAnimations(page) {
  await page.evaluate(() => {
    for (const animation of document.getAnimations()) {
      if (animation.effect?.getTiming().iterations !== Infinity) continue;
      animation.pause();
      animation.currentTime = 0;
    }
  });
}

/**
 * Arranges the app, shades it, and hands the page to whoever wants a frame of
 * it. Each frame gets its own window, because a card may want a different one.
 */
async function render({ browser, stack, fixture, shot, theme, viewport, style, take }) {
  const { context, page, diagnostics } = await openApp({
    browser,
    stack,
    fixture,
    theme,
    viewport,
    style,
  });
  try {
    await shot.prepare({ page, fixture, stack, theme });
    await freezeLoopingAnimations(page);
    const highlightBoxes = await highlightBoxesFor({ page, shot });
    let chipBoxes = [];
    if (highlightBoxes.length > 0) {
      chipBoxes = await page.evaluate(paintOverlay, {
        boxes: highlightBoxes,
        dim: theme === "dark" ? "rgba(0,0,0,0.66)" : "rgba(15,15,15,0.42)",
        id: OVERLAY_ID,
        keyStyle: keyChipStyle(theme),
        glyphs: KEY_GLYPHS,
        glyphEm: KEY_GLYPH_EM,
      });
    }
    // The card frames what the plugin adds; the keys drawn onto the shade are
    // part of that, and so is anything the shot points at by hand.
    const focusBoxes = [
      ...(shot.focus
        ? await boxesFor(shot.focus(page), { label: `${shot.id} focus` })
        : highlightBoxes),
      ...chipBoxes,
    ];
    return await take({ page, focusBoxes });
  } catch (error) {
    // What the page said while it was failing, which is the only record of an
    // error React swallowed or a warning bb logged on its way to a timeout.
    if (diagnostics.length > 0) {
      error.message = `${error.message}\n\nThe page reported:\n${diagnostics
        .map((line) => `  ${line}`)
        .join("\n")}`;
    }
    throw error;
  } finally {
    await context.close();
  }
}

/** Measures and pads everything a shot lifts out of the shade. */
async function highlightBoxesFor({ page, shot }) {
  const highlightBoxes = [];
  for (const highlight of shot.highlights?.(page) ?? []) {
    const boxes = await boxesFor([highlight.locator], {
      label: `${shot.id} highlight`,
    });
    // Just enough to keep the shade off the element's own edge.
    const padding = highlight.padding ?? 2;
    const padded = highlight.merge
      ? [
          padBox(
            {
              ...unionBox(boxes),
              radius: Math.max(...boxes.map((box) => box.radius ?? 0)),
            },
            padding,
          ),
        ]
      : boxes.map((box) => padBox(box, padding));
    highlightBoxes.push(
      ...padded.map((box) =>
        highlight.keys === undefined
          ? box
          : {
              ...box,
              keys: highlight.keys,
              keysPlacement: highlight.keysPlacement,
              keysAnchor: highlight.keysAnchor,
            },
      ),
    );
  }
  return highlightBoxes;
}
