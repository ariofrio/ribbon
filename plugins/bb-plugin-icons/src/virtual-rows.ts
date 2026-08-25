/** Icons per row on a roomy viewport, and the height one row occupies. */
export const GRID_COLUMNS = 11;
export const GRID_ITEM_SIZE = 28;
export const GRID_GAP = 4;
/** A 28px button plus the grid's 4px gap. */
export const ROW_HEIGHT = GRID_ITEM_SIZE + GRID_GAP;
/**
 * How far beyond the viewport a row is still worth drawing. A little over one
 * popover's worth, so a flick of the wheel lands on icons rather than on gaps.
 */
export const ROW_OVERSCAN = 160;

export interface RowRange {
  start: number;
  end: number;
}

/** The height a grid occupies, whether or not its rows are drawn. */
export function gridHeight(rowCount: number): number {
  return rowCount === 0 ? 0 : rowCount * ROW_HEIGHT - GRID_GAP;
}

/** Mirrors `repeat(auto-fill, 1.75rem)` for the grid's measured width. */
export function columnCountFor(availableWidth: number): number {
  return Math.max(
    1,
    Math.floor((availableWidth + GRID_GAP) / (GRID_ITEM_SIZE + GRID_GAP)),
  );
}

export function rowCountFor(entryCount: number, columns = GRID_COLUMNS): number {
  return Math.ceil(entryCount / columns);
}

/**
 * Which rows of one grid fall near the scroller's viewport.
 *
 * `gridTop` is the grid's top in the scroller's own coordinates — how far
 * below the visible top edge it begins, negative once it has scrolled past.
 * Everything is clamped to the grid, so a grid entirely out of view returns an
 * empty range rather than a negative one.
 */
export function visibleRows(
  gridTop: number,
  viewportHeight: number,
  rowCount: number,
  overscan = ROW_OVERSCAN,
): RowRange {
  const first = Math.floor((-gridTop - overscan) / ROW_HEIGHT);
  const last = Math.ceil((-gridTop + viewportHeight + overscan) / ROW_HEIGHT);
  const start = Math.min(Math.max(first, 0), rowCount);
  const end = Math.min(Math.max(last, 0), rowCount);
  return { start, end: Math.max(start, end) };
}

export function sameRange(left: RowRange, right: RowRange): boolean {
  return left.start === right.start && left.end === right.end;
}

/** Splits a category's icons into rows, so only some of them need drawing. */
export function chunkRows<T>(entries: readonly T[], columns = GRID_COLUMNS): T[][] {
  const rows: T[][] = [];
  for (let index = 0; index < entries.length; index += columns) {
    rows.push(entries.slice(index, index + columns));
  }
  return rows;
}
