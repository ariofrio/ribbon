import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { listAllThreads } from "./list-all-threads";
import { rootThreadIdByThreadId } from "./root-thread-ownership";
import type { WorkflowStage } from "./workflow-stage";

export type ThreadLifecycleStatus =
  | "idle"
  | "active"
  | "starting"
  | "stopping"
  | "error";

export function isActiveThreadLifecycle(
  status: ThreadLifecycleStatus,
): boolean {
  return status === "active" || status === "starting" || status === "stopping";
}

interface WorkflowThread {
  id: string;
  parentThreadId: string | null;
  status: ThreadLifecycleStatus;
  hasPendingInteraction: boolean;
  hasRunningBackgroundCommand: boolean;
}

interface ThreadRefreshRequest {
  background: boolean;
  pendingInteraction: boolean;
  pendingInteractionValue?: boolean;
  status: boolean;
}

interface ReadResult<T> {
  ok: boolean;
  value?: T;
}

export interface WorkflowObservationState {
  get(threadId: string): boolean | undefined;
  set(threadId: string, isWorking: boolean): unknown;
  delete(threadId: string): unknown;
}

export function createWorkflowObservationState(
  database: ReturnType<BbPluginApi["storage"]["database"]>,
  now: () => number = Date.now,
): WorkflowObservationState {
  const getWorking = database.prepare(`
    SELECT is_working FROM thread_task_workflow WHERE thread_id = ?
  `);
  const upsertWorking = database.prepare(`
    INSERT INTO thread_task_workflow(thread_id, is_working, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(thread_id) DO UPDATE SET
      is_working = excluded.is_working,
      updated_at = excluded.updated_at
  `);
  const deleteWorking = database.prepare(`
    DELETE FROM thread_task_workflow WHERE thread_id = ?
  `);
  return {
    get(threadId) {
      const row = getWorking.get(threadId) as
        | { is_working: 0 | 1 }
        | undefined;
      return row === undefined ? undefined : row.is_working === 1;
    },
    set(threadId, isWorking) {
      upsertWorking.run(threadId, isWorking ? 1 : 0, now());
    },
    delete(threadId) {
      deleteWorking.run(threadId);
    },
  };
}

function isThreadWorking(thread: WorkflowThread): boolean {
  return (
    !thread.hasPendingInteraction &&
    (isActiveThreadLifecycle(thread.status) ||
      thread.hasRunningBackgroundCommand)
  );
}

class WorkflowActivityIndex {
  private threads = new Map<string, WorkflowThread>();
  private rootIds: ReadonlyMap<string, string | null> = new Map();
  private workingCounts = new Map<string, number>();

  replace(threads: readonly WorkflowThread[]): string[] {
    this.threads = new Map(threads.map((thread) => [thread.id, thread]));
    this.rootIds = rootThreadIdByThreadId(threads);
    this.workingCounts = new Map();

    for (const thread of threads) {
      const rootId = this.rootIds.get(thread.id);
      if (rootId === null || rootId === undefined || !isThreadWorking(thread)) {
        continue;
      }
      this.workingCounts.set(
        rootId,
        (this.workingCounts.get(rootId) ?? 0) + 1,
      );
    }

    return threads.flatMap((thread) =>
      this.rootIds.get(thread.id) === thread.id ? [thread.id] : [],
    );
  }

  get(threadId: string): WorkflowThread | undefined {
    return this.threads.get(threadId);
  }

  update(
    threadId: string,
    patch: Partial<
      Pick<
        WorkflowThread,
        "hasPendingInteraction" | "hasRunningBackgroundCommand" | "status"
      >
    >,
  ): string | null {
    const current = this.threads.get(threadId);
    const rootId = this.rootIds.get(threadId);
    if (!current || rootId === null || rootId === undefined) return null;

    const next = { ...current, ...patch };
    const wasWorking = isThreadWorking(current);
    const isWorking = isThreadWorking(next);
    this.threads.set(threadId, next);
    if (wasWorking !== isWorking) {
      this.workingCounts.set(
        rootId,
        Math.max(
          0,
          (this.workingCounts.get(rootId) ?? 0) + (isWorking ? 1 : -1),
        ),
      );
    }
    return rootId;
  }

  isRootWorking(rootId: string): boolean | undefined {
    return this.rootIds.get(rootId) === rootId
      ? (this.workingCounts.get(rootId) ?? 0) > 0
      : undefined;
  }
}

