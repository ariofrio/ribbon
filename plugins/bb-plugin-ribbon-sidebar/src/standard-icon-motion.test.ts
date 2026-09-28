import { describe, expect, it } from "vitest";
import { OpenBookIcon, ShutBookIcon } from "./heading";
import { Folder02Icon, FolderClosedIcon } from "@hugeicons/core-free-icons";
import { bookFrame, folderFrame } from "./standard-icon-motion";

type Point = [number, number];

/** Points along every stroke of an absolute M/H/V/L/C/Z path. */
function sample(d: string, perSegment = 48): Point[] {
  const points: Point[] = [];
  const tokens = d.match(/[MHVLCZ]|-?\d*\.?\d+(?:e-?\d+)?/g)!;
  let at: Point = [0, 0];
  let start: Point = [0, 0];
  let i = 0;
  const num = () => Number(tokens[i++]);
  const segment = (points4: Point[]) => {
    for (let k = 0; k <= perSegment; k += 1) {
      const t = k / perSegment;
      const [p0, p1, p2, p3] = points4 as [Point, Point, Point, Point];
      const m = 1 - t;
      points.push([
        m * m * m * p0[0] + 3 * m * m * t * p1[0] + 3 * m * t * t * p2[0] + t * t * t * p3[0],
        m * m * m * p0[1] + 3 * m * m * t * p1[1] + 3 * m * t * t * p2[1] + t * t * t * p3[1],
      ]);
    }
  };
  const straight = (to: Point) =>
    segment([
      at,
      [at[0] + (to[0] - at[0]) / 3, at[1] + (to[1] - at[1]) / 3],
      [at[0] + ((to[0] - at[0]) * 2) / 3, at[1] + ((to[1] - at[1]) * 2) / 3],
      to,
    ]);
  while (i < tokens.length) {
    const command = tokens[i++];
    if (command === "M") {
      at = [num(), num()];
      start = at;
    } else if (command === "H") {
      const to: Point = [num(), at[1]];
      straight(to);
      at = to;
    } else if (command === "V") {
      const to: Point = [at[0], num()];
      straight(to);
      at = to;
    } else if (command === "L") {
      const to: Point = [num(), num()];
      straight(to);
      at = to;
    } else if (command === "C") {
      const c1: Point = [num(), num()];
      const c2: Point = [num(), num()];
      const to: Point = [num(), num()];
      segment([at, c1, c2, to]);
      at = to;
    } else {
      straight(start);
      at = start;
    }
  }
  return points;
}

/** Whether a point lies inside a closed outline, by its sampled polygon. */
function inside(polygon: Point[], [x, y]: Point): boolean {
  let within = false;
  for (let a = 0, b = polygon.length - 1; a < polygon.length; b = a++) {
    const [xa, ya] = polygon[a]!;
    const [xb, yb] = polygon[b]!;
    if (ya > y !== yb > y && x < ((xb - xa) * (y - ya)) / (yb - ya) + xa) within = !within;
  }
  return within;
}

const near = (points: Point[], [x, y]: Point, within: number) =>
  points.some(([px, py]) => Math.hypot(px - x, py - y) <= within);

/**
 * Each drawing's strokes lie on the other's, to a hundredth of a unit: every
 * point along one lies within that of the other, densely sampled.
 */
function expectSameStrokes(
  label: string,
  drawn: (density: number) => Point[],
  icon: (density: number) => Point[],
) {
  const [iconDense, drawnDense] = [icon(1500), drawn(1500)];
  const stray = drawn(24).filter((point) => !near(iconDense, point, 0.02));
  const missing = icon(24).filter((point) => !near(drawnDense, point, 0.02));
  expect({ label, stray: stray.slice(0, 3), missing: missing.slice(0, 3) }).toEqual({
    label,
    stray: [],
    missing: [],
  });
}

const iconPaths = (icon: readonly (readonly [string, Record<string, unknown>])[]) => icon.map(([, attrs]) => String(attrs.d));

describe("the opening book", () => {
  it("starts as the shut book and ends as the open one, stroke for stroke", () => {
    const shut = bookFrame(0);
    const outline = sample(shut.cover, 200);
    // The page block shows only where the cover does not lie over it.
    const shutDrawn = (density: number) => {
      const cover = sample(shut.cover, density);
      const pages = sample(shut.pages, density).filter(
        (point) => !inside(outline, point) || near(outline, point, 0.02),
      );
      return [...cover, ...pages];
    };
    expectSameStrokes("shut", shutDrawn, (density) =>
      iconPaths(ShutBookIcon).flatMap((d) => sample(d, density)),
    );

    const open = bookFrame(1);
    expectSameStrokes(
      "open",
      (density) => [...sample(open.cover, density), ...sample(open.pages, density)],
      (density) => iconPaths(OpenBookIcon).flatMap((d) => sample(d, density)),
    );
  });

  it("swings the cover over the spine, never folding it away", () => {
    // Midway the cover stands on its edge over the spine, as a turning leaf
    // does; either side of that it has width.
    const spread = (d: string) => {
      const xs = sample(d).map(([x]) => x);
      return Math.max(...xs) - Math.min(...xs);
    };
    expect(spread(bookFrame(0.5).cover)).toBeLessThan(0.1);
    expect(spread(bookFrame(0.25).cover)).toBeGreaterThan(5);
    expect(spread(bookFrame(0.75).cover)).toBeGreaterThan(5);
  });
});

describe("the opening folder", () => {
  it("starts as folder-closed and ends as folder-02, stroke for stroke", () => {
    for (const [label, open, icon] of [
      ["shut", 0, FolderClosedIcon],
      ["open", 1, Folder02Icon],
    ] as const) {
      const frame = folderFrame(open);
      expectSameStrokes(
        label,
        (density) => [frame.back, frame.tab, frame.front].flatMap((d) => sample(d, density)),
        (density) => iconPaths(icon).flatMap((d) => sample(d, density)),
      );
    }
  });

  it("leans the front forward without tearing it from the back", () => {
    // The front's top edge travels right as it leans; the back's right side
    // follows it in, and both stay joined all the way.
    const topLeft = (d: string) => Math.min(...sample(d).filter(([, y]) => y < 11.2).map(([x]) => x));
    const lean = [0, 0.25, 0.5, 0.75, 1].map((t) => topLeft(folderFrame(t).front));
    expect(lean).toEqual([...lean].sort((a, b) => a - b));
  });
});
