import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { listAllThreads } from "./list-all-threads";
import { rootThreadIdByThreadId } from "./root-thread-ownership";
import type { ThreadWorkflowStore } from "./store";

export type ThreadLifecycleStatus =
  | "idle"
  | "active"
  | "starting"
  | "stopping"
  | "error";

export function isActiveThreadLifecycle(
  status: ThreadLifecycleStatus,
): boolean {
  switch (status) {
    case "active":
    case "starting":
    case "stopping":
      return true;
    case "idle":
    case "error":
      return false;
  }
}

interface WorkflowThread {
  id: string;
  parentThreadId?: string | null;
  status: ThreadLifecycleStatus;
}

export function registerThreadWorkflow(
  bb: BbPluginApi,
  store: ThreadWorkflowStore,
): void {
  // A thread blocked on a question or an approval stays `active`, but it is
  // waiting on the user rather than working.
  const isWaitingOnUser = async (threadId: string): Promise<boolean> => {
    try {
      const interactions = await bb.sdk.threads.interactions.list({ threadId });
      return interactions.some(({ status }) => status === "pending");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      bb.log.warn(
        `Could not read pending interactions for ${threadId}: ${message}`,
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
      const message = error instanceof Error ? error.message : String(error);
      bb.log.warn(
        `Could not read background commands for ${threadId}: ${message}`,
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
      threads.map((thread) => ({
        id: thread.id,
        parentThreadId: thread.parentThreadId ?? null,
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
      if (rootId !== null && rootId !== undefined) {
        if (
          hasBackgroundCommand === true ||
          (lifecycleIsActive && !isWaiting)
        ) {
          activeRootIds.add(rootId);
        } else if (hasBackgroundCommand === null) {
          indeterminateRootIds.add(rootId);
        }
      }
      if (
        roots.get(thread.id) !== thread.id &&
        store.removeRootThread(thread.id)
      ) {
        bb.realtime.publish("state-changed", { threadId: thread.id });
      }
    }

    for (const root of threads) {
      if (roots.get(root.id) !== root.id) continue;
      if (!activeRootIds.has(root.id) && indeterminateRootIds.has(root.id)) {
        continue;
      }
      const result = store.observeActiveState(
        root.id,
        activeRootIds.has(root.id),
      );
      if (result.workflowStageChanged) {
        bb.realtime.publish("state-changed", { threadId: root.id });
      }
    }
  };

  let reconciliationQueue = Promise.resolve();
  const enqueue = (signal?: AbortSignal) => {
    const pending = reconciliationQueue.then(async () => {
      if (!signal?.aborted) await reconcile(signal);
    });
    reconciliationQueue = pending.catch((error: unknown) => {
      if (!signal?.aborted) {
        const message = error instanceof Error ? error.message : String(error);
        bb.log.warn(`Could not reconcile thread stages: ${message}`);
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

        if (!signal.aborted) {
          await new Promise<void>((resolve) => {
            signal.addEventListener("abort", () => resolve(), { once: true });
          });
        }
      } finally {
        unsubscribe();
        await reconciliationQueue;
      }
    },
  });
}
