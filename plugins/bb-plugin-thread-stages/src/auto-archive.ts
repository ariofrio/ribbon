import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { listAllThreads } from "./list-all-threads";
import type { ThreadWorkflowStore } from "./store";

export interface CompletedPlacementSource {
  listCompletedBefore(
    cutoff: number,
  ):
    | ReturnType<ThreadWorkflowStore["listCompletedBefore"]>
    | Promise<ReturnType<ThreadWorkflowStore["listCompletedBefore"]>>;
}

const DAY_MS = 24 * 60 * 60 * 1_000;

export const AUTO_ARCHIVE_OPTIONS = [
  "Never",
  "1 day",
  "7 days",
  "30 days",
] as const;

export function autoArchiveDelayMs(value: unknown): number | null {
  switch (value) {
    case "1 day":
      return DAY_MS;
    case "7 days":
      return 7 * DAY_MS;
    case "30 days":
      return 30 * DAY_MS;
    case "Never":
    default:
      return null;
  }
}

type ListedThread = Awaited<
  ReturnType<BbPluginApi["sdk"]["threads"]["list"]>
>[number];

interface HierarchyEntry {
  depth: number;
  thread: ListedThread;
}

function collectHierarchy(
  root: ListedThread,
  childrenByParent: ReadonlyMap<string, readonly ListedThread[]>,
): HierarchyEntry[] {
  const hierarchy: HierarchyEntry[] = [{ depth: 0, thread: root }];
  const visited = new Set([root.id]);
  for (let index = 0; index < hierarchy.length; index += 1) {
    const entry = hierarchy[index];
    if (!entry) continue;
    for (const child of childrenByParent.get(entry.thread.id) ?? []) {
      if (visited.has(child.id)) continue;
      visited.add(child.id);
      hierarchy.push({ depth: entry.depth + 1, thread: child });
    }
  }
  return hierarchy;
}

export async function archiveEligibleCompletedThreads(
  bb: Pick<BbPluginApi, "sdk" | "log">,
  source: CompletedPlacementSource,
  delayMs: number,
  now = Date.now(),
): Promise<string[]> {
  if (!Number.isFinite(delayMs) || delayMs <= 0) {
    throw new Error("Auto-archive delay must be positive.");
  }

  const candidates = await source.listCompletedBefore(now - delayMs);
  if (candidates.length === 0) return [];

  const threads = await listAllThreads(({ limit, offset }) =>
    bb.sdk.threads.list({
      archived: false,
      includeHidden: true,
      limit,
      offset,
    }),
  );
  const threadById = new Map(threads.map((thread) => [thread.id, thread]));
  const childrenByParent = new Map<string, ListedThread[]>();
  for (const thread of threads) {
    if (thread.parentThreadId === null) continue;
    const siblings = childrenByParent.get(thread.parentThreadId) ?? [];
    siblings.push(thread);
    childrenByParent.set(thread.parentThreadId, siblings);
  }

  const archived: string[] = [];
  for (const candidate of candidates) {
    const thread = threadById.get(candidate.threadId);
    if (
      !thread ||
      thread.parentThreadId !== null ||
      thread.archivedAt !== null
    ) {
      continue;
    }
    const hierarchy = collectHierarchy(thread, childrenByParent);
    if (hierarchy.some((entry) => entry.thread.pinnedAt !== null)) continue;
    hierarchy.sort(
      (left, right) =>
        right.depth - left.depth ||
        left.thread.id.localeCompare(right.thread.id),
    );
    try {
      for (const entry of hierarchy) {
        await bb.sdk.threads.archiveAll({ threadId: entry.thread.id });
      }
      archived.push(thread.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      bb.log.warn(`Could not auto-archive ${thread.id}: ${message}`);
    }
  }
  return archived;
}

export function registerCompletedAutoArchive(
  bb: BbPluginApi,
  source: CompletedPlacementSource,
  getRetention: () => Promise<unknown>,
): void {
  bb.background.schedule("completed-auto-archive", "17 * * * *", async () => {
    const delayMs = autoArchiveDelayMs(await getRetention());
    if (delayMs === null) return;
    const archived = await archiveEligibleCompletedThreads(bb, source, delayMs);
    if (archived.length > 0) {
      bb.log.info(`Auto-archived ${archived.length} Completed thread(s).`);
    }
  });
}
