import type { BbPluginApi } from "@get-bb/plugin-sdk";
import {
  derivePreviewFromEvents,
  PREVIEW_ITEM_EVENT_TYPE,
  PREVIEW_USER_EVENT_TYPES,
  previewMessageText,
  type PreviewEvent,
} from "./preview";
import type { PreviewStore } from "./preview-store";

const MESSAGE_EVENT_TYPES = [
  "client/turn/requested",
  "turn/input/accepted",
  "system/manager/user_message",
  "item/completed",
];
const ITEM_PAGE_SIZE = "20";
const REFRESH_DEBOUNCE_MS = 200;

type ThreadsSdk = BbPluginApi["sdk"]["threads"];
type EventTypes = NonNullable<Parameters<ThreadsSdk["events"]["list"]>[0]["types"]>;

export interface PreviewSettings {
  get(): Promise<{ showMessagePreviews?: boolean }>;
  onChange(listener: (next: { showMessagePreviews?: boolean }) => void): void;
}

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

// A timeline build decodes and projects a whole turn on the server's event
// loop; the events route is an indexed page. Read the newest user message and
// page back through completed items until an assistant message or the user
// message's own sequence bounds the search.
async function readPreview(
  bb: BbPluginApi,
  store: PreviewStore,
  threadId: string,
  signal: AbortSignal,
): Promise<{ preview: string | null; sourceSeq: number } | null> {
  const list = (args: {
    types?: EventTypes;
    limit: string;
    beforeSeq?: string;
  }) =>
    bb.sdk.threads.events.list({
      threadId,
      order: "desc",
      signal,
      ...args,
    }) as Promise<PreviewEvent[]>;
  const [latest] = await list({ limit: "1" });
  if (!latest || store.get(threadId)?.sourceSeq === latest.seq) return null;
  let user: PreviewEvent | undefined;
  let beforeUserSeq: string | undefined;
  while (!signal.aborted && !user) {
    const rows = await list({
      types: PREVIEW_USER_EVENT_TYPES as unknown as EventTypes,
      limit: beforeUserSeq === undefined ? "1" : ITEM_PAGE_SIZE,
      beforeSeq: beforeUserSeq,
    });
    if (rows.length === 0) break;
    user = rows.find((row) => previewMessageText(row) !== null);
    beforeUserSeq = String(rows[rows.length - 1]!.seq);
  }
  let item: PreviewEvent | undefined;
  let beforeSeq: string | undefined;
  while (!signal.aborted && !item) {
    const rows = await list({
      types: [PREVIEW_ITEM_EVENT_TYPE] as unknown as EventTypes,
      limit: ITEM_PAGE_SIZE,
      beforeSeq,
    });
    if (rows.length === 0) break;
    item = rows.find((row) => previewMessageText(row) !== null);
    const oldest = rows[rows.length - 1]!.seq;
    if (rows.length < Number(ITEM_PAGE_SIZE) || (user && user.seq > oldest)) break;
    beforeSeq = String(oldest);
  }
  return {
    preview: derivePreviewFromEvents([...(user ? [user] : []), ...(item ? [item] : [])]),
    sourceSeq: latest.seq,
  };
}

function previewsShown(values: { showMessagePreviews?: boolean }) {
  return values.showMessagePreviews !== false;
}

export function registerThreadPreviews(
  bb: BbPluginApi,
  store: PreviewStore,
  settings: PreviewSettings,
): void {
  let latestSettings: { showMessagePreviews?: boolean } | undefined;
  const settingListeners = new Set<(shown: boolean) => void>();
  settings.onChange((next) => {
    latestSettings = next;
    for (const listener of settingListeners) listener(previewsShown(next));
  });
  const nextSettingChange = (signal: AbortSignal) =>
    new Promise<void>((resolve) => {
      const done = () => {
        settingListeners.delete(listener);
        signal.removeEventListener("abort", done);
        resolve();
      };
      const listener = () => done();
      settingListeners.add(listener);
      signal.addEventListener("abort", done, { once: true });
    });

  bb.background.service("thread-previews", {
    async start(signal) {
      while (!signal.aborted) {
        const values = await settings.get();
        if (signal.aborted) return;
        if (!previewsShown(latestSettings ?? values)) {
          await nextSettingChange(signal);
          continue;
        }
        const run = new AbortController();
        const stop = () => run.abort();
        const onSetting = (shown: boolean) => {
          if (!shown) run.abort();
        };
        settingListeners.add(onSetting);
        signal.addEventListener("abort", stop, { once: true });
        try {
          await runPreviews(bb, store, run.signal);
        } catch (cause) {
          if (!run.signal.aborted) throw cause;
        } finally {
          settingListeners.delete(onSetting);
          signal.removeEventListener("abort", stop);
        }
      }
    },
  });
}

async function runPreviews(
  bb: BbPluginApi,
  store: PreviewStore,
  signal: AbortSignal,
): Promise<void> {
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
        const result = await readPreview(bb, store, threadId, signal);
        if (!result || signal.aborted) return;
        if (store.set(threadId, result.preview, result.sourceSeq))
          publishChanged(threadId);
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
      }, REFRESH_DEBOUNCE_MS),
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
}
