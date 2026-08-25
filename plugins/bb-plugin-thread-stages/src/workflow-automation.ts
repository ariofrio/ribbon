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
  parentThreadId?: string | null;
  status: ThreadLifecycleStatus;
}

export function registerThreadWorkflow(
  bb: BbPluginApi,
  updateStage: (
    threadId: string,
    stage: Extract<WorkflowStage, "Active" | "Idle">,
  ) => Promise<void>,
): void {
  const observedWorking = new Map<string, boolean>();

  const isWaitingOnUser = async (threadId: string): Promise<boolean> => {
    try {
      const interactions = await bb.sdk.threads.interactions.list({ threadId });
      return interactions.some(({ status }) => status === "pending");
    } catch (error) {
      bb.log.warn(
        `Could not read pending interactions for ${threadId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  };

  const hasRunningBackgroundCommand = async (
    threadId: string,
  ): Promise<boolean | null> => {
    try {
      const timeline = await bb.sdk.threads.timeline({ threadId });
      return timeline.activeBackgroundCommands.length > 0;
    } catch (error) {
      bb.log.warn(
        `Could not read background commands for ${threadId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  };

  const reconcile = async (signal?: AbortSignal) => {
    const listed = await listAllThreads(({ limit, offset }) =>
      bb.sdk.threads.list({ limit, offset, signal }),
    );
    const threads: WorkflowThread[] = listed.map((thread) => ({
      id: thread.id,
      parentThreadId: thread.parentThreadId ?? null,
      status: thread.status,
    }));
    const roots = rootThreadIdByThreadId(
      threads.map(({ id, parentThreadId }) => ({
        id,
        parentThreadId: parentThreadId ?? null,
      })),
    );
    const activeRootIds = new Set<string>();
    const indeterminateRootIds = new Set<string>();

    for (const thread of threads) {
      const lifecycleIsActive = isActiveThreadLifecycle(thread.status);
      const [isWaiting, hasBackgroundCommand] = await Promise.all([
        lifecycleIsActive ? isWaitingOnUser(thread.id) : false,
        hasRunningBackgroundCommand(thread.id),
      ]);
      const rootId = roots.get(thread.id);
      if (rootId === null || rootId === undefined) continue;
      if (hasBackgroundCommand === true || (lifecycleIsActive && !isWaiting)) {
        activeRootIds.add(rootId);
      } else if (hasBackgroundCommand === null) {
        indeterminateRootIds.add(rootId);
      }
    }

    const currentRootIds = new Set<string>();
    for (const root of threads) {
      if (roots.get(root.id) !== root.id) continue;
      currentRootIds.add(root.id);
      if (!activeRootIds.has(root.id) && indeterminateRootIds.has(root.id)) {
        continue;
      }
      const isWorking = activeRootIds.has(root.id);
      if (observedWorking.get(root.id) === isWorking) continue;
      await updateStage(root.id, isWorking ? "Active" : "Idle");
      observedWorking.set(root.id, isWorking);
    }
    for (const threadId of observedWorking.keys()) {
      if (!currentRootIds.has(threadId)) observedWorking.delete(threadId);
    }
  };

  let queue = Promise.resolve();
  const enqueue = (signal?: AbortSignal) => {
    const pending = queue.then(async () => {
      if (!signal?.aborted) await reconcile(signal);
    });
    queue = pending.catch((error: unknown) => {
      if (!signal?.aborted) {
        bb.log.warn(
          `Could not reconcile thread stages: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    });
    return pending;
  };

  bb.events.on("thread.created", () => enqueue());
  bb.events.on("thread.active", () => enqueue());
  bb.events.on("thread.idle", () => enqueue());
  bb.events.on("thread.failed", () => enqueue());

  bb.background.service("stage-automation", {
    async start(signal) {
      const unsubscribe = bb.sdk.subscribe({
        event: "thread:changed",
        callback(event) {
          if (
            event.id &&
            (event.changes.includes("status-changed") ||
              event.changes.includes("interactions-changed") ||
              event.metadata?.backgroundActivityChanged === true)
          ) {
            void enqueue(signal);
          }
        },
      });
      try {
        void enqueue(signal);
        await new Promise<void>((resolve) => {
          if (signal.aborted) resolve();
          else signal.addEventListener("abort", () => resolve(), { once: true });
        });
      } finally {
        unsubscribe();
        await queue;
      }
    },
  });

  bb.background.schedule(
    "stage-automation-reconciliation",
    "* * * * *",
    () => enqueue(),
  );
}
