import type { ProjectThreadItem } from "../../app/model/project-thread-groups.js";
import type { SidebarThread } from "../../app/model/sidebar-thread.js";
import type { WorkflowStage } from "../workflow/workflow-stage";

export type StageBand = "main" | "deferred" | "completed";

export interface StageBands {
  main: ProjectThreadItem[];
  deferred: ProjectThreadItem[];
  completed: ProjectThreadItem[];
}

/** The thread an item stands for: a row's own, a worktree group's first. */
export function itemThread(item: ProjectThreadItem): SidebarThread | null {
  switch (item.kind) {
    case "thread":
      return item.node.thread;
    case "environment":
      return item.group.nodes[0].thread;
    case "section":
      return null;
  }
}

export function bandOf(stage: WorkflowStage | undefined): StageBand {
  return stage === "Completed"
    ? "completed"
    : stage === "Deferred"
      ? "deferred"
      : "main";
}

/**
 * Partitions roots into the main list (Active and both Blocked stages),
 * Deferred, and Completed, preserving the containing group's order in every band.
 */
export function stageBands(
  items: readonly ProjectThreadItem[],
  stageOf: (threadId: string) => WorkflowStage | undefined,
): StageBands {
  const bands: StageBands = { main: [], deferred: [], completed: [] };
  for (const item of items) {
    const thread = itemThread(item);
    if (thread === null) {
      bands.main.push(item);
      continue;
    }
    bands[bandOf(stageOf(thread.id))].push(item);
  }
  return bands;
}
