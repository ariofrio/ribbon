import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { listAllThreads } from "./list-all-threads";
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

  const observe = async (thread: WorkflowThread) => {
    if (thread.parentThreadId) {
      if (store.removeRootThread(thread.id)) {
        bb.realtime.publish("state-changed", { threadId: thread.id });
      }
      return;
    }
    const lifecycleIsActive = isActiveThreadLifecycle(thread.status);
    const [isWaiting, hasBackgroundCommand] = await Promise.all([
      lifecycleIsActive ? isWaitingOnUser(thread.id) : false,
      hasRunningBackgroundCommand(thread.id),
    ]);
    if (hasBackgroundCommand === null && (!lifecycleIsActive || isWaiting)) {
      return;
    }
    const isActive =
      hasBackgroundCommand === true || (lifecycleIsActive && !isWaiting);
    const result = store.observeActiveState(thread.id, isActive);
    if (result.workflowStageChanged) {
      bb.realtime.publish("state-changed", { threadId: thread.id });
    }
  };

  bb.events.on("thread.created", ({ thread }) => observe(thread));
  bb.events.on("thread.active", ({ thread }) => observe(thread));
  bb.events.on("thread.idle", ({ thread }) => observe(thread));
  bb.events.on("thread.failed", ({ thread }) => observe(thread));

  bb.background.service("stage-automation", {
    async start(signal) {
      let queue = Promise.resolve();
      const enqueue = (threadId: string) => {
        queue = queue
          .then(async () => {
            if (signal.aborted) return;
            const thread = await bb.sdk.threads.get({ threadId, signal });
            await observe(thread);
          })
          .catch((error: unknown) => {
            if (!signal.aborted) {
              const message =
                error instanceof Error ? error.message : String(error);
              bb.log.warn(
                `Could not reconcile stage for ${threadId}: ${message}`,
              );
            }
          });
      };

      const unsubscribe = bb.sdk.subscribe({
        event: "thread:changed",
        callback(event) {
          if (
            event.id &&
            (event.changes.includes("status-changed") ||
              event.changes.includes("interactions-changed") ||
              event.metadata?.backgroundActivityChanged === true)
          ) {
            enqueue(event.id);
          }
        },
      });

      try {
        const threads = await listAllThreads(({ limit, offset }) =>
          bb.sdk.threads.list({ limit, offset, signal }),
        );
        for (const thread of threads) enqueue(thread.id);

        if (!signal.aborted) {
          await new Promise<void>((resolve) => {
            signal.addEventListener("abort", () => resolve(), { once: true });
          });
        }
      } finally {
        unsubscribe();
        await queue;
      }
    },
  });
}