function mergeRefreshRequest(
  target: Map<string, ThreadRefreshRequest>,
  threadId: string,
  request: ThreadRefreshRequest,
): void {
  const current = target.get(threadId);
  const pendingInteractionValue = request.pendingInteraction
    ? request.pendingInteractionValue
    : current?.pendingInteractionValue;
  target.set(threadId, {
    background: current?.background === true || request.background,
    pendingInteraction:
      current?.pendingInteraction === true || request.pendingInteraction,
    ...(pendingInteractionValue !== undefined
      ? { pendingInteractionValue }
      : {}),
    status: current?.status === true || request.status,
  });
}

export function registerThreadWorkflow(
  bb: BbPluginApi,
  updateStage: (
    threadId: string,
    stage: Extract<WorkflowStage, "Active" | "Idle">,
  ) => Promise<void>,
  observedWorking: WorkflowObservationState = new Map<string, boolean>(),
): void {
  const index = new WorkflowActivityIndex();
  const dirtyThreads = new Map<string, ThreadRefreshRequest>();
  const retryThreads = new Map<string, ThreadRefreshRequest>();
  const dirtyRootIds = new Set<string>();
  const retryRootIds = new Set<string>();
  let repairRequested = false;
  let repairRetryPending = false;
  let serviceSignal: AbortSignal | undefined;
  let drainScheduled = false;
  let queue = Promise.resolve();

  const warning = (message: string, error: unknown) => {
    if (!serviceSignal?.aborted) {
      bb.log.warn(
        `${message}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  const read = async <T>(
    message: string,
    operation: () => Promise<T>,
  ): Promise<ReadResult<T>> => {
    try {
      return { ok: true, value: await operation() };
    } catch (error) {
      warning(message, error);
      return { ok: false };
    }
  };

  const reconcileRoot = async (rootId: string) => {
    const isWorking = index.isRootWorking(rootId);
    if (isWorking === undefined || observedWorking.get(rootId) === isWorking) {
      retryRootIds.delete(rootId);
      return;
    }
    try {
      await updateStage(rootId, isWorking ? "Active" : "Idle");
      observedWorking.set(rootId, isWorking);
      retryRootIds.delete(rootId);
    } catch (error) {
      retryRootIds.add(rootId);
      warning(`Could not update the workflow stage for ${rootId}`, error);
    }
  };

  const repairIndex = async () => {
    try {
      const listed = await listAllThreads(({ limit, offset }) =>
        bb.sdk.threads.list({
          archived: false,
          limit,
          offset,
          signal: serviceSignal,
        }),
      );
      const rootIds = index.replace(
        listed.map((thread) => ({
          hasPendingInteraction: thread.hasPendingInteraction,
          hasRunningBackgroundCommand:
            thread.activity.activeBackgroundCommandCount > 0,
          id: thread.id,
          parentThreadId: thread.parentThreadId ?? null,
          status: thread.status,
        })),
      );
      repairRetryPending = false;
      for (const rootId of rootIds) dirtyRootIds.add(rootId);
    } catch (error) {
      repairRetryPending = true;
      warning("Could not rebuild the workflow activity index", error);
    }
  };

  const refreshThread = async (
    threadId: string,
    request: ThreadRefreshRequest,
  ) => {
    const current = index.get(threadId);
    const needsSeed = current === undefined;
    const readStatus = request.status || needsSeed;
    const readBackground = request.background || needsSeed;
    const readPendingInteraction =
      (request.pendingInteraction || needsSeed) &&
      request.pendingInteractionValue === undefined;
    const [status, background, pendingInteraction] = await Promise.all([
      readStatus
        ? read(`Could not read lifecycle status for ${threadId}`, () =>
            bb.sdk.threads.get({ threadId, signal: serviceSignal }),
          )
        : Promise.resolve({ ok: true } as ReadResult<never>),
      readBackground
        ? read(`Could not read background commands for ${threadId}`, () =>
            bb.sdk.threads.timeline({
              segmentLimit: "1",
              signal: serviceSignal,
              summaryOnly: "true",
              threadId,
            }),
          )
        : Promise.resolve({ ok: true } as ReadResult<never>),
      readPendingInteraction
        ? read(`Could not read pending interactions for ${threadId}`, () =>
            bb.sdk.threads.interactions.list({
              threadId,
              signal: serviceSignal,
            }),
          )
        : Promise.resolve({ ok: true } as ReadResult<never>),
    ]);

    const failedRequest: ThreadRefreshRequest = {
      background: readBackground && !background.ok,
      pendingInteraction:
        readPendingInteraction && !pendingInteraction.ok,
      status: readStatus && !status.ok,
    };
    if (
      failedRequest.background ||
      failedRequest.pendingInteraction ||
      failedRequest.status
    ) {
      mergeRefreshRequest(retryThreads, threadId, failedRequest);
    }

    if (!current) {
      if (status.ok && background.ok && pendingInteraction.ok) {
        repairRequested = true;
      }
      return;
    }
    if (
      status.value &&
      (status.value.parentThreadId ?? null) !== current.parentThreadId
    ) {
      repairRequested = true;
      return;
    }

    const rootId = index.update(threadId, {
      ...(status.value ? { status: status.value.status } : {}),
      ...(background.value
        ? {
            hasRunningBackgroundCommand:
              background.value.activeBackgroundCommands.length > 0,
          }
        : {}),
      ...(request.pendingInteractionValue !== undefined
        ? { hasPendingInteraction: request.pendingInteractionValue }
        : pendingInteraction.value
          ? {
              hasPendingInteraction: pendingInteraction.value.some(
                ({ status: interactionStatus }) =>
                  interactionStatus === "pending",
              ),
            }
          : {}),
    });
    if (rootId !== null) dirtyRootIds.add(rootId);
  };

  const drain = async () => {
    while (
      repairRequested ||
      dirtyThreads.size > 0 ||
      dirtyRootIds.size > 0
    ) {
      if (repairRequested) {
        repairRequested = false;
        dirtyThreads.clear();
        retryThreads.clear();
        await repairIndex();
      }

      const threadRequests = [...dirtyThreads];
      dirtyThreads.clear();
      await Promise.all(
        threadRequests.map(([threadId, request]) =>
          refreshThread(threadId, request),
        ),
      );

      const rootIds = [...dirtyRootIds];
      dirtyRootIds.clear();
      for (const rootId of rootIds) await reconcileRoot(rootId);
    }
  };

  const requestDrain = (): Promise<void> => {
    if (drainScheduled) return queue;
    drainScheduled = true;
    const pending = queue.then(async () => {
      drainScheduled = false;
      if (!serviceSignal?.aborted) await drain();
    });
    queue = pending.catch((error: unknown) => {
      warning("Could not reconcile thread stages", error);
    });
    return queue;
  };

  const enqueueRepair = () => {
    repairRequested = true;
    return requestDrain();
  };

  const enqueueThread = (
    threadId: string,
    request: ThreadRefreshRequest,
  ) => {
    mergeRefreshRequest(dirtyThreads, threadId, request);
    return requestDrain();
  };

  const enqueueRetries = () => {
    if (repairRetryPending) repairRequested = true;
    for (const [threadId, request] of retryThreads) {
      mergeRefreshRequest(dirtyThreads, threadId, request);
    }
    retryThreads.clear();
    for (const rootId of retryRootIds) dirtyRootIds.add(rootId);
    retryRootIds.clear();
    return requestDrain();
  };

  bb.events.on("thread.deleted", ({ thread }) => {
    observedWorking.delete(thread.id);
  });

  bb.background.service("stage-automation", {
    async start(signal) {
      serviceSignal = signal;
      const unsubscribeThreads = bb.sdk.subscribe({
        event: "thread:changed",
        callback(event) {
          const topologyChanged = event.changes.some((change) =>
            [
              "archived-changed",
              "parent-changed",
              "thread-created",
              "thread-deleted",
            ].includes(change),
          );
          if (topologyChanged || !event.id) {
            if (
              event.id &&
              event.changes.includes("thread-deleted")
            ) {
              observedWorking.delete(event.id);
            }
            return enqueueRepair();
          }

          const status = event.changes.includes("status-changed");
          const pendingInteraction =
            event.changes.includes("interactions-changed") ||
            event.metadata?.hasPendingInteraction !== undefined;
          const background =
            event.metadata?.backgroundActivityChanged === true;
          if (!status && !pendingInteraction && !background) return;
          return enqueueThread(event.id, {
            background,
            pendingInteraction,
            ...(event.metadata?.hasPendingInteraction !== undefined
              ? {
                  pendingInteractionValue:
                    event.metadata.hasPendingInteraction,
                }
              : {}),
            status,
          });
        },
      });
      const unsubscribeConnection = bb.sdk.subscribe({
        event: "realtime:connection",
        callback(event) {
          if (event.state === "connected" && event.reconnected) {
            return enqueueRepair();
          }
        },
      });
      try {
        void enqueueRepair();
        await new Promise<void>((resolve) => {
          if (signal.aborted) resolve();
          else signal.addEventListener("abort", () => resolve(), { once: true });
        });
      } finally {
        unsubscribeConnection();
        unsubscribeThreads();
        await queue;
      }
    },
  });

  bb.background.schedule(
    "stage-automation-reconciliation",
    "* * * * *",
    enqueueRetries,
  );
}
