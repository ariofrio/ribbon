import { useCallback, useMemo } from "react";
import type { SidebarThread } from "../../app/model/sidebar-thread.js";
import type { SidebarReorderPlacement } from "../../app/rows/sidebarThreadRowDroppable.js";
import type { OrganizationMode } from "../../shared/preferences.js";
import { moveChild } from "../child-order";
import { THREAD_STAGES_GROUPING_KEY } from "../workflow/catalog";
import type { WorkflowStage } from "../workflow/workflow-stage";
import { bandOf } from "./bands";
import { useRibbonData, type PlacementAnchor } from "./data";
import { placementGroupingKey } from "./order";

/** Where a dragged row is let go, relative to the row under the pointer. */
export interface ThreadDropAnchor {
  thread: SidebarThread;
  placement: SidebarReorderPlacement;
}

/**
 * What Ribbon decides about a drop that bb's list resolves: whether two rows
 * may trade places, where a root lands in another group, and what to write.
 * bb's own decisions — nesting, pinning, section membership — stay bb's.
 */
export interface RibbonDndHandlers {
  /** Whether `active` may be dropped before or after `over` as its sibling. */
  canReorder(active: SidebarThread, over: SidebarThread): boolean;
  /** Persists a sibling reorder: a root's rank in its group, or a child's among its siblings. */
  onReorderThread(
    active: SidebarThread,
    anchor: ThreadDropAnchor,
    siblingIds: readonly string[],
  ): Promise<void>;
  /**
   * Moves a root into another section, at the anchor or at the group's edge.
   * Returns false where Ribbon has nothing to say, so bb's own move applies.
   */
  onMoveThread(
    active: SidebarThread,
    groupId: string | null,
    anchor: ThreadDropAnchor | { edge: "start" | "end" },
  ): Promise<boolean>;
}

/** Roots move within their band only. */
export function sameReorderableBand(
  activeStage: WorkflowStage,
  overStage: WorkflowStage,
): boolean {
  const band = bandOf(activeStage);
  return band === bandOf(overStage);
}

export function useRibbonDnd(mode: OrganizationMode): RibbonDndHandlers | null {
  const ribbon = useRibbonData();
  const groupingKey = placementGroupingKey(mode);
  const stageOf = ribbon?.stageOf;
  const updatePlacement = ribbon?.updatePlacement;
  const reorderChildren = ribbon?.reorderChildren;

  const canReorder = useCallback<RibbonDndHandlers["canReorder"]>(
    (active, over) => {
      if (!stageOf) return false;
      if (active.parentThreadId !== over.parentThreadId) return false;
      if (active.parentThreadId !== null) return true;
      return sameReorderableBand(stageOf(active.id), stageOf(over.id));
    },
    [stageOf],
  );

  const onReorderThread = useCallback<RibbonDndHandlers["onReorderThread"]>(
    async (active, anchor, siblingIds) => {
      if (!updatePlacement || !reorderChildren) return;
      if (active.parentThreadId !== null) {
        const beforeId =
          anchor.placement === "before"
            ? anchor.thread.id
            : (siblingIds[siblingIds.indexOf(anchor.thread.id) + 1] ?? null);
        const order = moveChild(siblingIds, active.id, beforeId);
        if (order) await reorderChildren(active.parentThreadId, order);
        return;
      }
      const stage = stageOf?.(active.id) ?? "Active";
      const reorderGrouping = bandOf(stage) !== "main"
        ? THREAD_STAGES_GROUPING_KEY
        : groupingKey;
      if (reorderGrouping === null) return;
      const groupId =
        reorderGrouping === THREAD_STAGES_GROUPING_KEY
          ? stage
          : reorderGrouping === "builtin:projects"
            ? anchor.thread.projectId
            : (anchor.thread.sectionId ?? "unsectioned");
      await updatePlacement(active.id, reorderGrouping, groupId, {
        kind: anchor.placement,
        threadId: anchor.thread.id,
      });
    },
    [groupingKey, reorderChildren, stageOf, updatePlacement],
  );

  const onMoveThread = useCallback<RibbonDndHandlers["onMoveThread"]>(
    async (active, groupId, anchor) => {
      // Section membership is the one Ribbon writes; a project's is bb's.
      if (!updatePlacement || groupingKey !== "builtin:sections") return false;
      if (active.parentThreadId !== null || active.pinnedAt !== null) return false;
      const placementAnchor: PlacementAnchor =
        "edge" in anchor
          ? { kind: anchor.edge }
          : { kind: anchor.placement, threadId: anchor.thread.id };
      await updatePlacement(
        active.id,
        groupingKey,
        groupId ?? "unsectioned",
        placementAnchor,
      );
      if (
        stageOf && bandOf(stageOf(active.id)) !== "main" &&
        ("edge" in anchor || stageOf(anchor.thread.id) === stageOf(active.id))
      ) {
        await updatePlacement(
          active.id, THREAD_STAGES_GROUPING_KEY, stageOf(active.id), placementAnchor,
        );
      }
      return true;
    },
    [groupingKey, stageOf, updatePlacement],
  );

  return useMemo(
    () =>
      ribbon === null
        ? null
        : { canReorder, onReorderThread, onMoveThread },
    [canReorder, onMoveThread, onReorderThread, ribbon],
  );
}
