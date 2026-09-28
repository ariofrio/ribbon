import { FolderClosedIcon } from "@hugeicons/core-free-icons";
import { describe, expect, it } from "vitest";
import { bookFrame, folderFrame } from "./standard-icon-motion";

type Point = [number, number];

/** Points along every stroke of an absolute M/H/V/L/Q/C/Z path. */
function sample(d: string, per = 24): Point[] {
  const tokens = d.match(/[MHVLQCZ]|-?\d*\.?\d+(?:e-?\d+)?/g)!;
  const points: Point[] = [];
  let at: Point = [0, 0];
  let start: Point = [0, 0];
  let i = 0;
  const num = () => Number(tokens[i++]);
  const curve = (controls: Point[]) => {
    const all = [at, ...controls];
    for (let k = 1; k <= per; k += 1) {
      let row = all;
      while (row.length > 1) {
        row = row.slice(1).map((p, j) => {
          const q = row[j]!;
          return [q[0] + (p[0] - q[0]) * (k / per), q[1] + (p[1] - q[1]) * (k / per)] as Point;
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

describe("the standard book", () => {
  it("keeps one size while it opens: the lower half lies still", () => {
    // The lower half, apart from its pages bowing into the gutter, is the
    // same object shut and open, so it is drawn the same width.
    const width = (open: number) => {
      const { left, right } = bounds(bookFrame(open).layers[1]!.d);
      return right - left;
    };
    expect(Math.abs(width(1) - width(0))).toBeLessThan(0.05);
  });

  it("stands the turning half on its edge halfway, then lays it down on the left", () => {
    const upper = (open: number) => bounds(bookFrame(open).layers[0]!.d);
    const lower = bounds(bookFrame(0.5).layers[1]!.d);
    expect(upper(0.5).right - upper(0.5).left).toBeLessThan(4);
    // It rises above the lying half as it stands.
    expect(upper(0.5).top).toBeLessThan(lower.top - 2);
    expect(upper(1).right).toBeLessThanOrEqual(bounds(bookFrame(1).layers[1]!.d).left + 0.5);
  });

  it("hides what the turning half covers", () => {
    expect(bookFrame(0.25).layers[0]!.covers).not.toBe("");
  });
});

describe("the standard folder", () => {
  it("is folder-closed when shut", () => {
    const drawn = folderFrame(0).layers.flatMap((layer) => sample(layer.d, 48));
    const icon = FolderClosedIcon.flatMap(([, attributes]) => sample(attributes.d as string, 48));
    // Every stroke of the icon is drawn, give or take its rounded joins.
    const off = icon.filter(
      ([x, y]) => !drawn.some(([px, py]) => Math.hypot(px - x, py - y) < 0.6),
    );
    expect(off).toEqual([]);
  });

  it("lets the front fall forward: its top edge drops and slants toward the viewer", () => {
    const front = [0, 0.25, 0.5, 0.75, 1].map((open) => bounds(folderFrame(open).layers[0]!.d));
    for (let i = 1; i < front.length; i += 1) {
      expect(front[i]!.top).toBeGreaterThan(front[i - 1]!.top);
      expect(front[i]!.right).toBeGreaterThan(front[i - 1]!.right);
    }
    // The back stays put.
    const back = [0, 1].map((open) => bounds(folderFrame(open).layers[1]!.d));
    expect(back[1]).toEqual(back[0]);
  });

  it("hides the back wherever the front is over it", () => {
    for (const open of [0, 0.5, 1]) {
      expect(folderFrame(open).layers[0]!.covers).not.toBe("");
    }
  });
});
