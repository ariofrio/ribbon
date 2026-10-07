import {
  useRealtime,
  useRealtimeConnectionState,
  useRpc,
} from "@get-bb/plugin-sdk/app";
import { useAtom, useAtomValue, useSetAtom, useStore } from "jotai";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useInsertionEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import type { ChildRank } from "../child-order";
import type { GroupingKey, PlacementRecordV1 } from "../placement-store";
import type { rpcContract } from "../server";
import type { ThreadAction, ThreadActionsRecord } from "../thread-actions-store";
import { THREAD_STAGES_GROUPING_KEY } from "../workflow/catalog";
import type { WorkflowStage } from "../workflow/workflow-stage";
import {
  resetRibbonAtoms,
  ribbonActionsEditorAtom,
  ribbonChildRanksAtom,
  ribbonEnabledAtom,
  ribbonErrorAtom,
  ribbonLoadedAtom,
  ribbonPlacementsAtom,
  ribbonPreferencesAtom,
  ribbonRpcAtom,
  ribbonSnapshotAtom,
  ribbonStagesAtom,
  ribbonThreadActionsAtom,
  ribbonThreadAtoms,
  runRibbonThreadActionAtom,
  stageIn,
  type RibbonRpc,
  type RibbonThread,
  type SidebarSnapshot,
} from "./atoms";
import {
  PullRequestDetailsProvider,
  type PullRequestDetailsRequest,
} from "./pull-request-details-store";
import { publishShineStyles } from "./row-shine";
import { saveSidebarPreferences, type SidebarView } from "./view-state";

export type { RibbonRpc, RibbonThread, SidebarSnapshot } from "./atoms";

export type PlacementAnchor =
  | { kind: "before" | "after"; threadId: string }
  | { kind: "start" | "end" | "preserve" };

export interface RibbonData {
  /** Every store the list draws from has answered once. */
  ready: boolean;
  snapshot: SidebarSnapshot | null;
  /** Each grouping's placements in rank order, keyed by grouping. */
  placements: ReadonlyMap<GroupingKey, readonly PlacementRecordV1[]>;
  /** A thread's stage placement, by thread id. */
  stages: ReadonlyMap<string, PlacementRecordV1>;
  childRanks: readonly ChildRank[];
  threadActions: ReadonlyMap<string, ThreadActionsRecord>;
  view: SidebarView;
  changeView(change: (current: SidebarView) => SidebarView): void;
  error: string | null;
  clearError(): void;
  /** Fetches everything again after a failure. */
  retry(): void;
  stageOf(threadId: string): WorkflowStage;
  /** When the thread entered its current stage, or 0. */
  enteredStageAt(threadId: string): number;
  setStage(threadId: string, stage: WorkflowStage): Promise<void>;
  updatePlacement(
    threadId: string,
    groupingKey: GroupingKey,
    groupId: string,
    anchor: PlacementAnchor,
  ): Promise<void>;
  reorderChildren(parentThreadId: string, threadIds: string[]): Promise<void>;
  saveThreadActions(
    threadId: string,
    actions: ThreadAction[],
    hideTitle: boolean,
  ): Promise<void>;
  runThreadAction(threadId: string, actionId: string): Promise<void>;
  /** The thread whose prompt actions are being edited, if any. */
  actionsEditor: string | null;
  editActions(threadId: string | null): void;
  rpc: RibbonRpc;
}

const RibbonDataContext = createContext<RibbonData | null>(null);

export function useRibbonData(): RibbonData | null {
  return useContext(RibbonDataContext);
}

/** Whether the list runs under Ribbon's data provider at all. */
export function useRibbonEnabled(): boolean {
  return useAtomValue(ribbonEnabledAtom);
}

/** What Ribbon adds to one row, redrawn only when the row's own share changes. */
export function useRibbonThread(threadId: string): RibbonThread | null {
  const enabled = useRibbonEnabled();
  const thread = useAtomValue(ribbonThreadAtoms(threadId));
  return enabled ? thread : null;
}

const ORDERED_GROUPINGS = ["builtin:sections", "builtin:projects"] as const;

