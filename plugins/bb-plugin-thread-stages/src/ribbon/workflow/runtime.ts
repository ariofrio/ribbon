import { type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";
import {
  liveChildren,
  liveParentId,
  stepChild,
  type ChildRank,
} from "../child-order";
import type { PlacementStore, OrderGroupingKey } from "../placement-store";
import { registerCompletedAutoArchive } from "./auto-archive";
import { THREAD_STAGES_GROUPING_KEY } from "./catalog";
import { workflowRpcMethods, type ChordDestination } from "./contract";
import { listAllThreads } from "./list-all-threads";
import {
  rootThreadIdByThreadId,
  type WorkflowHierarchyThread,
} from "./root-thread-ownership";
import { resolveStageChord } from "./workflow-chords";
import { resolveWorkflowReorder } from "./workflow-reorder";
import {
  enabledWorkflowStages,
  isBlockedStage,
  parseWorkflowStage,
  type WorkflowStage,
} from "./workflow-stage";
export function createWorkflowRuntime(
  bb: BbPluginApi,
  store: PlacementStore,
  update: (
    input: Parameters<PlacementStore["updatePlacement"]>[0],
  ) => Promise<ReturnType<PlacementStore["updatePlacement"]>>,
  settings: {
    get(): Promise<{
      showDeferredStage?: boolean | string;
      showBlockedStage?: boolean | string;
      autoArchiveCompletedAfter?: boolean | string;
    }>;
  },
  children: {
    ranks(): readonly ChildRank[];
    reorder(parentThreadId: string, threadIds: string[]): void;
  },
) {
  async function updatePlacement(
    input: Parameters<PlacementStore["updatePlacement"]>[0],
  ): Promise<void> {
    const result = await update(input);
    if (!result.ok) {
      throw new Error(
        `placement update was rejected (${result.error.code}): ${result.error.message}`,
      );
    }
  }

  async function listPlacements(
    input: Parameters<PlacementStore["listPlacements"]>[0],
  ) {
    const result = await store.listPlacements(input);
    if (!result.ok) {
      throw new Error(
        `placement list was rejected (${result.error.code}): ${result.error.message}`,
      );
    }
    return result.value;
  }

  async function ribbonAssignments(
    threadIds: readonly string[],
    groupingKey: OrderGroupingKey = "builtin:sections",
  ) {
    const placementState = await listPlacements({
      groupingKey: THREAD_STAGES_GROUPING_KEY,
      threadIds: [...threadIds],
    });
    const groupOrder = await listPlacements({
      groupingKey,
      threadIds: [...threadIds],
    });
    const rank = new Map(
      groupOrder.items.map((item, index) => [item.threadId, index]),
    );
    placementState.items.sort(
      (a, b) => (rank.get(a.threadId) ?? 0) - (rank.get(b.threadId) ?? 0),
    );
    return {
      assignments: placementState.items.map((placement, index) => {
        const workflowStage = parseWorkflowStage(placement.groupId);
        if (workflowStage === null) {
          throw new Error(
            `Ribbon sidebar returned unknown stage ${placement.groupId}.`,
          );
        }
        return {
          threadId: placement.threadId,
          workflowStage,
          sortKey: index.toString().padStart(12, "0"),
          updatedAt: placement.enteredAtMs ?? 0,
        };
      }),
      placements: placementState.items,
      revision: placementState.revision,
      orderRevision: groupOrder.revision,
      orderPlacements: groupOrder.items,
    };
  }

  function requireRootThread(
    threadId: string,
    threads: readonly WorkflowHierarchyThread[],
  ): void {
    const rootId = rootThreadIdByThreadId(threads).get(threadId);
    if (rootId === threadId) return;
    throw new Error(
      rootId
        ? `Child thread ${threadId} cannot be reordered outside its stage through this shortcut.`
        : `Thread ${threadId} is not a root thread.`,
    );
  }

  async function requireEnabledStage(stage: WorkflowStage): Promise<void> {
    if (enabledWorkflowStages(await settings.get()).includes(stage)) return;
    throw new Error(`Stage ${stage} is disabled in Ribbon sidebar settings.`);
  }

  const handlers = {
    async setWorkflowStage({
      threadId,
      workflowStage,
      groupingKey = "builtin:sections",
    }: z.input<typeof workflowRpcMethods.setWorkflowStage.input>) {
      await requireEnabledStage(workflowStage);
      const threads = await listAllThreads(({ limit, offset }) =>
        bb.sdk.threads.list({ archived: false, limit, offset }),
      );
      const rootThreadIds = threads.map(({ id }) => id);
      const placementState = await ribbonAssignments(
        rootThreadIds,
        groupingKey,
      );
      const groupId = placementState.orderPlacements.find(
        (item) => item.threadId === threadId,
      )?.groupId;
      const scopedThreadIds = placementState.orderPlacements
        .filter((item) => item.groupId === groupId)
        .map((item) => item.threadId);
      const undoCandidates = placementState.placements
        .filter(
          (placement) =>
            scopedThreadIds.includes(placement.threadId) &&
            placement.origin === "ui" &&
            (placement.groupId === "Deferred" ||
              isBlockedStage(placement.groupId) ||
              placement.groupId === "Completed"),
        )
        .map((placement) => {
          const previousStage = placement.previousGroupId
            ? parseWorkflowStage(placement.previousGroupId)
            : null;
          return {
            threadId: placement.threadId,
            previousStage,
            previousSortKey: previousStage === "Active" || isBlockedStage(previousStage ?? undefined)
              ? "preserve" : null,
            updatedAt: placement.enteredAtMs ?? 0,
          };
        })
        .sort((left, right) => right.updatedAt - left.updatedAt);
      const chord = resolveStageChord({
        threadId,
        workflowStage,
        threads,
        assignments: placementState.assignments,
        undoCandidates,
        scopedThreadIds,
      });
      const stay: ChordDestination = { kind: "stay" };
      if (chord.kind === "none") return { destination: stay };

      if (chord.kind === "restore") {
        await updatePlacement({
          groupingKey: THREAD_STAGES_GROUPING_KEY,
          groupId: "Active",
          threadId: chord.threadId,
          anchor:
            chord.sortKey !== null ? { kind: "preserve" } : { kind: "start" },
          expectedRevision: placementState.revision,
          origin: "ui",
        });
      } else {
        await updatePlacement({
          groupingKey: THREAD_STAGES_GROUPING_KEY,
          groupId: chord.workflowStage,
          threadId,
          expectedRevision: placementState.revision,
          origin: "ui",
        });
      }

      const next = chord.next;
      const destination: ChordDestination =
        next.kind === "thread"
          ? {
              kind: "thread",
              threadId: next.threadId,
              projectId:
                threads.find(({ id }) => id === next.threadId)?.projectId ??
                null,
            }
          : next;
      return { destination };
    },
    async reorderThread({
      threadId,
      scope,
      direction,
      groupingKey = "builtin:sections",
    }: z.input<typeof workflowRpcMethods.reorderThread.input>) {
      const threads = await listAllThreads(({ limit, offset }) =>
        bb.sdk.threads.list({ archived: false, limit, offset }),
      );
      const parentThreadId =
        scope === "stage" ? null : liveParentId(threads, threadId);
      if (parentThreadId !== null && scope !== "stage") {
        const siblingIds = liveChildren(
          threads,
          children.ranks(),
          parentThreadId,
        ).map(({ id }) => id);
        const threadIds = stepChild(siblingIds, threadId, scope, direction);
        if (threadIds) children.reorder(parentThreadId, threadIds);
        return { assignments: [] };
      }
      if (scope !== "stage") requireRootThread(threadId, threads);
      const placementState = await ribbonAssignments(
        threads.map(({ id }) => id),
        groupingKey,
      );
      const groupId = placementState.orderPlacements.find(
        (item) => item.threadId === threadId,
      )?.groupId;
      const scopedIds = new Set(
        placementState.orderPlacements
          .filter((item) => item.groupId === groupId)
          .map((item) => item.threadId),
      );
      const assignments = scope === "stage"
        ? placementState.assignments
        : placementState.assignments.filter((item) =>
            scopedIds.has(item.threadId),
          );
      const move = resolveWorkflowReorder({
        threads,
        assignments,
        threadId,
        workflowStage:
          assignments.find(({ threadId: id }) => id === threadId)
            ?.workflowStage ?? "Active",
        enabledStages: enabledWorkflowStages(await settings.get()),
        intent: { scope, direction },
      });
      if (move.kind === "none") return { assignments };
      if (move.kind === "pinned") {
        await bb.sdk.threads.reorderPinned({
          threadId,
          previousThreadId: move.previousThreadId,
          nextThreadId: move.nextThreadId,
        });
        return { assignments };
      }
      const stagePlacement =
        move.kind === "stage";
      await updatePlacement({
        groupingKey:
          stagePlacement ? THREAD_STAGES_GROUPING_KEY : groupingKey,
        groupId:
          stagePlacement
            ? move.workflowStage
            : (groupId ?? "unsectioned"),
        threadId,
        anchor:
          move.kind === "stage"
            ? undefined
            : move.nextThreadId !== null
              ? { kind: "before", threadId: move.nextThreadId }
              : move.previousThreadId !== null
                ? { kind: "after", threadId: move.previousThreadId }
                : { kind: "preserve" },
        expectedRevision:
          stagePlacement
            ? placementState.revision
            : placementState.orderRevision,
        origin: "ui",
      });
      return { assignments };
    },
  };
  registerCompletedAutoArchive(
    bb,
    {
      async listCompletedBefore(cutoff) {
        const placements = await listPlacements({
          groupingKey: THREAD_STAGES_GROUPING_KEY,
          groupIds: ["Completed"],
          enteredBeforeMs: cutoff + 1,
        });
        return placements.items.flatMap((placement) =>
          placement.enteredAtMs === null
            ? []
            : [
                {
                  threadId: placement.threadId,
                  enteredAt: placement.enteredAtMs,
                },
              ],
        );
      },
    },
    async () => (await settings.get()).autoArchiveCompletedAfter,
  );

  return handlers;
}
