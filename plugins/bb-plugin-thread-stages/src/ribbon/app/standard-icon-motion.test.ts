import { FolderClosedIcon } from "@hugeicons/core-free-icons";
import { describe, expect, it } from "vitest";
import { type IconFrame, bookFrame, folderFrame } from "./standard-icon-motion";

const strokes = (layer: IconFrame["layers"][number]) => layer.d;

type Point = [number, number];

/** Points along every stroke of an absolute M/H/V/L/Q/C/Z path. */
function sample(d: string, per = 24): Point[] {
  const tokens = d.match(/[MHVLQCZ]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
  const points: Point[] = [];
  let at: Point = [0, 0];
  let start: Point = [0, 0];
  let i = 0;
  const num = () => Number(tokens[i++]);
  const curve = (controls: Point[]) => {
    const all = [at, ...controls];
    // Densely enough that no two points lie more than a tenth apart.
    const reach = all.slice(1).reduce((sum, p, j) => sum + Math.hypot(p[0] - all[j]![0], p[1] - all[j]![1]), 0);
    const steps = Math.max(per, Math.ceil(reach / 0.1));
    for (let k = 1; k <= steps; k += 1) {
      let row = all;
      while (row.length > 1) {
        row = row.slice(1).map((p, j) => {
          const q = row[j]!;
          return [q[0] + (p[0] - q[0]) * (k / steps), q[1] + (p[1] - q[1]) * (k / steps)] as Point;
        });
      }
      points.push(row[0]!);
    }
    at = controls.at(-1)!;
  };
  while (i < tokens.length) {
    const command = tokens[i++];
    if (command === "M") {
      at = [num(), num()];
      start = at;
      points.push(at);
    } else if (command === "H") curve([[num(), at[1]]]);
    else if (command === "V") curve([[at[0], num()]]);
    else if (command === "L") curve([[num(), num()]]);
    else if (command === "Q") curve([[num(), num()], [num(), num()]]);
    else if (command === "C") curve([[num(), num()], [num(), num()], [num(), num()]]);
    else curve([start]);
  }
  return points;
}

const bounds = (d: string) => {
  const points = sample(d);
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
};

/** Points along every stroke. */
const drawnAt = (frame: IconFrame) => frame.layers.flatMap((layer) => sample(layer.d, 12));

/** How far the furthest stroke of one frame lies from the other's. */
function apart(a: IconFrame, b: IconFrame): number {
  const [p, q] = [drawnAt(a), drawnAt(b)];
  const far = (from: Point[], to: Point[]) => {
    const cells = new Map<string, Point[]>();
    const cell = (x: number, y: number) => `${Math.floor(x)},${Math.floor(y)}`;
    for (const t of to) cells.set(cell(...t), [...(cells.get(cell(...t)) ?? []), t]);
    return Math.max(
      ...from.map(([x, y]) => {
        const near = [-1, 0, 1].flatMap((dx) => [-1, 0, 1].flatMap((dy) => cells.get(cell(x + dx, y + dy)) ?? []));
        return Math.min(1, ...near.map(([tx, ty]) => Math.hypot(tx - x, ty - y)));
      }),
    );
  };
  return Math.max(far(p, q), far(q, p));
}

describe.each([
  ["book", bookFrame],
  ["folder", folderFrame],
])("the standard %s", (_, frame) => {
  it("sets off and comes to rest without a jump", () => {
    expect(apart(frame(0), frame(0.002))).toBeLessThan(0.1);
    expect(apart(frame(1), frame(0.998))).toBeLessThan(0.1);
  });
});

describe("the standard book", () => {
  it("keeps one size while it opens: the bottom page lies still", () => {
    // The bottom page, apart from bowing into the gutter, is the same object
    // shut and open, so it is drawn the same width.
    const width = (open: number) => {
      const { left, right } = bounds(strokes(bookFrame(open).layers.at(-1)!));
      return right - left;
    };
    expect(Math.abs(width(1) - width(0))).toBeLessThan(0.05);
  });

  it("stands the top page on its edge halfway, then lays it down on the left", () => {
    const upper = (open: number) => bounds(strokes(bookFrame(open).layers[0]!));
    const lower = bounds(strokes(bookFrame(0.5).layers.at(-1)!));
    expect(upper(0.5).right - upper(0.5).left).toBeLessThan(4);
    // It rises above the lying page as it stands.
    expect(upper(0.5).top).toBeLessThan(lower.top - 2);
    expect(upper(1).right).toBeLessThanOrEqual(bounds(strokes(bookFrame(1).layers.at(-1)!)).left + 0.5);
  });

  it("rounds its spine while shut, and flattens it into the gutter open", () => {
    // Shut, the spine bulges out past the pages' spine edges.
    const spine = (open: number) => bounds(strokes(bookFrame(open).layers[1]!));
    const pages = bounds(strokes(bookFrame(0).layers.at(-1)!));
    expect(pages.left - spine(0).left).toBeGreaterThan(1.5);
    // Open, it is gone into the fold between the pages.
    const spread = bookFrame(1);
    expect(sample(strokes(spread.layers[1]!))).toEqual([]);
    expect(bounds(strokes(spread.layers[0]!)).right).toBeCloseTo(bounds(strokes(spread.layers.at(-1)!)).left, 0);
  });

  it("hides what the top page covers", () => {
    expect(bookFrame(0.25).layers[0]!.covers).not.toBe("");
  });
});

describe("the standard folder", () => {
  it("is folder-closed when shut", () => {
    const drawn = folderFrame(0).layers.flatMap((layer) => sample(strokes(layer), 48));
    const icon = FolderClosedIcon.flatMap(([, attributes]) => sample(attributes.d as string, 48));
    // Every stroke of the icon is drawn, give or take its rounded joins.
    const off = icon.filter(
      ([x, y]) => !drawn.some(([px, py]) => Math.hypot(px - x, py - y) < 0.6),
    );
    expect(off).toEqual([]);
  });

  it("lets the front fall forward: its top edge drops and slants toward the viewer", () => {
    const front = [0, 0.25, 0.5, 0.75, 1].map((open) => bounds(strokes(folderFrame(open).layers[0]!)));
    for (let i = 1; i < front.length; i += 1) {
      expect(front[i]!.top).toBeGreaterThan(front[i - 1]!.top);
      expect(front[i]!.right).toBeGreaterThan(front[i - 1]!.right);
    }
    // The back stays put.
    const back = [0, 1].map((open) => bounds(strokes(folderFrame(open).layers[1]!)));
    expect(back[1]).toEqual(back[0]);
  });

  it("hides the back wherever the front is over it", () => {
    for (const open of [0, 0.5, 1]) {
      expect(folderFrame(open).layers[0]!.covers).not.toBe("");
    }
  });
});
