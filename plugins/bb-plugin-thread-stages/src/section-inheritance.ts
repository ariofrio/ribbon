import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { listAllThreads } from "./list-all-threads";

export async function nearestInheritedSectionId(
  bb: Pick<BbPluginApi, "sdk">,
  threadId: string,
): Promise<string | null> {
  const visited = new Set<string>();
  let candidateId: string | null = threadId;

  while (candidateId !== null && !visited.has(candidateId)) {
    visited.add(candidateId);
    const candidate = await bb.sdk.threads.get({ threadId: candidateId });
    if (candidate.sectionId !== null) return candidate.sectionId;
    candidateId = candidate.parentThreadId;
  }

  return null;
}

export function registerThreadSectionInheritance(bb: BbPluginApi): void {
  const parentByThreadId = new Map<string, string | null>();

  bb.events.on("thread.created", async ({ thread }) => {
    parentByThreadId.set(thread.id, thread.parentThreadId);
    if (thread.sourceThreadId === null || thread.sectionId !== null) return;
    const sectionId = await nearestInheritedSectionId(
      bb,
      thread.sourceThreadId,
    );
    if (sectionId === thread.sectionId) return;
    await bb.sdk.threads.update({ threadId: thread.id, sectionId });
  });

  bb.events.on("thread.deleted", ({ thread }) => {
    parentByThreadId.delete(thread.id);
  });

  bb.background.service("section-inheritance", {
    async start(signal) {
      const threads = await listAllThreads(({ limit, offset }) =>
        bb.sdk.threads.list({
          archived: false,
          includeHidden: true,
          limit,
          offset,
          signal,
        }),
      );
      for (const thread of threads) {
        parentByThreadId.set(thread.id, thread.parentThreadId);
      }
      if (signal.aborted) return;

      const handleThreadChanged = async (event: {
        id?: string;
        changes: readonly string[];
      }) => {
        if (
          event.id === undefined ||
          !event.changes.includes("parent-changed")
        ) {
          return;
        }
        const oldParentThreadId = parentByThreadId.get(event.id);
        const thread = await bb.sdk.threads.get({ threadId: event.id });
        parentByThreadId.set(thread.id, thread.parentThreadId);
        if (thread.parentThreadId !== null || oldParentThreadId == null) return;

        const sectionId = await nearestInheritedSectionId(
          bb,
          oldParentThreadId,
        );
        if (sectionId === thread.sectionId) return;
        await bb.sdk.threads.update({ threadId: thread.id, sectionId });
      };
      const unsubscribe = bb.sdk.subscribe({
        event: "thread:changed",
        callback(event) {
          void handleThreadChanged(event).catch((error: unknown) => {
            const message =
              error instanceof Error ? error.message : String(error);
            bb.log.warn(
              `Could not inherit a section after unparenting: ${message}`,
            );
          });
        },
      });

      await new Promise<void>((resolve) => {
        signal.addEventListener(
          "abort",
          () => {
            unsubscribe();
            resolve();
          },
          { once: true },
        );
      });
    },
  });
}
