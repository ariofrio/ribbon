/** Where a rail segment starts or stops within its row. */
export type RailEdge = "row-top" | "ring-top" | "ring-bottom" | "row-bottom";

// A stage ring is 13px across, and the bar stops 2.5px short of it.
const RING_CLEARANCE = "9px";

/** CSS `top` for each edge a segment can start at, given `--ribbon-ring-y`. */
export const RAIL_EDGE_TOP = {
  "row-top": "0",
  "ring-top": `calc(var(--ribbon-ring-y) - ${RING_CLEARANCE})`,
  "ring-bottom": `calc(var(--ribbon-ring-y) + ${RING_CLEARANCE})`,
} as const;

/** CSS `bottom` for each edge a segment can stop at, given `--ribbon-ring-y`. */
export const RAIL_EDGE_BOTTOM = {
  "ring-top": `calc(100% - var(--ribbon-ring-y) + ${RING_CLEARANCE})`,
  "ring-bottom": `calc(100% - var(--ribbon-ring-y) - ${RING_CLEARANCE})`,
  // Across the pixel between this row and the next.
  "row-bottom": "-1px",
} as const;

export interface RailSegment {
  /** Depth of the sibling group whose bar this is; the bar runs through that depth's ring column. */
  level: number;
  from: keyof typeof RAIL_EDGE_TOP;
  to: keyof typeof RAIL_EDGE_BOTTOM;
  /** Drawn only while the row's stage ring is hidden, so the ring never sits on the bar. */
  whileRingHidden?: boolean;
}

/**
 * The bars beside a thread row. A group of child threads gets one bar in the
 * children's own ring column, running from the first child's ring to the last
 * row of the group. Shown rings are threaded onto it, and a hidden ring's slot
 * is simply the bar.
 */
export function railSegments({
  depth,
  firstChild,
  endsGroup,
  ring,
}: {
  depth: number;
  firstChild: boolean;
  /** For each depth from 1 through `depth`, whether that group's last row is this one. */
  endsGroup: readonly boolean[];
  ring: "shown" | "hidden-at-rest" | "absent";
}): RailSegment[] {
  const segments: RailSegment[] = [];
  for (let level = 1; level < depth; level += 1) {
    segments.push({
      level,
      from: "row-top",
      to: endsGroup[level - 1] ? "ring-bottom" : "row-bottom",
    });
  }
  if (depth === 0) return segments;
  if (!firstChild) segments.push({ level: depth, from: "row-top", to: "ring-top" });
  if (ring === "hidden-at-rest") {
    segments.push({
      level: depth,
      from: "ring-top",
      to: "ring-bottom",
      whileRingHidden: true,
    });
  } else if (ring === "absent") {
    segments.push({ level: depth, from: "ring-top", to: "ring-bottom" });
  }
  if (!endsGroup[depth - 1]) {
    segments.push({ level: depth, from: "ring-bottom", to: "row-bottom" });
  }
  return segments;
}
