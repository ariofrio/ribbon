import type { BbPluginApi } from "@get-bb/plugin-sdk";
import type {
  GroupingDescriptor,
  GroupingKey,
  PlacementStore,
} from "./placement-store";

type Thread = Awaited<ReturnType<BbPluginApi["sdk"]["threads"]["get"]>>;

interface GroupInheritanceOptions {
  refresh(): unknown | Promise<unknown>;
  groupings(): readonly GroupingDescriptor[];
  getPlacement: PlacementStore["getPlacement"];
  updatePlacement(
    input: Parameters<PlacementStore["updatePlacement"]>[0],
  ):
    | ReturnType<PlacementStore["updatePlacement"]>
    | Promise<ReturnType<PlacementStore["updatePlacement"]>>;
}

async function listAllThreads(bb: Pick<BbPluginApi, "sdk">) {
  const threads = [];
  const limit = 100;
  while (threads.length <= 10_000) {
    const page = await bb.sdk.threads.list({
      archived: false,
      includeHidden: true,
      limit,
      offset: threads.length,
    });
    threads.push(...page);
    if (page.length < limit) return threads;
  }
  throw new Error("Thread list exceeds 10000 entries.");
}

async function ancestry(
  bb: Pick<BbPluginApi, "sdk">,
  threadId: string,
): Promise<Thread[]> {
  const result: Thread[] = [];
  const visited = new Set<string>();
  let candidateId: string | null = threadId;

  while (candidateId !== null && !visited.has(candidateId)) {
    visited.add(candidateId);
    const candidate = await bb.sdk.threads.get({ threadId: candidateId });
    result.push(candidate);
    candidateId = candidate.parentThreadId;
  }
  return result;
}

function inheritedSectionId(candidates: readonly Thread[]): string | null {
  return candidates.find(({ sectionId }) => sectionId !== null)?.sectionId ?? null;
}

function inheritedRibbonPlacements(
  candidates: readonly Thread[],
  options: GroupInheritanceOptions,
): Map<GroupingKey, string> {
  const placements = new Map<GroupingKey, string>();
  for (const descriptor of options.groupings()) {
    if (
      descriptor.membership.kind !== "ribbon" ||
      ("available" in descriptor && descriptor.available !== true)
    ) {
      continue;
    }
    for (const candidate of candidates) {
      const result = options.getPlacement({
        groupingKey: descriptor.groupingKey,
        threadId: candidate.id,
      });
      if (!result.ok) continue;
      placements.set(descriptor.groupingKey, result.value.placement.groupId);
      break;
    }
  }
  return placements;
}

async function applyInheritedGroups(
  bb: BbPluginApi,
  target: Thread,
  candidates: readonly Thread[],
  options: GroupInheritanceOptions,
  inheritSection: boolean,
): Promise<void> {
  const ribbonPlacements = inheritedRibbonPlacements(candidates, options);
  if (inheritSection) {
    const sectionId = inheritedSectionId(candidates);
    if (sectionId !== target.sectionId) {
      await bb.sdk.threads.update({ threadId: target.id, sectionId });
    }
  }

  await options.refresh();
  for (const [groupingKey, groupId] of ribbonPlacements) {
    const current = options.getPlacement({ groupingKey, threadId: target.id });
    if (current.ok && current.value.placement.groupId === groupId) continue;
    const result = await options.updatePlacement({
      groupingKey,
      groupId,
      threadId: target.id,
      anchor: { kind: "end" },
      origin: "auto",
    });
    if (!result.ok) throw new Error(result.error.message);
  }
}

export function registerThreadGroupInheritance(
  bb: BbPluginApi,
  options: GroupInheritanceOptions,
): void {
  const parentByThreadId = new Map<string, string | null>();

  bb.events.on("thread.created", async ({ thread }) => {
    parentByThreadId.set(thread.id, thread.parentThreadId);
    if (thread.originKind !== "fork" || thread.sourceThreadId === null) return;
    const candidates = await ancestry(bb, thread.sourceThreadId);
    await applyInheritedGroups(
      bb,
      thread,
      candidates,
      options,
      thread.sectionId === null,
    );
  });

  bb.events.on("thread.deleted", ({ thread }) => {
    parentByThreadId.delete(thread.id);
  });

  bb.background.service("group-inheritance", {
    async start(signal) {
      const threads = await listAllThreads(bb);
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
        if (thread.parentThreadId !== null) {
          await options.refresh();
          return;
        }
        if (oldParentThreadId == null) return;
        const candidates = await ancestry(bb, oldParentThreadId);
        await applyInheritedGroups(bb, thread, candidates, options, true);
      };
      const unsubscribe = bb.sdk.subscribe({
        event: "thread:changed",
        callback(event) {
          void handleThreadChanged(event).catch((error: unknown) => {
            const message =
              error instanceof Error ? error.message : String(error);
            bb.log.warn(
              `Could not inherit groups after a parent change: ${message}`,
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
