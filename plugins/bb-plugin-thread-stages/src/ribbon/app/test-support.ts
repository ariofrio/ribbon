import type { ChildRank } from "../child-order";
import type { PlacementRecordV1 } from "../placement-store";
import type { ThreadActionsRecord } from "../thread-actions-store";
import { createGroupingCatalog, THREAD_STAGES_GROUPING_KEY } from "../workflow/catalog";

/**
 * RPC doubles for the Ribbon data provider, for slot tests that render the
 * list with bb's own thread fixtures. Placements default to every root Idle in
 * whatever order the list already has, so a test that says nothing about
 * stages sees bb's list with rings.
 */
export function ribbonRpcStubs({
  placements = {},
  stages = [],
  childRanks = [],
  threadActions = [],
}: {
  placements?: Partial<Record<"builtin:sections" | "builtin:projects", readonly string[]>>;
  stages?: readonly Pick<PlacementRecordV1, "threadId" | "groupId" | "enteredAtMs">[];
  childRanks?: readonly ChildRank[];
  threadActions?: readonly ThreadActionsRecord[];
} = {}) {
  const snapshot = () => ({
    groupings: [
      {
        ...createGroupingCatalog({}).groupings[0]!,
        groupingKey: THREAD_STAGES_GROUPING_KEY,
        available: true,
        membershipWritable: true,
      },
    ],
  });
  const rows = (groupingKey: string): PlacementRecordV1[] => {
    if (groupingKey === THREAD_STAGES_GROUPING_KEY) {
      return stages.map((stage) => ({
        groupingKey: groupingKey as PlacementRecordV1["groupingKey"],
        ...stage,
        origin: "ui" as const,
      }));
    }
    const ordered = placements[groupingKey as "builtin:sections"] ?? [];
    return ordered.map((threadId) => ({
      groupingKey: groupingKey as PlacementRecordV1["groupingKey"],
      groupId: "unsectioned",
      threadId,
      enteredAtMs: null,
    }));
  };
  return {
    synchronizeV1: () => snapshot(),
    sidebarSnapshotV1: () => snapshot(),
    listPlacementsV1: (input: unknown) => {
      const { groupingKey } = input as { groupingKey: string };
      return {
        ok: true,
        value: { groupingKey, revision: 1, items: rows(groupingKey) },
      };
    },
    listChildOrderV1: () => ({ items: childRanks }),
    listThreadActionsV1: () => ({ threads: threadActions }),
    pullRequestDetailsV1: () => ({ details: [] }),
    updatePlacementV1: (input: unknown) => ({
      ok: true,
      value: {
        placement: {
          ...(input as { groupingKey: string; groupId: string; threadId: string }),
          enteredAtMs: Date.now(),
        },
        revision: 2,
      },
    }),
    reorderChildrenV1: () => ({ ok: true }),
  };
}
