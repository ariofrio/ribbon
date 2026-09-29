import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { z } from "zod";
import type { SidebarThread } from "../../app/model/sidebar-thread.js";
import type { rpcContract } from "../server";
import { useRibbonData } from "./data";

type SearchThread = z.output<
  typeof rpcContract.searchThreadIdsV1.output
>["threads"][number];

export interface RibbonSearch {
  /** The query, trimmed and lowercased; empty when no search is on. */
  query: string;
  status: "idle" | "loading" | "ready" | "error";
  /** Every thread the query matched, live or archived. */
  threadIds: ReadonlySet<string>;
  /** Matches bb's list does not carry, archived ones, as rows to add. */
  extraThreads: readonly SidebarThread[];
  retry(): void;
}

const IDLE: RibbonSearch = {
  query: "",
  status: "idle",
  threadIds: new Set(),
  extraThreads: [],
  retry: () => undefined,
};

/** A search-only row: an archived thread bb's live list does not carry. */
export function archivedSearchThread(thread: SearchThread): SidebarThread {
  return {
    ...thread,
    displayTitle: thread.title ?? thread.titleFallback ?? "Untitled thread",
    lifecycleOwnerThreadId: null,
    sourceThreadId: null,
    status: "idle",
    runtimeStatus: "idle",
    queuedWork: "none",
    pinnedAt: null,
    pinSortKey: null,
    archivedAt: 1,
    href: `/projects/${encodeURIComponent(thread.projectId)}/threads/${encodeURIComponent(thread.id)}`,
    isHidden: false,
    sectionId: null,
    originKind: null,
    originPluginId: null,
    hasPendingInteraction: false,
    activity: {
      workflows: 0,
      backgroundAgents: 0,
      backgroundCommands: 0,
      planMode: 0,
      goals: 0,
    },
    indicator: "none",
    indicatorLabel: null,
    isUnread: false,
    isPinned: false,
    environment: null,
    host: null,
    createdAt: 0,
    updatedAt: 0,
    lastReadAt: null,
    latestAttentionAt: 0,
  };
}

/**
 * bb's indexed thread search, for the query the sidebar's search box holds.
 * Every match shows, archived ones included, and every preview opens.
 */
export function useRibbonSearch(
  searchQuery: string,
  knownThreadIds: ReadonlySet<string>,
): RibbonSearch {
  const ribbon = useRibbonData();
  const rpc = ribbon?.rpc;
  const query = searchQuery.trim().toLocaleLowerCase();
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    query: string;
    status: RibbonSearch["status"];
    threadIds: ReadonlySet<string>;
    threads: readonly SearchThread[];
  }>({ query: "", status: "idle", threadIds: new Set(), threads: [] });

  useEffect(() => {
    if (!rpc || query === "") {
      setResult({ query: "", status: "idle", threadIds: new Set(), threads: [] });
      return;
    }
    let canceled = false;
    setResult({ query, status: "loading", threadIds: new Set(), threads: [] });
    void rpc
      .call("searchThreadIdsV1", { query: searchQuery.trim() })
      .then(({ threadIds, threads }) => {
        if (canceled) return;
        setResult({ query, status: "ready", threadIds: new Set(threadIds), threads });
      })
      .catch(() => {
        if (!canceled) {
          setResult({ query, status: "error", threadIds: new Set(), threads: [] });
        }
      });
    return () => {
      canceled = true;
    };
  }, [attempt, query, rpc, searchQuery]);

  return useMemo<RibbonSearch>(() => {
    if (query === "" || result.query !== query) {
      return query === "" ? IDLE : { ...IDLE, query, status: "loading" };
    }
    return {
      query,
      status: result.status,
      threadIds: result.threadIds,
      extraThreads: result.threads
        .filter((thread) => thread.isArchived && !knownThreadIds.has(thread.id))
        .map(archivedSearchThread),
      retry: () => setAttempt((current) => current + 1),
    };
  }, [knownThreadIds, query, result]);
}

/** Keeps the roots whose subtree holds a match, with every descendant. */
export function filterThreadsToSearch(
  threads: readonly SidebarThread[],
  matches: ReadonlySet<string>,
): SidebarThread[] {
  const byId = new Map(threads.map((thread) => [thread.id, thread]));
  const rootOf = (thread: SidebarThread): string => {
    let current = thread;
    const seen = new Set<string>();
    while (current.parentThreadId !== null && !seen.has(current.id)) {
      seen.add(current.id);
      const parent = byId.get(current.parentThreadId);
      if (!parent) break;
      current = parent;
    }
    return current.id;
  };
  const matchedRoots = new Set<string>();
  for (const thread of threads) {
    if (matches.has(thread.id)) matchedRoots.add(rootOf(thread));
  }
  return threads.filter((thread) => matchedRoots.has(rootOf(thread)));
}

/** What the list-wide search state tells every group: reveal every preview. */
const RibbonListContext = createContext<{ revealAll: boolean }>({ revealAll: false });
export const RibbonListProvider = RibbonListContext.Provider;
export function useRibbonList() {
  return useContext(RibbonListContext);
}
