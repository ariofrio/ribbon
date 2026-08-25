import {
  definePluginApp,
  experimental_useSidebarThreadActions,
  experimental_useSidebarThreads,
  useRealtime,
  useRealtimeConnectionState,
  useRpc,
  useSettings,
  type PluginSidebarThread,
  type PluginThreadListProps,
} from "@get-bb/plugin-sdk/app";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
} from "react";
import type { z } from "zod";
import type { rpcContract } from "./server";
import type { GroupingKey, PlacementRecordV1 } from "./placement-store";
import {
  loadSidebarPreferences,
  saveSidebarPreferences,
  type GroupRef,
  type SidebarPreferences,
} from "./view-state";
import { Button } from "./vendor/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./vendor/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./vendor/components/ui/dropdown-menu";
import { Input } from "./vendor/components/ui/input";
import { COARSE_POINTER_ROW_ACTION_SIZE_CLASS } from "./vendor/components/ui/coarse-pointer-sizing";

type SidebarSnapshot = z.output<
  typeof rpcContract.sidebarSnapshotV1.output
>;
type SnapshotGrouping = SidebarSnapshot["groupings"][number];
type BuiltinGroupRef = {
  groupingKey: "builtin:projects" | "builtin:sections";
  groupId: string;
};
type EntityDialog =
  | { kind: "create-section"; name: string }
  | { kind: "rename"; scope: BuiltinGroupRef; label: string; name: string }
  | { kind: "delete"; scope: BuiltinGroupRef; label: string };

function title(thread: PluginSidebarThread) {
  return thread.title ?? thread.titleFallback ?? "Untitled thread";
}

function descendants(
  rootId: string,
  childrenByParent: ReadonlyMap<string, readonly PluginSidebarThread[]>,
): PluginSidebarThread[] {
  const result: PluginSidebarThread[] = [];
  for (const child of childrenByParent.get(rootId) ?? []) {
    result.push(child, ...descendants(child.id, childrenByParent));
  }
  return result;
}

function ThreadRow({
  active,
  depth,
  onDragEnd,
  onDragStart,
  onDropBefore,
  onMoveBefore,
  moveBeforeLabel,
  onMoveStart,
  onOpen,
  preview,
  thread,
}: {
  active: boolean;
  depth: number;
  onDragEnd(): void;
  onDragStart(event: DragEvent<HTMLElement>): void;
  onDropBefore(event: DragEvent<HTMLElement>): void;
  onMoveBefore?: () => void;
  moveBeforeLabel?: string;
  onMoveStart?: () => void;
  onOpen(): void;
  preview: string | null;
  thread: PluginSidebarThread;
}) {
  return (
    <div
      className="group relative flex min-h-8 min-w-0 items-center rounded-md px-1 text-sm hover:bg-state-hover"
      data-thread-id={thread.id}
      draggable={depth === 0}
      onDragEnd={onDragEnd}
      onDragOver={(event) => {
        if (depth === 0) event.preventDefault();
      }}
      onDragStart={onDragStart}
      onDrop={onDropBefore}
      style={{
        paddingLeft: `${4 + depth * 14}px`,
        contentVisibility: "auto",
        containIntrinsicSize: "32px",
      }}
    >
      <button
        aria-current={active ? "page" : undefined}
        className="min-w-0 flex-1 truncate rounded px-1 py-1 text-left outline-none focus-visible:ring-1 focus-visible:ring-ring aria-[current=page]:bg-state-active"
        onClick={onOpen}
        type="button"
      >
        <span className="block truncate">{title(thread)}</span>
        {preview ? (
          <span className="block truncate text-xs text-muted-foreground">
            {preview}
          </span>
        ) : null}
      </button>
      {onMoveBefore && moveBeforeLabel ? (
        <button
          aria-label={moveBeforeLabel}
          className={`${COARSE_POINTER_ROW_ACTION_SIZE_CLASS} shrink-0 rounded text-muted-foreground outline-none hover:bg-state-hover hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring`}
          onClick={onMoveBefore}
          type="button"
        >
          <span aria-hidden="true">↑</span>
        </button>
      ) : null}
      {onMoveStart ? (
        <button
          aria-label={`Move ${title(thread)}`}
          className={`${COARSE_POINTER_ROW_ACTION_SIZE_CLASS} shrink-0 rounded text-muted-foreground outline-none hover:bg-state-hover hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring`}
          onClick={onMoveStart}
          type="button"
        >
          <span aria-hidden="true">↕</span>
        </button>
      ) : null}
    </div>
  );
}

