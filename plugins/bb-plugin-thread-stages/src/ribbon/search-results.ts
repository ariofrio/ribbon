export interface ThreadSearchResultThread {
  id: string;
  projectId: string;
  title: string | null;
  titleFallback: string | null;
  parentThreadId: string | null;
  providerId: string;
  archivedAt: number | null;
}

export interface SidebarSearchThread {
  id: string;
  projectId: string;
  title: string | null;
  titleFallback: string | null;
  parentThreadId: string | null;
  providerId: string;
  isArchived: boolean;
}

export interface ThreadSearchResultGroups {
  active: { results: readonly { thread: ThreadSearchResultThread }[] };
  archived: { results: readonly { thread: ThreadSearchResultThread }[] };
}

export function sidebarThreadsFromSearchResult(
  result: ThreadSearchResultGroups,
): SidebarSearchThread[] {
  const seen = new Set<string>();
  return [...result.active.results, ...result.archived.results].flatMap(
    ({ thread }) => {
      if (seen.has(thread.id)) return [];
      seen.add(thread.id);
      return [
        {
          id: thread.id,
          projectId: thread.projectId,
          title: thread.title,
          titleFallback: thread.titleFallback,
          parentThreadId: thread.parentThreadId,
          providerId: thread.providerId,
          isArchived: thread.archivedAt !== null,
        },
      ];
    },
  );
}
