import { atom, type getDefaultStore } from "jotai";
import { atomFamily, atomWithLazy, selectAtom } from "jotai/utils";
import type { PluginRpcClient } from "@get-bb/plugin-sdk/app";
import type { z } from "zod";
import type { ChildRank } from "../child-order";
import type { GroupingKey, PlacementRecordV1 } from "../placement-store";
import type { rpcContract } from "../server";
import type { ThreadActionsRecord } from "../thread-actions-store";
import {
  parseWorkflowStage,
  type WorkflowStage,
} from "../workflow/workflow-stage";
import {
  loadSidebarPreferences,
  type SidebarPreferences,
  type SidebarView,
} from "./view-state";

export type SidebarSnapshot = z.output<typeof rpcContract.sidebarSnapshotV1.output>;
export type RibbonRpc = PluginRpcClient<typeof rpcContract>;

/**
 * Everything Ribbon keeps beside bb's own thread data, as atoms in the store
 * bb's own preferences already live in. The provider fills them and keeps
 * them current; the list's root reads them all, and a row reads only its own
 * slice, so a change elsewhere in the list leaves the row alone.
 */

/** Whether the data provider is mounted; without it the list is bb's own. */
export const ribbonEnabledAtom = atom(false);
export const ribbonRpcAtom = atom<RibbonRpc | null>(null);
export const ribbonSnapshotAtom = atom<SidebarSnapshot | null>(null);
/** Each grouping's placements in rank order, keyed by grouping. */
export const ribbonPlacementsAtom = atom<
  ReadonlyMap<GroupingKey, readonly PlacementRecordV1[]>
>(new Map());
/** A thread's stage placement, by thread id. */
export const ribbonStagesAtom = atom<ReadonlyMap<string, PlacementRecordV1>>(new Map());
export const ribbonChildRanksAtom = atom<readonly ChildRank[]>([]);
export const ribbonThreadActionsAtom = atom<ReadonlyMap<string, ThreadActionsRecord>>(
  new Map(),
);

export interface RibbonLoaded {
  placements: boolean;
  stages: boolean;
  childOrder: boolean;
  threadActions: boolean;
}
const NOTHING_LOADED: RibbonLoaded = {
  placements: false,
  stages: false,
  childOrder: false,
  threadActions: false,
};
export const ribbonLoadedAtom = atom<RibbonLoaded>(NOTHING_LOADED);
/** Read from local storage the first time anything asks. */
export const ribbonPreferencesAtom = atomWithLazy<SidebarPreferences>(() =>
  loadSidebarPreferences(window.localStorage),
);
export const ribbonErrorAtom = atom<string | null>(null);

/** Sends a row's saved prompt to its thread; the row calls this directly. */
export const runRibbonThreadActionAtom = atom(
  null,
  async (get, set, threadId: string, actionId: string) => {
    const rpc = get(ribbonRpcAtom);
    if (rpc === null) return;
    try {
      await rpc.call("runThreadActionV1", { threadId, actionId });
    } catch (error) {
      set(
        ribbonErrorAtom,
        error instanceof Error ? error.message : "Could not run thread action",
      );
    }
  },
);

export function stageIn(
  stages: ReadonlyMap<string, PlacementRecordV1>,
  threadId: string,
): WorkflowStage {
  return parseWorkflowStage(stages.get(threadId)?.groupId ?? "Active") ?? "Active";
}

/** Stage lookups for a group's rows, one pair per set of stages; null outside the provider. */
export const ribbonStageLookupAtom = atom((get) => {
  if (!get(ribbonEnabledAtom)) return null;
  const stages = get(ribbonStagesAtom);
  const ranks = new Map([...stages.keys()].map((id, index) => [id, index]));
  return {
    stageOf: (threadId: string) => stageIn(stages, threadId),
    /** The saved position in the thread's stage, or the end if not yet loaded. */
    stageRank: (threadId: string) => ranks.get(threadId) ?? Infinity,
  };
});

export interface RibbonThread {
  stage: WorkflowStage;
  actions: ThreadActionsRecord | null;
  pullRequestNumberPosition: SidebarView["pullRequestNumberPosition"];
}

function sameThreadActions(
  left: ThreadActionsRecord | null,
  right: ThreadActionsRecord | null,
): boolean {
  if (left === right) return true;
  if (left === null || right === null) return false;
  return (
    left.actions.length === right.actions.length &&
    left.actions.every((action, index) => {
      const other = right.actions[index]!;
      return (
        action.id === other.id &&
        action.label === other.label &&
        action.prompt === other.prompt
      );
    })
  );
}

function sameRibbonThread(left: RibbonThread, right: RibbonThread): boolean {
  return (
    left.stage === right.stage &&
    left.pullRequestNumberPosition === right.pullRequestNumberPosition &&
    sameThreadActions(left.actions, right.actions)
  );
}

const rowSourceAtom = atom((get) => ({
  stages: get(ribbonStagesAtom),
  actions: get(ribbonThreadActionsAtom),
  position: get(ribbonPreferencesAtom).view.pullRequestNumberPosition,
}));

/**
 * What Ribbon adds to one row. Every reload rebuilds the maps behind it, so
 * the slice compares by what it says and the row redraws only when its own
 * stage, actions, or number placement changed.
 */
export const ribbonThreadAtoms = atomFamily((threadId: string) =>
  selectAtom(
    rowSourceAtom,
    ({ stages, actions, position }): RibbonThread => ({
      stage: stageIn(stages, threadId),
      actions: actions.get(threadId) ?? null,
      pullRequestNumberPosition: position,
    }),
    sameRibbonThread,
  ),
);

/** Back to nothing loaded, as the provider leaves the store when it unmounts. */
export function resetRibbonAtoms(store: ReturnType<typeof getDefaultStore>): void {
  store.set(ribbonEnabledAtom, false);
  store.set(ribbonRpcAtom, null);
  store.set(ribbonSnapshotAtom, null);
  store.set(ribbonPlacementsAtom, new Map());
  store.set(ribbonStagesAtom, new Map());
  store.set(ribbonChildRanksAtom, []);
  store.set(ribbonThreadActionsAtom, new Map());
  store.set(ribbonLoadedAtom, NOTHING_LOADED);
  store.set(ribbonPreferencesAtom, loadSidebarPreferences(window.localStorage));
  store.set(ribbonErrorAtom, null);
}
