import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { derivePreview, type PreviewRow } from "./preview";
import type { PreviewStore } from "./preview-store";

const MESSAGE_EVENT_TYPES = [
  "client/turn/requested",
  "turn/input/accepted",
  "system/manager/user_message",
  "item/completed",
];

async function listThreadIds(bb: BbPluginApi, signal: AbortSignal) {
  const ids: string[] = [];
  const limit = 100;
  while (ids.length <= 10_000) {
    const page = await bb.sdk.threads.list({ limit, offset: ids.length, signal });
    ids.push(...page.map(({ id }) => id));
    if (page.length < limit) return ids;
  }
  throw new Error("Thread list exceeds 10000 entries.");
}

export function registerThreadPreviews(
  bb: BbPluginApi,
  store: PreviewStore,
): void {
  bb.background.service("thread-previews", {
    async start(signal) {
      let queue = Promise.resolve();
      const timers = new Map<string, ReturnType<typeof setTimeout>>();
      let publishTimer: ReturnType<typeof setTimeout> | null = null;
      let pendingPublishThreadId: string | null | undefined;

      const publishChanged = (threadId: string) => {
        pendingPublishThreadId =
          pendingPublishThreadId === undefined
            ? threadId
            : pendingPublishThreadId === threadId
              ? threadId
              : null;
        if (publishTimer) return;
        publishTimer = setTimeout(() => {
          bb.realtime.publish("previews-changed", {
            threadId: pendingPublishThreadId ?? null,
          });
          pendingPublishThreadId = undefined;
          publishTimer = null;
        }, 50);
      };
      const enqueue = (threadId: string) => {
        queue = queue
          .then(async () => {
            if (signal.aborted) return;
            const timeline = await bb.sdk.threads.timeline({
              threadId,
              includeNestedRows: "true",
              segmentLimit: "1",
              signal,
            });
            const preview = derivePreview(timeline.rows as PreviewRow[]);
            if (store.set(threadId, preview)) publishChanged(threadId);
          })
          .catch((cause: unknown) => {
            if (!signal.aborted) {
              bb.log.warn(
                `Could not derive thread preview for ${threadId}: ${cause instanceof Error ? cause.message : String(cause)}`,
              );
            }
          });
      };
      const schedule = (threadId: string) => {
        const existing = timers.get(threadId);
        if (existing) clearTimeout(existing);
        timers.set(
          threadId,
          setTimeout(() => {
            timers.delete(threadId);
            enqueue(threadId);
          }, 50),
        );
      };
      const unsubscribe = bb.sdk.subscribe({
        event: "thread:changed",
        callback(event) {
          if (!event.id) return;
          const messageChanged = event.metadata?.eventTypes?.some((eventType) =>
            MESSAGE_EVENT_TYPES.includes(eventType),
          );
          if (event.changes.includes("status-changed") || messageChanged) {
            schedule(event.id);
          }
        },
      });

      try {
        for (const threadId of await listThreadIds(bb, signal)) enqueue(threadId);
        if (!signal.aborted) {
          await new Promise<void>((resolve) => {
            signal.addEventListener("abort", () => resolve(), { once: true });
          });
        }
      } finally {
        unsubscribe();
        for (const timer of timers.values()) clearTimeout(timer);
        if (publishTimer) clearTimeout(publishTimer);
        await queue;
      }
    },
  });
}
