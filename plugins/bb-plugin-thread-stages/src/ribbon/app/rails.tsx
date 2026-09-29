import { createContext, useContext, useMemo, type ReactNode } from "react";
import {
  RAIL_EDGE_BOTTOM,
  RAIL_EDGE_TOP,
  railSegments,
  treeLines,
} from "./thread-rails";

/**
 * Where a row sits among its siblings and its ancestors among theirs, which
 * is all the lines beside it need to know. Provided by whatever renders a
 * list of siblings; roots have no lineage.
 */
export interface RowLineage {
  firstChild: boolean;
  /** For each depth from 1 through the row's, whether the ancestor there (the row itself, last) is the last of its siblings. */
  lastAtDepth: readonly boolean[];
}

const ROOT_LINEAGE: RowLineage = { firstChild: false, lastAtDepth: [] };
const LineageContext = createContext<RowLineage>(ROOT_LINEAGE);

export function useRowLineage(): RowLineage {
  return useContext(LineageContext);
}

/** Wraps one child of a list: the `index`th of `count` siblings. */
export function SiblingLineage({
  index,
  count,
  children,
}: {
  index: number;
  count: number;
  children: ReactNode;
}) {
  const parent = useContext(LineageContext);
  const value = useMemo<RowLineage>(
    () => ({
      firstChild: index === 0,
      lastAtDepth: [...parent.lastAtDepth, index === count - 1],
    }),
    [count, index, parent.lastAtDepth],
  );
  return <LineageContext.Provider value={value}>{children}</LineageContext.Provider>;
}

export type RingState = "shown" | "hidden-at-rest" | "absent";

// Hides what stands in for a stage ring while the ring shows: on hover, on
// keyboard focus, and always under a coarse pointer.
const UNTIL_RING_SHOWS =
  "group-hover/thread-row:opacity-0 group-has-[:focus-visible]/thread-row:opacity-0 pointer-coarse:opacity-0";

/** The bars beside a child row: one per sibling group, through its ring column. */
export function RailBars({
  depth,
  lineage,
  ring,
  showsChildren,
}: {
  depth: number;
  lineage: RowLineage;
  ring: RingState;
  showsChildren: boolean;
}) {
  return (
    <>
      {railSegments({
        depth,
        firstChild: lineage.firstChild,
        endsGroup: lineage.lastAtDepth.map(
          (_, index) =>
            !showsChildren && lineage.lastAtDepth.slice(index).every(Boolean),
        ),
        ring,
      }).map(({ level, from, to, whileRingHidden }) => (
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute z-[1] w-px bg-border-hairline opacity-70 ${
            whileRingHidden ? UNTIL_RING_SHOWS : ""
          }`}
          data-ribbon-sidebar-rail={level}
          key={`${level}:${from}`}
          style={{
            left: 16 + level * 24,
            top: RAIL_EDGE_TOP[from],
            bottom: RAIL_EDGE_BOTTOM[to],
          }}
        />
      ))}
    </>
  );
}

/** The tree beside a child row: a branch from its parent's line into its ring. */
export function RailTree({
  depth,
  lineage,
  ring,
  showsChildren,
}: {
  depth: number;
  lineage: RowLineage;
  ring: RingState;
  showsChildren: boolean;
}) {
  const { always, whileRingHidden, node } = treeLines({
    depth,
    lastAtDepth: lineage.lastAtDepth,
    showsChildren,
    ring,
  });
  if (!always && !node) return null;
  // A 5px hollow node: radius 2 with a 1px stroke.
  const nodeCircle = node ? <circle cx={node.cx} cy={node.cy} r={2} /> : null;
  return (
    <svg
      aria-hidden="true"
      // bb keeps 2px between rows; the line runs on that far to meet the next.
      className="pointer-events-none absolute left-0 top-0 z-[1] h-full overflow-visible text-border-hairline opacity-70 [clip-path:inset(0_0_-2px_0)]"
      data-ribbon-sidebar-tree=""
      width={24 + 24 * depth}
    >
      <g
        fill="none"
        stroke="currentColor"
        style={{ transform: "translateY(var(--ribbon-ring-y))" }}
      >
        {always ? <path d={always} /> : null}
        {ring === "absent" ? nodeCircle : null}
        {ring === "hidden-at-rest" ? (
          <g className={UNTIL_RING_SHOWS}>
            <path d={whileRingHidden} />
            {nodeCircle}
          </g>
        ) : null}
      </g>
    </svg>
  );
}
