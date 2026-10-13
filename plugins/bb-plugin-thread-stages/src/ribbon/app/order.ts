import type { ThreadComparator } from "../../app/model/project-thread-groups.js";
import type { SidebarThread } from "../../app/model/sidebar-thread.js";
import type { ChildRank } from "../child-order";
import type { OrderGroupingKey, PlacementRecordV1 } from "../placement-store";
import type { OrganizationMode } from "../../shared/preferences.js";
import { compareByCreatedAtDescending } from "../../app/model/project-thread-groups.js";

/** The placement grouping whose ranks order roots in each organization. */
export function placementGroupingKey(
  mode: OrganizationMode,
): OrderGroupingKey {
  if (mode === "chronological") return "builtin:sections";
  if (mode === "project") return "builtin:projects";
  return "builtin:machines";
}

/** Rank by thread id, from a grouping's placements in their listed order. */
export function placementRanks(
  placements: readonly PlacementRecordV1[],
): ReadonlyMap<string, number> {
  return new Map(placements.map(({ threadId }, index) => [threadId, index]));
}

/**
 * Ribbon's order: a root sits where its placement rank puts it, a child where
 * its saved sibling rank puts it, and anything not yet ranked enters at the
 * top, newest first. Siblings share a parent, so one comparator serves both;
 * a rank saved under a former parent does not apply.
 */
export function createRibbonComparator(
  rootRanks: ReadonlyMap<string, number>,
  childRanks: readonly ChildRank[],
): ThreadComparator {
  const childPosition = new Map<string, number>();
  for (const [index, rank] of childRanks.entries()) {
    childPosition.set(`${rank.parentThreadId}\n${rank.threadId}`, index);
  }
  // Placements rank roots only, and a root whose parent is not live still
  // has one; child ranks cover the rest.
  const rankOf = (thread: SidebarThread): number | undefined =>
    rootRanks.get(thread.id) ??
    (thread.parentThreadId === null
      ? undefined
      : childPosition.get(`${thread.parentThreadId}\n${thread.id}`));
  return (left, right) => {
    const leftRank = rankOf(left);
    const rightRank = rankOf(right);
    if (leftRank === undefined && rightRank === undefined) {
      return compareByCreatedAtDescending(left, right);
    }
    if (leftRank === undefined) return -1;
    if (rightRank === undefined) return 1;
    return leftRank - rightRank;
  };
}