function message(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

/**
 * Everything Ribbon keeps beside bb's own thread data — stages, ranks, child
 * order, prompt actions — fetched once and kept current over realtime, with
 * the mutations the list, its menus, and its shortcuts make.
 */
export function RibbonDataProvider({ children }: { children: ReactNode }) {
  const rpc = useRpc<typeof rpcContract>();
  const rpcRef = useRef(rpc);
  rpcRef.current = rpc;
  const connection = useRealtimeConnectionState();
  const store = useStore();
  // Rows read the store on their own; the atoms say the provider is here and
  // which client to call, and go back to nothing once it is gone.
  useLayoutEffect(() => {
    store.set(ribbonEnabledAtom, true);
    return () => resetRibbonAtoms(store);
  }, [store]);
  useLayoutEffect(() => {
    store.set(ribbonRpcAtom, rpc);
  }, [rpc, store]);
  const [snapshot, setSnapshot] = useAtom(ribbonSnapshotAtom);
  const [placements, setPlacements] = useAtom(ribbonPlacementsAtom);
  const [stages, setStages] = useAtom(ribbonStagesAtom);
  const [childRanks, setChildRanks] = useAtom(ribbonChildRanksAtom);
  const [threadActions, setThreadActions] = useAtom(ribbonThreadActionsAtom);
  const [loaded, setLoaded] = useAtom(ribbonLoadedAtom);
  const [preferences, setPreferences] = useAtom(ribbonPreferencesAtom);
  const [error, setError] = useAtom(ribbonErrorAtom);
  const [actionsEditor, setActionsEditor] = useAtom(ribbonActionsEditorAtom);
  const latestRevisions = useRef(new Map<GroupingKey, number>());
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const stageRequest = useRef(0);
  const reconnectPending = useRef(false);

  const fail = useCallback((fallback: string) => (error: unknown) => {
    setError(message(error, fallback));
  }, []);

  const synchronize = useCallback(async () => {
    const next = await rpcRef.current.call("synchronizeV1", null);
    setSnapshot(next);
  }, []);

  const loadPlacements = useCallback(async () => {
    await Promise.all(
      ORDERED_GROUPINGS.map(async (groupingKey) => {
        const result = await rpcRef.current.call("listPlacementsV1", { groupingKey });
        if (!result.ok) throw new Error(result.error.message);
        // Each grouping keeps its own snapshot; a late answer never undoes a
        // newer saved order.
        if (result.value.revision < (latestRevisions.current.get(groupingKey) ?? -1)) {
          return;
        }
        latestRevisions.current.set(groupingKey, result.value.revision);
        setPlacements((current) =>
          new Map(current).set(groupingKey, result.value.items as PlacementRecordV1[]),
        );
      }),
    );
    setLoaded((current) => (current.placements ? current : { ...current, placements: true }));
  }, []);

  const loadStages = useCallback(async () => {
    const request = ++stageRequest.current;
    const result = await rpcRef.current.call("listPlacementsV1", {
      groupingKey: THREAD_STAGES_GROUPING_KEY,
    });
    if (!result.ok) throw new Error(result.error.message);
    if (request !== stageRequest.current) return;
    if (result.value.revision < (latestRevisions.current.get(THREAD_STAGES_GROUPING_KEY) ?? -1)) return;
    latestRevisions.current.set(THREAD_STAGES_GROUPING_KEY, result.value.revision);
    setStages(
      new Map(
        result.value.items.map((item) => [item.threadId, item as PlacementRecordV1]),
      ),
    );
    setLoaded((current) => (current.stages ? current : { ...current, stages: true }));
  }, []);

  const loadChildOrder = useCallback(async () => {
    const { items } = await rpcRef.current.call("listChildOrderV1", null);
    setChildRanks(items);
    setLoaded((current) => (current.childOrder ? current : { ...current, childOrder: true }));
  }, []);

  const loadThreadActions = useCallback(async () => {
    const { threads } = await rpcRef.current.call("listThreadActionsV1", null);
    setThreadActions(new Map(threads.map((record) => [record.threadId, record])));
    setLoaded((current) =>
      current.threadActions ? current : { ...current, threadActions: true },
    );
  }, []);

  const loadAll = useCallback(() => {
    void synchronize().catch(fail("Thread stages unavailable"));
    void loadPlacements().catch(fail("Could not load placements"));
    void loadStages().catch(fail("Could not load stages"));
    void loadChildOrder().catch(fail("Could not load child order"));
    void loadThreadActions().catch(fail("Could not load thread actions"));
  }, [fail, loadChildOrder, loadPlacements, loadStages, loadThreadActions, synchronize]);
  useEffect(() => loadAll(), [loadAll]);
  // Inserted once: the shimmer's keyframes must be global, outside the scope
  // root bb compiles a plugin's own stylesheet into.
  useInsertionEffect(() => publishShineStyles(), []);

  useEffect(() => {
    if (connection !== "connected") {
      reconnectPending.current = true;
      return;
    }
    if (!reconnectPending.current) return;
    reconnectPending.current = false;
    void synchronize().catch(fail("Thread stages unavailable"));
    void loadPlacements().catch(fail("Could not load placements"));
    void loadStages().catch(fail("Could not load stages"));
  }, [connection, fail, loadPlacements, loadStages, synchronize]);

  useRealtime("placements-changed", () => {
    void loadPlacements().catch(fail("Could not load placements"));
    void loadStages().catch(fail("Could not load stages"));
  });
  useRealtime("child-order-changed", () => {
    void loadChildOrder().catch(() => undefined);
  });
  useRealtime("thread-actions-changed", () => {
    void loadThreadActions().catch(fail("Could not load thread actions"));
  });
  useRealtime("catalog-changed", () => {
    void synchronize().catch(fail("Thread stages unavailable"));
  });

  const changeView = useCallback((change: (current: SidebarView) => SidebarView) => {
    setPreferences((current) => {
      const next = { ...current, view: change(current.view) };
      saveSidebarPreferences(window.localStorage, next);
      return next;
    });
  }, []);

  const stageOf = useCallback(
    (threadId: string): WorkflowStage => stageIn(stages, threadId),
    [stages],
  );
  const enteredStageAt = useCallback(
    (threadId: string) => stages.get(threadId)?.enteredAtMs ?? 0,
    [stages],
  );

  const updatePlacement = useCallback<RibbonData["updatePlacement"]>(
    async (threadId, groupingKey, groupId, anchor) => {
      setError(null);
      // The row lands where it was dropped before the server answers.
      const projectPlacement = (items: readonly PlacementRecordV1[]) => {
        const moving = items.find((item) => item.threadId === threadId);
        if (!moving) return items;
        const rest = items.filter((item) => item.threadId !== threadId);
        const placed = { ...moving, groupId };
        let index = rest.length;
        if (anchor.kind === "before" || anchor.kind === "after") {
          const at = rest.findIndex((item) => item.threadId === anchor.threadId);
          if (at === -1) return items;
          index = anchor.kind === "before" ? at : at + 1;
        } else if (anchor.kind === "start") {
          index = rest.findIndex((item) => item.groupId === groupId);
          if (index === -1) index = rest.length;
        } else if (anchor.kind === "end") {
          const last = rest.map((item) => item.groupId).lastIndexOf(groupId);
          index = last === -1 ? rest.length : last + 1;
        } else {
          return items;
        }
        return [
          ...rest.slice(0, index),
          placed,
          ...rest.slice(index),
        ];
      };
      setPlacements((current) => {
        const items = current.get(groupingKey);
        return items ? new Map(current).set(groupingKey, projectPlacement(items)) : current;
      });
      if (groupingKey === THREAD_STAGES_GROUPING_KEY) {
        setStages((current) => new Map(
          projectPlacement([...current.values()]).map((item) => [item.threadId, item]),
        ));
      }
      // Saves go one at a time, so a second drop made while the first is
      // still in flight lands after it, in gesture order.
      const save = saveQueue.current.then(async () => {
        const input = {
          groupingKey,
          groupId,
          threadId,
          anchor,
          expectedRevision: latestRevisions.current.get(groupingKey),
          origin: "ui" as const,
        };
        let result = await rpcRef.current.call("updatePlacementV1", input);
        if (
          !result.ok &&
          result.error.code === "REVISION_CONFLICT" &&
          result.error.revision !== undefined
        ) {
          result = await rpcRef.current.call("updatePlacementV1", {
            ...input,
            expectedRevision: result.error.revision,
          });
        }
        if (!result.ok) setError(result.error.message);
        await Promise.all([loadPlacements(), loadStages()]);
      });
      saveQueue.current = save.catch(() => undefined);
      await save;
    },
    [loadPlacements, loadStages],
  );

  const setStage = useCallback<RibbonData["setStage"]>(
    async (threadId, stage) => {
      setError(null);
      const result = await rpcRef.current.call("updatePlacementV1", {
        groupingKey: THREAD_STAGES_GROUPING_KEY,
        groupId: stage,
        threadId,
        origin: "ui",
      });
      if (!result.ok) setError(result.error.message);
      await Promise.all([loadPlacements(), loadStages()]);
    },
    [loadPlacements, loadStages],
  );

  const reorderChildren = useCallback<RibbonData["reorderChildren"]>(
    async (parentThreadId, threadIds) => {
      setError(null);
      const moved = new Set(threadIds);
      setChildRanks((current) => [
        ...current.filter(
          (rank) => rank.parentThreadId !== parentThreadId && !moved.has(rank.threadId),
        ),
        ...threadIds.map((threadId) => ({ parentThreadId, threadId })),
      ]);
      try {
        await rpcRef.current.call("reorderChildrenV1", { parentThreadId, threadIds });
      } catch (error) {
        setError(message(error, "Could not reorder thread"));
        await loadChildOrder().catch(() => undefined);
      }
    },
    [loadChildOrder],
  );

  const saveThreadActions = useCallback<RibbonData["saveThreadActions"]>(
    async (threadId, actions, hideTitle) => {
      setError(null);
      const next = actions.map((action) => ({
        ...action,
        label: action.label.trim(),
        prompt: action.prompt.trim(),
      }));
      await rpcRef.current.call("saveThreadActionsV1", {
        threadId,
        actions: next,
        hideTitle: next.length > 0 && hideTitle,
      });
      setThreadActions((current) => {
        const updated = new Map(current);
        if (next.length > 0) {
          updated.set(threadId, { threadId, actions: next, hideTitle: next.length > 0 && hideTitle });
        } else {
          updated.delete(threadId);
        }
        return updated;
      });
    },
    [],
  );

  const runThreadAction = useSetAtom(runRibbonThreadActionAtom);

  const loadPullRequestDetails = useCallback(
    (requests: readonly PullRequestDetailsRequest[]) =>
      rpcRef.current
        .call("pullRequestDetailsV1", { requests: [...requests] })
        .then(({ details }) => details),
    [],
  );

  const value = useMemo<RibbonData>(
    () => ({
      ready:
        snapshot !== null &&
        loaded.placements &&
        loaded.stages &&
        loaded.childOrder &&
        loaded.threadActions,
      snapshot,
      placements,
      stages,
      childRanks,
      threadActions,
      view: preferences.view,
      changeView,
      error,
      clearError: () => setError(null),
      retry: () => {
        setError(null);
        loadAll();
      },
      stageOf,
      enteredStageAt,
      setStage,
      updatePlacement,
      reorderChildren,
      saveThreadActions,
      runThreadAction,
      actionsEditor,
      editActions: setActionsEditor,
      rpc,
    }),
    [
      actionsEditor,
      changeView,
      childRanks,
      enteredStageAt,
      error,
      loadAll,
      loaded,
      placements,
      preferences.view,
      reorderChildren,
      rpc,
      runThreadAction,
      saveThreadActions,
      setStage,
      snapshot,
      stageOf,
      stages,
      threadActions,
      updatePlacement,
    ],
  );

  return (
    <RibbonDataContext.Provider value={value}>
      <PullRequestDetailsProvider load={loadPullRequestDetails}>
        {children}
      </PullRequestDetailsProvider>
    </RibbonDataContext.Provider>
  );
}
