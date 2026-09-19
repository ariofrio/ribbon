import { PERSONAL_PROJECT_ID } from "./last-thread-project";

export interface ThreadTargetContext {
  projectId: string | null;
  threadId: string | null;
}

export function projectThreadTarget(
  context: ThreadTargetContext,
  lastThreadProjectId: string | null = null,
): { projectId: string } {
  if (context.threadId === null) {
    return { projectId: lastThreadProjectId ?? PERSONAL_PROJECT_ID };
  }
  return { projectId: context.projectId ?? PERSONAL_PROJECT_ID };
}