function RibbonSidebarList({
  activeThreadId,
  experimental_Original: OriginalThreadList,
  onNavigate,
  searchQuery,
}: PluginThreadListProps) {
  const rpc = useRpc<typeof rpcContract>();
  const sidebar = experimental_useSidebarThreads();
  const actions = experimental_useSidebarThreadActions();
  const settings = useSettings();
  const connection = useRealtimeConnectionState();
  const [snapshot, setSnapshot] = useState<SidebarSnapshot | null>(null);
  const [preferences, setPreferences] = useState<SidebarPreferences | null>(
    null,
  );
  const [placements, setPlacements] = useState<readonly PlacementRecordV1[]>(
    [],
  );
  const [revision, setRevision] = useState(0);
  const [previews, setPreviews] = useState<ReadonlyMap<string, string | null>>(
    new Map(),
  );
  const [placementsLoaded, setPlacementsLoaded] = useState(false);
  const [previewsLoaded, setPreviewsLoaded] = useState(false);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [draggingThreadId, setDraggingThreadId] = useState<string | null>(null);
  const [entityDialog, setEntityDialog] = useState<EntityDialog | null>(null);
  const [entityPending, setEntityPending] = useState(false);
  const [searchResult, setSearchResult] = useState<{
    query: string;
    threadIds: ReadonlySet<string>;
  }>({ query: "", threadIds: new Set() });
  const mounted = useRef(false);
  const reconnectPending = useRef(false);

  const synchronize = useCallback(async () => {
    const next = await rpc.call("synchronizeV1", {
      migrateThreadStages: !mounted.current,
    });
    mounted.current = true;
    setSnapshot(next);
    setFatalError(null);
    setPreferences((current) => {
      if (current !== null) return current;
      return loadSidebarPreferences(
        window.localStorage,
        next.groupings.map(({ groupingKey }) => groupingKey as GroupingKey),
      );
    });
  }, [rpc]);

  useEffect(() => {
    void synchronize().catch((error: unknown) => {
      setFatalError(
        error instanceof Error ? error.message : "Ribbon sidebar unavailable",
      );
    });
  }, [synchronize]);

  useEffect(() => {
    if (connection !== "connected") {
      reconnectPending.current = true;
      return;
    }
    if (reconnectPending.current) {
      reconnectPending.current = false;
      void synchronize().catch((error: unknown) => {
        setFatalError(
          error instanceof Error ? error.message : "Ribbon sidebar unavailable",
        );
      });
    }
  }, [connection, synchronize]);

  const loadPlacements = useCallback(async () => {
    if (!preferences) return;
    setPlacementsLoaded(false);
    let threadIds: string[] | undefined;
    if (
      preferences.view.scope.kind === "group" &&
      preferences.view.scope.group.groupingKey !==
        preferences.view.groupingKey
    ) {
      const scope = preferences.view.scope.group;
      const scoped = await rpc.call("listPlacementsV1", {
        groupingKey: scope.groupingKey,
      });
      if (!scoped.ok) throw new Error(scoped.error.message);
      threadIds = scoped.value.items
        .filter(({ groupId }) => groupId === scope.groupId)
        .map(({ threadId }) => threadId);
    }
    const result = await rpc.call("listPlacementsV1", {
      groupingKey: preferences.view.groupingKey,
      ...(threadIds === undefined ? {} : { threadIds }),
    });
    if (!result.ok) throw new Error(result.error.message);
    setPlacements(result.value.items as PlacementRecordV1[]);
    setRevision(result.value.revision);
    setPlacementsLoaded(true);
  }, [preferences, rpc]);

  useEffect(() => {
    void loadPlacements().catch((error: unknown) => {
      setFatalError(
        error instanceof Error ? error.message : "Could not load placements",
      );
    });
  }, [loadPlacements]);

  useRealtime("placements-changed", () => {
    void loadPlacements();
  });
  useRealtime("catalog-changed", () => {
    void synchronize().catch((error: unknown) => {
      setFatalError(
        error instanceof Error ? error.message : "Ribbon sidebar unavailable",
      );
    });
  });

  const changePreferences = useCallback(
    (change: (current: SidebarPreferences) => SidebarPreferences) => {
      setPreferences((current) => {
        if (!current) return current;
        const next = change(current);
        saveSidebarPreferences(window.localStorage, next);
        return next;
      });
    },
    [],
  );

  const grouping = snapshot?.groupings.find(
    ({ groupingKey }) => groupingKey === preferences?.view.groupingKey,
  );
  const placementByThread = useMemo(
    () => new Map(placements.map((placement) => [placement.threadId, placement])),
    [placements],
  );
  const liveThreads = useMemo(
    () => sidebar.threads.filter((thread) => !thread.isArchived),
    [sidebar.threads],
  );
  const liveThreadIds = useMemo(
    () => new Set(liveThreads.map(({ id }) => id)),
    [liveThreads],
  );
  const rootThreads = useMemo(
    () =>
      liveThreads.filter(
        ({ parentThreadId }) =>
          parentThreadId === null || !liveThreadIds.has(parentThreadId),
      ),
    [liveThreadIds, liveThreads],
  );
  useEffect(() => {
    setPreviewsLoaded(false);
    if (
      sidebar.status !== "ready" ||
      settings.values?.showMessagePreviews === false
    ) {
      setPreviews(new Map());
      setPreviewsLoaded(true);
      return;
    }
    let canceled = false;
    void rpc
      .call("listPreviewsV1", {
        threadIds: rootThreads.map(({ id }) => id),
      })
      .then(({ previews: next }) => {
        if (!canceled) {
          setPreviews(
            new Map(next.map(({ threadId, preview }) => [threadId, preview])),
          );
          setPreviewsLoaded(true);
        }
      })
      .catch(() => {
        if (!canceled) setPreviewsLoaded(true);
      });
    return () => {
      canceled = true;
    };
  }, [rootThreads, rpc, settings.values?.showMessagePreviews, sidebar.status]);
  const childrenByParent = useMemo(() => {
    const result = new Map<string, PluginSidebarThread[]>();
    for (const child of liveThreads.filter(
      ({ parentThreadId }) => parentThreadId && liveThreadIds.has(parentThreadId),
    )) {
      const list = result.get(child.parentThreadId!) ?? [];
      list.push(child);
      result.set(child.parentThreadId!, list);
    }
    return result;
  }, [liveThreadIds, liveThreads]);
  const normalizedSearch = searchQuery.trim().toLocaleLowerCase();
  useEffect(() => {
    if (!normalizedSearch) {
      setSearchResult({ query: "", threadIds: new Set() });
      return;
    }
    let canceled = false;
    setSearchResult({ query: normalizedSearch, threadIds: new Set() });
    void rpc
      .call("searchThreadIdsV1", { query: searchQuery.trim() })
      .then(({ threadIds }) => {
        if (!canceled) {
          setSearchResult({
            query: normalizedSearch,
            threadIds: new Set(threadIds),
          });
        }
      })
      .catch(() => {
        if (!canceled) {
          setSearchResult({ query: normalizedSearch, threadIds: new Set() });
        }
      });
    return () => {
      canceled = true;
    };
  }, [normalizedSearch, rpc, searchQuery]);
  const matchesSearch = useCallback(
    (root: PluginSidebarThread) => {
      if (!normalizedSearch) return true;
      if (searchResult.query !== normalizedSearch) return false;
      return [root, ...descendants(root.id, childrenByParent)].some(
        ({ id }) => searchResult.threadIds.has(id),
      );
    },
    [childrenByParent, normalizedSearch, searchResult],
  );
  // Pinned membership and ordering come directly from bb; placement never
  // participates in this array.
  const pinnedRoots = useMemo(
    () => rootThreads.filter((thread) => thread.isPinned && matchesSearch(thread)),
    [matchesSearch, rootThreads],
  );
  const visiblePlacementIds = new Set(placements.map(({ threadId }) => threadId));
  const placementOrder = new Map(
    placements.map(({ threadId }, index) => [threadId, index]),
  );
  const unpinnedRoots = rootThreads.filter(
    (thread) =>
      !thread.isPinned &&
      visiblePlacementIds.has(thread.id) &&
      matchesSearch(thread),
  ).sort(
    (left, right) =>
      (placementOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
      (placementOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER),
  );

  const groupDefinitions = useMemo(() => {
    if (!grouping) return [];
    const known = new Set(grouping.groups.map(({ id }) => id));
    const orphanIds = placements
      .map(({ groupId }) => groupId)
      .filter((groupId, index, all) => !known.has(groupId) && all.indexOf(groupId) === index);
    return [
      ...grouping.groups,
      ...orphanIds.map((id) => ({
        id,
        label: `${id} (unavailable)`,
        visibleWhenEmpty: true,
        acceptsAssignments: false,
        defaultCollapsed: false,
      })),
    ];
  }, [grouping, placements]);
  const matchingScope =
    preferences?.view.scope.kind === "group" &&
    preferences.view.scope.group.groupingKey === grouping?.groupingKey
      ? preferences.view.scope.group
      : null;
  const displayedGroupDefinitions = matchingScope
    ? groupDefinitions.filter(({ id }) => id === matchingScope.groupId)
    : groupDefinitions;

  const scopeLabel = useMemo(() => {
    if (!preferences || preferences.view.scope.kind === "all") return null;
    const scope = preferences.view.scope.group;
    const scopeGrouping = snapshot?.groupings.find(
      ({ groupingKey }) => groupingKey === scope.groupingKey,
    );
    return (
      scopeGrouping?.groups.find(({ id }) => id === scope.groupId)?.label ??
      `${scope.groupId} (unavailable)`
    );
  }, [preferences, snapshot]);

  const submitEntityName = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (entityDialog?.kind !== "create-section" && entityDialog?.kind !== "rename") {
        return;
      }
      const name = entityDialog.name.trim();
      if (!name) return;
      setEntityPending(true);
      setMutationError(null);
      try {
        if (entityDialog.kind === "create-section") {
          await rpc.call("createSectionV1", { name });
        } else {
          await rpc.call("renameEntityV1", {
            groupingKey: entityDialog.scope.groupingKey,
            id: entityDialog.scope.groupId,
            name,
          });
        }
        setEntityDialog(null);
        await synchronize();
      } catch (error) {
        setMutationError(
          error instanceof Error ? error.message : "Could not save the entity",
        );
      } finally {
        setEntityPending(false);
      }
    },
    [entityDialog, rpc, synchronize],
  );

  const deleteEntity = useCallback(async () => {
    if (entityDialog?.kind !== "delete") return;
    setEntityPending(true);
    setMutationError(null);
    try {
      await rpc.call("deleteEntityV1", {
        groupingKey: entityDialog.scope.groupingKey,
        id: entityDialog.scope.groupId,
      });
      setEntityDialog(null);
      changePreferences((current) => ({
        ...current,
        view: { ...current.view, scope: { kind: "all" } },
      }));
      await synchronize();
    } catch (error) {
      setMutationError(
        error instanceof Error ? error.message : "Could not delete the entity",
      );
    } finally {
      setEntityPending(false);
    }
  }, [changePreferences, entityDialog, rpc, synchronize]);

  const updatePlacement = useCallback(
    async (
      threadId: string,
      groupId: string,
      anchor: { kind: "before"; threadId: string } | { kind: "end" },
    ) => {
      if (!preferences) return;
      setMutationError(null);
      const result = await rpc.call("updatePlacementV1", {
        groupingKey: preferences.view.groupingKey,
        groupId,
        threadId,
        anchor,
        expectedRevision: revision,
        origin: "ui",
      });
      if (!result.ok) {
        setMutationError(result.error.message);
        await loadPlacements();
        return;
      }
      await loadPlacements();
    },
    [loadPlacements, preferences, revision, rpc],
  );

  if (fatalError) return <OriginalThreadList />;
  if (!snapshot || !preferences || !grouping) {
    return <div className="px-2 py-3 text-xs text-muted-foreground">Loading Ribbon sidebar…</div>;
  }

  const movingThread = draggingThreadId
    ? rootThreads.find(({ id }) => id === draggingThreadId)
    : undefined;

  const renderRoot = (root: PluginSidebarThread, depth = 0) => {
    const destination = placementByThread.get(root.id);
    const canMoveBefore =
      depth === 0 &&
      movingThread !== undefined &&
      movingThread.id !== root.id &&
      destination !== undefined;
    return (
      <div key={root.id}>
        <ThreadRow
          active={activeThreadId === root.id}
          depth={depth}
          onDragEnd={() => setDraggingThreadId(null)}
          onDragStart={(event) => {
            if (depth !== 0) return;
            event.dataTransfer.setData("text/plain", root.id);
            setDraggingThreadId(root.id);
          }}
          onDropBefore={(event) => {
            if (depth !== 0 || !draggingThreadId) return;
            event.preventDefault();
            if (draggingThreadId === root.id) {
              setDraggingThreadId(null);
              return;
            }
            if (destination) {
              void updatePlacement(draggingThreadId, destination.groupId, {
                kind: "before",
                threadId: root.id,
              });
            }
          }}
          moveBeforeLabel={
            canMoveBefore
              ? `Move ${title(movingThread)} before ${title(root)}`
              : undefined
          }
          onMoveBefore={
            canMoveBefore
              ? () => {
                  void updatePlacement(movingThread.id, destination.groupId, {
                    kind: "before",
                    threadId: root.id,
                  });
                  setDraggingThreadId(null);
                }
              : undefined
          }
          onMoveStart={
            depth === 0 ? () => setDraggingThreadId(root.id) : undefined
          }
          onOpen={() => {
            actions.open(root.id);
            onNavigate();
          }}
          preview={
            settings.values?.showMessagePreviews === false
              ? null
              : (previews.get(root.id) ?? null)
          }
          thread={root}
        />
        {(childrenByParent.get(root.id) ?? []).map((child) =>
          renderRoot(child, depth + 1),
        )}
      </div>
    );
  };

  return (
    <div
      className="relative flex w-full min-w-0 flex-col gap-1 px-1"
      data-ribbon-sidebar-ready={
        placementsLoaded && previewsLoaded ? "" : undefined
      }
      data-ribbon-sidebar-root=""
      onKeyDown={(event) => {
        if (event.key === "Escape") setDraggingThreadId(null);
      }}
    >
      <div className="sticky top-0 z-10 flex gap-1 bg-background/95 py-1 backdrop-blur">
        {settings.values?.showProjectsAndSections !== false ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="min-w-0 flex-1 justify-start truncate" size="sm" variant="ghost">
                Projects and sections
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-56">
              <DropdownMenuItem
                onSelect={() =>
                  changePreferences((current) => ({
                    ...current,
                    view: { ...current.view, scope: { kind: "all" } },
                  }))
                }
              >
                All projects and sections
              </DropdownMenuItem>
            {snapshot.groupings
                .filter(({ groupingKey }) =>
                  ["builtin:projects", "builtin:sections"].includes(groupingKey),
                )
                .map((candidate) => (
                  <div key={candidate.groupingKey}>
                    <DropdownMenuLabel>{candidate.pluralLabel}</DropdownMenuLabel>
                    {candidate.groups.map((group) => (
                      <DropdownMenuItem
                        key={group.id}
                        onSelect={() =>
                          changePreferences((current) => ({
                            ...current,
                            view: {
                              ...current.view,
                              scope: {
                                kind: "group",
                                group: {
                                  groupingKey: candidate.groupingKey as GroupingKey,
                                  groupId: group.id,
                                },
                              },
                            },
                          }))
                        }
                      >
                        {group.label}
                      </DropdownMenuItem>
                    ))}
                  </div>
                ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => {
                  void rpc
                    .call("createProjectV1", null)
                    .then(() => synchronize())
                    .catch((error: unknown) =>
                      setMutationError(
                        error instanceof Error
                          ? error.message
                          : "Could not create project",
                      ),
                    );
                }}
              >
                New project…
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  setEntityDialog({ kind: "create-section", name: "" });
                }}
              >
                New section…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button aria-label={`Group by ${grouping.pluralLabel}`} size="sm" variant="ghost">
              {grouping.pluralLabel}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {snapshot.groupings.filter(({ available }) => available).map((candidate) => (
              <DropdownMenuItem
                key={candidate.groupingKey}
                onSelect={() =>
                  changePreferences((current) => ({
                    ...current,
                    view: {
                      ...current.view,
                      groupingKey: candidate.groupingKey as GroupingKey,
                    },
                  }))
                }
              >
                {candidate.pluralLabel}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {scopeLabel ? (
        <div className="flex items-center justify-between rounded-md bg-muted px-2 py-1 text-xs">
          <span>{scopeLabel} scope</span>
          <div className="flex items-center gap-1">
            {preferences.view.scope.kind === "group" &&
            ["builtin:projects", "builtin:sections"].includes(
              preferences.view.scope.group.groupingKey,
            ) &&
            preferences.view.scope.group.groupId !== "unsectioned" ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    aria-label="Scope actions"
                    className="rounded px-1 hover:bg-state-hover focus-visible:ring-1 focus-visible:ring-ring"
                    type="button"
                  >
                    •••
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onSelect={() => {
                      if (preferences.view.scope.kind !== "group") return;
                      const currentScope = preferences.view.scope.group;
                      setEntityDialog({
                        kind: "rename",
                        scope: currentScope as BuiltinGroupRef,
                        label: scopeLabel,
                        name: scopeLabel,
                      });
                    }}
                  >
                    Rename…
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={() => {
                      if (preferences.view.scope.kind !== "group") return;
                      const currentScope = preferences.view.scope.group;
                      setEntityDialog({
                        kind: "delete",
                        scope: currentScope as BuiltinGroupRef,
                        label: scopeLabel,
                      });
                    }}
                  >
                    Delete…
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
            <button
              aria-label="Clear scope"
              className="rounded px-1 hover:bg-state-hover focus-visible:ring-1 focus-visible:ring-ring"
              onClick={() =>
                changePreferences((current) => ({
                  ...current,
                  view: { ...current.view, scope: { kind: "all" } },
                }))
              }
              type="button"
            >
              Clear
            </button>
          </div>
        </div>
      ) : null}
      {mutationError ? (
        <div className="rounded-md bg-destructive/10 px-2 py-1 text-xs text-destructive">
          {mutationError}
        </div>
      ) : null}

      <Dialog
        open={entityDialog !== null}
        onOpenChange={(open) => {
          if (!open && !entityPending) setEntityDialog(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {entityDialog?.kind === "create-section"
                ? "New section"
                : entityDialog?.kind === "rename"
                  ? `Rename ${entityDialog.label}`
                  : entityDialog?.kind === "delete"
                    ? `Delete ${entityDialog.label}?`
                    : "Edit entity"}
            </DialogTitle>
            <DialogDescription>
              {entityDialog?.kind === "delete"
                ? "This removes the group from bb."
                : "Choose the name shown in the Ribbon sidebar."}
            </DialogDescription>
          </DialogHeader>
          {entityDialog?.kind === "create-section" ||
          entityDialog?.kind === "rename" ? (
            <form className="space-y-4" onSubmit={(event) => void submitEntityName(event)}>
              <Input
                aria-label={
                  entityDialog.kind === "create-section" ? "Section name" : "New name"
                }
                autoFocus
                disabled={entityPending}
                onChange={(event) =>
                  setEntityDialog((current) =>
                    current?.kind === "create-section" || current?.kind === "rename"
                      ? { ...current, name: event.target.value }
                      : current,
                  )
                }
                value={entityDialog.name}
              />
              <DialogFooter>
                <Button disabled={entityPending || !entityDialog.name.trim()} type="submit">
                  {entityDialog.kind === "create-section" ? "Create section" : "Rename"}
                </Button>
              </DialogFooter>
            </form>
          ) : entityDialog?.kind === "delete" ? (
            <DialogFooter>
              <Button
                disabled={entityPending}
                onClick={() => void deleteEntity()}
                type="button"
                variant="destructive"
              >
                Delete
              </Button>
            </DialogFooter>
          ) : null}
        </DialogContent>
      </Dialog>

      {pinnedRoots.length > 0 ? (
        <section aria-label="Pinned threads">
          <h3 className="px-2 py-1 text-xs font-medium text-muted-foreground">Pinned</h3>
          {pinnedRoots.map((root) => renderRoot(root))}
        </section>
      ) : null}

      {displayedGroupDefinitions.map((group) => {
        const roots = unpinnedRoots.filter(
          ({ id }) => placementByThread.get(id)?.groupId === group.id,
        );
        if (roots.length === 0 && !group.visibleWhenEmpty) return null;
        const ref = `${grouping.groupingKey}/${group.id}`;
        const collapsed = preferences.collapsed.has(ref);
        const sameKeyScope =
          preferences.view.scope.kind === "group" &&
          preferences.view.scope.group.groupingKey === grouping.groupingKey &&
          preferences.view.scope.group.groupId === group.id;
        return (
          <section aria-label={`${group.label} group`} key={group.id}>
            {!sameKeyScope ? (
              <div className="flex items-center gap-1 px-1 py-0.5">
                <button
                  aria-expanded={!collapsed}
                  className="min-w-0 flex-1 truncate rounded px-1 py-1 text-left text-xs font-medium text-muted-foreground hover:bg-state-hover focus-visible:ring-1 focus-visible:ring-ring"
                  onClick={() =>
                    changePreferences((current) => {
                      const next = new Set(current.collapsed);
                      if (next.has(ref)) next.delete(ref);
                      else next.add(ref);
                      return { ...current, collapsed: next };
                    })
                  }
                  type="button"
                >
                  {grouping.singularLabel}: {group.label}
                  {collapsed && settings.values?.showCollapsedGroupIndicators === true && roots.length > 0
                    ? ` · ${roots.length}`
                    : ""}
                </button>
                <button
                  aria-label={`Filter to ${group.label}`}
                  className="rounded px-1 text-xs hover:bg-state-hover focus-visible:ring-1 focus-visible:ring-ring"
                  onClick={() =>
                    changePreferences((current) => ({
                      ...current,
                      view: {
                        ...current.view,
                        scope: {
                          kind: "group",
                          group: {
                            groupingKey: grouping.groupingKey as GroupingKey,
                            groupId: group.id,
                          },
                        },
                      },
                    }))
                  }
                  type="button"
                >
                  Filter
                </button>
              </div>
            ) : null}
            {!collapsed || sameKeyScope ? roots.map((root) => renderRoot(root)) : null}
            {(sameKeyScope || !collapsed) && group.acceptsAssignments ? (
              <button
                aria-label={`Move to end of ${group.label}`}
                className={
                  draggingThreadId
                    ? "min-h-8 w-full rounded-sm px-2 text-left text-xs text-muted-foreground outline-none hover:bg-state-hover focus-visible:ring-1 focus-visible:ring-ring"
                    : "h-2 w-full rounded-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
                }
                data-testid={sameKeyScope ? "scope-end-drop-target" : undefined}
                onClick={() => {
                  if (draggingThreadId) {
                    void updatePlacement(draggingThreadId, group.id, {
                      kind: "end",
                    });
                    setDraggingThreadId(null);
                  }
                }}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  if (draggingThreadId) {
                    void updatePlacement(draggingThreadId, group.id, { kind: "end" });
                    setDraggingThreadId(null);
                  }
                }}
                type="button"
              >
                {draggingThreadId ? `Move to end of ${group.label}` : null}
              </button>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

export default definePluginApp((app) => {
  app.slots.experimental_threadList({
    id: "ribbon-sidebar",
    title: "Ribbon sidebar",
    description: "Organize every thread grouping through one Ribbon sidebar.",
    component: RibbonSidebarList,
  });
});
