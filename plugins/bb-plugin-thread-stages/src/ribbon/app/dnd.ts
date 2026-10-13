import { useCallback, useMemo } from "react";
import { useSetAtom } from "jotai";
import { sidebarChronologicalSortAtom } from "../../app/preferences/atoms.js";
import type { SidebarThread } from "../../app/model/sidebar-thread.js";
import type { SidebarReorderPlacement } from "../../app/rows/sidebarThreadRowDroppable.js";
import type { OrganizationMode } from "../../shared/preferences.js";
import { moveChild } from "../child-order";
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

/** Siblings move within their band only. */
export function sameReorderableBand(
  activeStage: WorkflowStage,
  overStage: WorkflowStage,
): boolean {
  const band = bandOf(activeStage);
  return band === bandOf(overStage);
}

/** The placement policy shared by section menus and drops. */
export function useRibbonSectionMove(): RibbonDndHandlers["onMoveThread"] | null {
  const ribbon = useRibbonData();
  const updatePlacement = ribbon?.updatePlacement;
  const move = useCallback<RibbonDndHandlers["onMoveThread"]>(
    async (active, groupId, anchor) => {
      if (!updatePlacement || active.parentThreadId !== null) return false;
      const placementAnchor: PlacementAnchor = "edge" in anchor
        ? { kind: anchor.edge }
        : { kind: anchor.placement, threadId: anchor.thread.id };
      await updatePlacement(active.id, "builtin:sections", groupId ?? "unsectioned", placementAnchor);
      return true;
    },
    [updatePlacement],
  );
  return ribbon === null ? null : move;
}

export function useRibbonDnd(mode: OrganizationMode): RibbonDndHandlers | null {
  const ribbon = useRibbonData();
  const setSort = useSetAtom(sidebarChronologicalSortAtom);
  const groupingKey = placementGroupingKey(mode);
  const stageOf = ribbon?.stageOf;
  const updatePlacement = ribbon?.updatePlacement;
  const reorderChildren = ribbon?.reorderChildren;
  const moveToSection = useRibbonSectionMove();

  const canReorder = useCallback<RibbonDndHandlers["canReorder"]>(
    (active, over) => {
      if (!stageOf) return false;
      if (active.parentThreadId !== over.parentThreadId) return false;
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
        if (order) {
          setSort("none");
          await reorderChildren(active.parentThreadId, order);
        }
        return;
      }
      if (groupingKey === null) return;
      const groupId = groupingKey === "builtin:projects"
        ? anchor.thread.projectId
        : groupingKey === "builtin:machines" ? anchor.thread.host?.id ?? "no-machine"
          : (anchor.thread.sectionId ?? "unsectioned");
      setSort("none");
      await updatePlacement(active.id, groupingKey, groupId, {
        kind: anchor.placement,
        threadId: anchor.thread.id,
      });
    },
    [groupingKey, reorderChildren, setSort, stageOf, updatePlacement],
  );

  const onMoveThread = useCallback<RibbonDndHandlers["onMoveThread"]>(
    async (active, groupId, anchor) => {
      if (!updatePlacement || active.parentThreadId !== null) return false;
      if (groupingKey === "builtin:sections") {
        if (!moveToSection) return false;
        setSort("none");
        return moveToSection(active, groupId, anchor);
      }
      const currentGroup = groupingKey === "builtin:projects" ? active.projectId : active.host?.id ?? "no-machine";
      if (currentGroup !== groupId) return false;
      setSort("none");
      await updatePlacement(active.id, groupingKey, currentGroup, "edge" in anchor
        ? { kind: anchor.edge } : { kind: anchor.placement, threadId: anchor.thread.id });
      return true;
    },
    [groupingKey, moveToSection, setSort, updatePlacement],
  );

  return useMemo(
    () =>
      ribbon === null
        ? null
        : { canReorder, onReorderThread, onMoveThread },
    [canReorder, onMoveThread, onReorderThread, ribbon],
  );
}
