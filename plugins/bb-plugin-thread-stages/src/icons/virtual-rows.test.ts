import { describe, expect, it } from "vitest";
import {
  ROW_HEIGHT,
  chunkRows,
  gridHeight,
  rowCountFor,
  sameRange,
  visibleRows,
} from "./virtual-rows";

const NO_OVERSCAN = 0;

describe("gridHeight", () => {
  it("is the rows less the gap the last row does not carry", () => {
    expect(gridHeight(0)).toBe(0);
    expect(gridHeight(1)).toBe(ROW_HEIGHT - 4);
    expect(gridHeight(3)).toBe(3 * ROW_HEIGHT - 4);
  });

  it("counts a part-full row", () => {
    expect(rowCountFor(11)).toBe(1);
    expect(rowCountFor(12)).toBe(2);
    expect(rowCountFor(0)).toBe(0);
  });
});

describe("visibleRows", () => {
  it("draws the rows a viewport covers", () => {
    // A grid at the top of a 320px viewport: ten rows fit.
    expect(visibleRows(0, 320, 40, NO_OVERSCAN)).toEqual({ start: 0, end: 10 });
  });

  it("follows the grid as it scrolls past the top", () => {
    expect(visibleRows(-320, 320, 40, NO_OVERSCAN)).toEqual({
      start: 10,
      end: 20,
    });
  });

  it("draws nothing for a grid far below the viewport", () => {
    expect(visibleRows(5000, 320, 40, NO_OVERSCAN)).toEqual({
      start: 0,
      end: 0,
    });
  });

  it("draws nothing for a grid scrolled far above it", () => {
    expect(visibleRows(-5000, 320, 40, NO_OVERSCAN)).toEqual({
      start: 40,
      end: 40,
    });
  });

  it("never runs past the rows it has", () => {
    const range = visibleRows(0, 4000, 3, NO_OVERSCAN);
    expect(range.end).toBeLessThanOrEqual(3);
    expect(range.start).toBeGreaterThanOrEqual(0);
  });

  it("reaches beyond the viewport by the overscan, so a flick lands on icons", () => {
    const tight = visibleRows(0, 320, 40, NO_OVERSCAN);
    const eased = visibleRows(0, 320, 40, 320);
    expect(eased.end).toBeGreaterThan(tight.end);
  });
});

describe("chunkRows", () => {
  it("fills rows to the column count, last row short", () => {
    expect(chunkRows([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("has no rows for no entries", () => {
    expect(chunkRows([], 11)).toEqual([]);
  });
});

describe("sameRange", () => {
  it("tells an unchanged window from a moved one", () => {
    expect(sameRange({ start: 1, end: 4 }, { start: 1, end: 4 })).toBe(true);
    expect(sameRange({ start: 1, end: 4 }, { start: 2, end: 4 })).toBe(false);
  });
});
