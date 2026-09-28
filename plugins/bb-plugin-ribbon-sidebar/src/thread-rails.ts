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

// Beyond any row: the SVG that draws the tree clips its lines to the row.
const FAR = 10000;
const RING_RADIUS = 6.5;
// A hollow node 5px across stands in for a hidden ring.
const NODE_RADIUS = 2.5;
const CORNER = 6;

/**
 * SVG paths for the tree beside a thread row, in pixels across the row and
 * down from the stage ring's centre. Each child branches off its parent's line
 * into its ring's edge, and a parent's line drops from its ring. While a ring
 * is hidden, the lines run on into a small hollow node at its centre instead.
 */
export function treeLines({
  depth,
  lastAtDepth,
  showsChildren,
  ring,
}: {
  depth: number;
  /** For each depth from 1 through `depth`, whether this row's ancestor there (itself, last) is the last of its siblings. */
  lastAtDepth: readonly boolean[];
  showsChildren: boolean;
  ring: "shown" | "hidden-at-rest" | "absent";
}): {
  always: string;
  whileRingHidden: string;
  node: { cx: number; cy: number } | null;
} {
  // A 1px line sits half a pixel right of its column and below the centre line.
  const line = (level: number) => 16 + 24 * level + 0.5;
  const y = 0.5;
  let always = "";
  let toNode = "";
  for (let level = 0; level < depth - 1; level += 1) {
    if (!lastAtDepth[level]) always += `M${line(level)} -${FAR}V${FAR}`;
  }
  if (depth > 0) {
    const x = line(depth - 1);
    const ringEdge = line(depth) - 0.5 - RING_RADIUS;
    always += lastAtDepth[depth - 1]
      ? `M${x} -${FAR}`
      : `M${x} -${FAR}V${FAR}M${x} ${y - CORNER}`;
    if (lastAtDepth[depth - 1]) always += `V${y - CORNER}`;
    always += `Q${x} ${y} ${x + CORNER} ${y}H${ringEdge}`;
    toNode += `M${ringEdge} ${y}H${line(depth) - NODE_RADIUS}`;
  }
  if (showsChildren) {
    always += `M${line(depth)} ${RING_RADIUS}V${FAR}`;
    toNode += `M${line(depth)} ${y + NODE_RADIUS}V${RING_RADIUS}`;
  }
  if (ring === "shown" || !toNode) return { always, whileRingHidden: "", node: null };
  const node = { cx: line(depth), cy: y };
  return ring === "absent"
    ? { always: always + toNode, whileRingHidden: "", node }
    : { always, whileRingHidden: toNode, node };
}
