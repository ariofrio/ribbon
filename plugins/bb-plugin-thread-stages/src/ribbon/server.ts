import {
  cliCommand,
  defineRpcContract,
  type BbPluginApi,
} from "@get-bb/plugin-sdk";
import { z } from "zod";
import { registerIcons } from "../icons/server";
import { ICON_MIGRATIONS } from "../icons/store";
import { createChildOrderStore } from "./child-order-store";
import { defineRibbonSidebarCli } from "./cli";
import {
  getPlacementInputSchema,
  getPlacementOutputSchema,
  iconDataSchema,
  listPlacementsInputSchema,
  listPlacementsOutputSchema,
  pullRequestDetailsSchema,
  updatePlacementInputSchema,
  updatePlacementOutputSchema,
} from "./contracts";
import { registerThreadGroupInheritance } from "./group-inheritance";
import { orderedGroupings } from "./grouping-order";
import { importIcons, importRibbonSidebar } from "./import-legacy-plugins";
import { reclaimLegacyDatabase } from "./legacy-database";
import { DEFAULT_LONG_TITLES, LONG_TITLE_OPTIONS } from "./long-titles";
import { AUTO_ARCHIVE_OPTIONS } from "./workflow/auto-archive";

/** The Ribbon sidebar settings this plugin kept, by the names both use. */
const RIBBON_SETTINGS = [
  "childThreadLines",
  "groupHeaderIcons",
  "shimmerWorkingRows",
  "messageOnStageChange",
  "autoArchiveCompletedAfter",
] as const;
import {
  createPlacementStore,
  type GroupingDescriptor,
  type GroupingKey,
} from "./placement-store";
import {
  createGhGraphqlRunner,
  createPullRequestDetailsService,
} from "./pull-request-details";
import { sidebarThreadsFromSearchResult } from "./search-results";
import { sidebarMigrations } from "./sidebar-migrations";
import { registerStageMentions } from "./stage-mentions";
import { createThreadActionsStore } from "./thread-actions-store";
import {
  createGroupingCatalog,
  THREAD_STAGES_GROUPING_KEY,
} from "./workflow/catalog";
import { workflowRpcMethods } from "./workflow/contract";
import { createWorkflowRuntime } from "./workflow/runtime";
import { migrateWorkflowShortcuts } from "./workflow/shortcut-migration";
import { createStageChangeMessages } from "./workflow/stage-change-message";

/** Completed threads archive after this long; Ribbon's setting held this value. */
const AUTO_ARCHIVE_COMPLETED_AFTER = "7 days";

const sidebarGroupSchema = z
  .object({
    id: z.string(),
    label: z.string(),
    icon: iconDataSchema.optional(),
    visibleWhenEmpty: z.boolean(),
    acceptsAssignments: z.boolean(),
    defaultCollapsed: z.boolean(),
    defaultPlacement: z.enum(["start", "end"]).optional(),
  })
  .strict();
const sidebarGroupingSchema = z
  .object({
    groupingKey: z.union([
      z.literal("builtin:projects"),
      z.literal("builtin:sections"),
      z.string().regex(/^plugin:[^:/]+:[^:/]+$/u),
    ]),
    singularLabel: z.string(),
    pluralLabel: z.string(),
    icon: iconDataSchema.optional(),
    defaultGroupId: z.string(),
    groups: z.array(sidebarGroupSchema),
    available: z.boolean(),
    membershipWritable: z.boolean(),
  })
  .strict();
const sidebarSnapshotSchema = z
  .object({ groupings: z.array(sidebarGroupingSchema) })
  .strict();
const ribbonThreadSchema = z
  .object({
    id: z.string(),
    projectId: z.string(),
    title: z.string().nullable(),
    titleFallback: z.string().nullable(),
    parentThreadId: z.string().nullable(),
    sectionId: z.string().nullable(),
    originKind: z.literal("fork").nullable(),
    originPluginId: z.string().nullable(),
    providerId: z.string(),
    visibility: z.enum(["visible", "hidden"]),
    isPinned: z.boolean(),
    isArchived: z.boolean(),
    createdAt: z.number(),
    updatedAt: z.number(),
    lastReadAt: z.number().nullable(),
    latestAttentionAt: z.number(),
  })
  .strict();
const threadActionSchema = z
  .object({
    id: z.string().min(1).max(64),
    label: z.string().trim().min(1).max(24),
    prompt: z.string().trim().min(1).max(10000),
  })
  .strict();
const threadActionsSchema = z.array(threadActionSchema).refine(
  (actions) => new Set(actions.map(({ id }) => id)).size === actions.length,
  "Action IDs must be unique.",
);

export const rpcContract = defineRpcContract({
  ...workflowRpcMethods,
  listThreadActionsV1: {
    input: z.null(),
    output: z
      .object({
        threads: z.array(
          z
            .object({ threadId: z.string(), actions: threadActionsSchema, hideTitle: z.boolean() })
            .strict(),
        ),
      })
      .strict(),
  },
  saveThreadActionsV1: {
    input: z
      .object({
        threadId: z.string().min(1).max(256),
        actions: threadActionsSchema,
        hideTitle: z.boolean(),
      })
      .strict(),
    output: z.object({ ok: z.literal(true) }).strict(),
  },
  runThreadActionV1: {
    input: z
      .object({
        threadId: z.string().min(1).max(256),
        actionId: z.string().min(1).max(64),
      })
      .strict(),
    output: z.object({ ok: z.literal(true) }).strict(),
  },
  createSectionV1: {
    input: z.object({ name: z.string().trim().min(1).max(256) }).strict(),
    output: z
      .object({
        section: z.object({ id: z.string(), name: z.string() }).strict(),
      })
      .strict(),
  },
  deleteEntityV1: {
    input: z
      .object({
        groupingKey: z.enum(["builtin:projects", "builtin:sections"]),
        id: z.string().min(1).max(256),
      })
      .strict(),
    output: z.object({ ok: z.literal(true) }).strict(),
  },
  getPlacementV1: {
    input: getPlacementInputSchema,
    output: getPlacementOutputSchema,
  },
  listChildOrderV1: {
    input: z.null(),
    output: z
      .object({
        items: z.array(
          z
            .object({ parentThreadId: z.string(), threadId: z.string() })
            .strict(),
        ),
      })
      .strict(),
  },
  listPlacementsV1: {
    input: listPlacementsInputSchema,
    output: listPlacementsOutputSchema,
  },
  listThreadsV1: {
    input: z.null(),
    output: z.object({ threads: z.array(ribbonThreadSchema) }).strict(),
  },
  placeNewThreadV1: {
    input: updatePlacementInputSchema.omit({
      anchor: true,
      expectedRevision: true,
      origin: true,
    }),
    output: updatePlacementOutputSchema,
  },
  pullRequestDetailsV1: {
    input: z
      .object({
        requests: z
          .array(
            z
              .object({
                url: z.string().url().max(512),
                stamp: z.string().max(128),
              })
              .strict(),
          )
          .max(500),
      })
      .strict(),
    output: z.object({ details: z.array(pullRequestDetailsSchema) }).strict(),
  },
  searchThreadIdsV1: {
    input: z.object({ query: z.string().trim().min(1).max(500) }).strict(),
    output: z
      .object({
        threadIds: z.array(z.string()),
        threads: z.array(
          z
            .object({
              id: z.string(),
              projectId: z.string(),
              title: z.string().nullable(),
              titleFallback: z.string().nullable(),
              parentThreadId: z.string().nullable(),
              providerId: z.string(),
              isArchived: z.boolean(),
            })
            .strict(),
        ),
      })
      .strict(),
  },
  renameEntityV1: {
    input: z
      .object({
        groupingKey: z.enum(["builtin:projects", "builtin:sections"]),
        id: z.string().min(1).max(256),
        name: z.string().trim().min(1).max(256),
      })
      .strict(),
    output: z.object({ ok: z.literal(true) }).strict(),
  },
  reorderChildrenV1: {
    input: z
      .object({
        parentThreadId: z.string().min(1).max(256),
        threadIds: z.array(z.string().min(1).max(256)).max(1000),
      })
      .strict(),
    output: z.object({ ok: z.literal(true) }).strict(),
  },
  sidebarSnapshotV1: {
    input: z.null(),
    output: sidebarSnapshotSchema,
  },
  synchronizeV1: {
    input: z.null(),
    output: sidebarSnapshotSchema,
  },
  updatePlacementV1: {
    input: updatePlacementInputSchema,
    output: updatePlacementOutputSchema,
  },
  updateSettingsV1: {
    input: z
      .object({
        groupHeaderIcons: z.boolean().optional(),
      })
      .strict(),
    output: z.object({ ok: z.literal(true) }).strict(),
  },
});

type ThreadSummary = Awaited<
  ReturnType<BbPluginApi["sdk"]["threads"]["list"]>
>[number];

async function listThreadsForSidebar(
  bb: BbPluginApi,
  options: { includeArchived: boolean; includeHidden: boolean },
): Promise<ThreadSummary[]> {
  const limit = 100;
  const list = async (archived: boolean) => {
    const threads: ThreadSummary[] = [];
    while (threads.length <= 10_000) {
      const page = await bb.sdk.threads.list({
        archived,
        includeHidden: options.includeHidden,
        limit,
        offset: threads.length,
      });
      threads.push(...page);
      if (page.length < limit) return threads;
    }
    throw new Error("Thread list exceeds 10000 entries.");
  };
  if (!options.includeArchived) return list(false);
  const [notArchived, archived] = await Promise.all([list(false), list(true)]);
  return [...notArchived, ...archived];
}

function sidebarRootThreads(threads: readonly ThreadSummary[]) {
  const liveThreadIds = new Set(
    threads
      .filter(
        (thread) =>
          thread.archivedAt === null && thread.visibility === "visible",
      )
      .map(({ id }) => id),
  );
  return threads.filter(
    (thread) =>
      thread.parentThreadId === null ||
      !liveThreadIds.has(thread.parentThreadId),
  );
}

async function listAllThreads(bb: BbPluginApi): Promise<ThreadSummary[]> {
  return listThreadsForSidebar(bb, {
    includeArchived: false,
    includeHidden: false,
  });
}

async function listSidebarThreads(bb: BbPluginApi) {
  const threads = await listThreadsForSidebar(bb, {
    includeArchived: true,
    includeHidden: true,
  });
  return threads.map((thread) => ({
    id: thread.id,
    projectId: thread.projectId,
    title: thread.title,
    titleFallback: thread.titleFallback,
    parentThreadId: thread.parentThreadId,
    sectionId: thread.sectionId,
    originKind: thread.originKind === "fork" ? ("fork" as const) : null,
    originPluginId: thread.originPluginId,
    providerId: thread.providerId,
    visibility: thread.visibility,
    isPinned: thread.pinnedAt !== null,
    isArchived: thread.archivedAt !== null,
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
    lastReadAt: thread.lastReadAt,
    latestAttentionAt: thread.latestAttentionAt,
  }));
}

function fullGroup(group: GroupingDescriptor["groups"][number]) {
  return {
    id: group.id,
    label: group.label,
    ...(group.icon === undefined ? {} : { icon: group.icon }),
    visibleWhenEmpty: group.visibleWhenEmpty ?? true,
    acceptsAssignments: group.acceptsAssignments,
    defaultCollapsed: group.defaultCollapsed ?? false,
    ...(group.defaultPlacement === undefined
      ? {}
      : { defaultPlacement: group.defaultPlacement }),
  };
}

export interface RibbonServerOptions {
  /** Commands registered on the `bb sidebar` CLI beside the placement ones. */
  extraCommands?: Record<string, ReturnType<typeof cliCommand>>;
}

/**
 * Stages, stable order, prompt actions, pull request details, icons, and the
 * `bb sidebar` CLI: everything Ribbon sidebar, Thread stages, and Icons ran
 * on the server, on the thread list this plugin forked from bb.
 */
export default async function ribbonServer(
  bb: BbPluginApi,
  { extraCommands }: RibbonServerOptions = {},
) {
  // Behavior first, then appearance: bb draws settings in this order and
  // offers no groups of its own.
  const settings = bb.settings.define({
    autoArchiveCompletedAfter: {
      type: "select",
      label: "Auto-archive completed threads",
      options: [...AUTO_ARCHIVE_OPTIONS],
      default: AUTO_ARCHIVE_COMPLETED_AFTER,
    },
    messageOnStageChange: {
      type: "boolean",
      label: "Message threads when their stage changes",
      description:
        "Send a thread a stage notice when you or another thread move it to a different stage.",
      default: true,
    },
    childThreadLines: {
      type: "select",
      label: "Child thread lines",
      description:
        "Run one bar beside child threads' titles, or branch a tree into each child's stage ring.",
      options: ["Bar", "Tree"],
      default: "Bar",
    },
    groupHeaderIcons: {
      type: "boolean",
      label: "Group header icons",
      description:
        "Show an icon beside each heading: the group's own where one is chosen, otherwise a book for a section or a folder for a project that opens and shuts with it.",
      default: true,
    },
    shimmerWorkingRows: {
      type: "boolean",
      label: "Shimmer working rows",
      description:
        "Shimmer a working thread's whole row instead of its activity indicator.",
      default: true,
    },
    longTitles: {
      type: "select",
      label: "Long titles",
      description:
        "End a title that outgrows its row with an ellipsis, fade it out at the edge, or fade it and pan it to its end while the row is hovered.",
      options: [...LONG_TITLE_OPTIONS],
      default: DEFAULT_LONG_TITLES,
    },
    tabularPullRequestDigits: {
      type: "boolean",
      label: "Equal-width PR digits",
      description: "Line pull request numbers up by giving every digit the same width.",
      default: true,
    },
    pullRequestMarks: {
      type: "boolean",
      label: "Pull request marks",
      description:
        "Mark a row's indicator with GitHub's state: a red ✗ when CI fails, changes are requested, or the branch conflicts, an amber ● while it waits on CI or a review, and a green ✓ when it is ready to merge. Auto-merge, reviewers, and check counts come from the GitHub CLI.",
      default: true,
    },
  });
  const database = bb.storage.database();
  if (reclaimLegacyDatabase(database)) {
    bb.log.info("Reclaimed the retired Thread stages plugin's database.");
  }
  bb.storage.migrate(database, [
    ...sidebarMigrations(database),
    ...ICON_MIGRATIONS,
  ]);
  for (const [name, imported] of [
    ["Ribbon sidebar", importRibbonSidebar(database)],
    ["Icons", importIcons(database)],
  ] as const) {
    if (imported !== null) {
      bb.log.info(`Imported ${imported} rows from the ${name} plugin.`);
    }
  }
  // What Ribbon sidebar chose for the settings this plugin kept, copied once
  // while that plugin is still installed. bb's plugin catalog may not answer
  // during startup, so the reconciliation schedule asks again until it does.
  const importRibbonSettings = async (): Promise<void> => {
    const key = "imported-ribbon-settings";
    if (database.prepare("SELECT key FROM ribbon_upgrade WHERE key = ?").get(key)) return;
    const { plugins } = await bb.sdk.plugins.list();
    if (plugins.some(({ id }) => id === "ribbon-sidebar")) {
      const legacy = await bb.sdk.plugins.getSettings({ pluginId: "ribbon-sidebar" });
      const values = Object.fromEntries(
        RIBBON_SETTINGS.flatMap((name): Array<[string, unknown]> => {
          const value = legacy.values[name];
          if (value === undefined) return [];
          // Ribbon chose among On, Off, and Standardized; here the icon is
          // on or off, and standard where none is chosen.
          if (name === "groupHeaderIcons") return [[name, value !== "Off"]];
          return [[name, value]];
        }),
      );
      if (Object.keys(values).length > 0) {
        await settings.experimental_set(values);
        bb.log.info(`Imported ${Object.keys(values).join(", ")} from the Ribbon sidebar plugin.`);
      }
    }
    database.prepare("INSERT OR IGNORE INTO ribbon_upgrade(key) VALUES (?)").run(key);
  };
  void importRibbonSettings().catch(() => undefined);
  const threadActions = createThreadActionsStore(database);
  const childOrder = createChildOrderStore(database);
  registerIcons(bb, database);
  registerStageMentions(bb);

  let projectGroups: GroupingDescriptor["groups"] = [];
  let personalProjectId: string | null = null;
  let sectionGroups: GroupingDescriptor["groups"] = [];
  const projectByThread = new Map<string, string>();
  const sectionByThread = new Map<string, string>();
  const projectGrouping = (): GroupingDescriptor => ({
    groupingKey: "builtin:projects",
    singularLabel: "Project",
    pluralLabel: "Projects",
    defaultGroupId: personalProjectId ?? projectGroups[0]?.id ?? "personal",
    groups: projectGroups,
    membership: {
      kind: "external",
      writable: false,
      groupIdForThread: (threadId) => projectByThread.get(threadId) ?? null,
    },
  });
  const sectionGrouping = (): GroupingDescriptor => ({
    groupingKey: "builtin:sections",
    singularLabel: "Section",
    pluralLabel: "Sections",
    defaultGroupId: "unsectioned",
    groups: sectionGroups,
    membership: {
      kind: "external",
      writable: true,
      groupIdForThread: (threadId) => sectionByThread.get(threadId) ?? null,
      setGroupIdForThread: (threadId, groupId) => {
        sectionByThread.set(threadId, groupId);
      },
    },
  });
  const stageGrouping = (): GroupingDescriptor => ({
    ...createGroupingCatalog({}).groupings[0]!,
    groupingKey: THREAD_STAGES_GROUPING_KEY,
    membership: { kind: "ribbon" },
  });
  const grouping = (groupingKey: GroupingKey): GroupingDescriptor | null => {
    if (groupingKey === "builtin:projects") return projectGrouping();
    if (groupingKey === "builtin:sections") return sectionGrouping();
    return groupingKey === THREAD_STAGES_GROUPING_KEY ? stageGrouping() : null;
  };
  const groupings = (): GroupingDescriptor[] =>
    orderedGroupings([projectGrouping(), sectionGrouping(), stageGrouping()]);
  const store = createPlacementStore(database, { grouping, groupings });
  const stageChangeMessages = createStageChangeMessages(bb, {
    enabled: async () => (await settings.get()).messageOnStageChange !== false,
    threadStagesRunning: () => true,
  });
  let sidebarThreads: ThreadSummary[] = [];

  function sidebarSnapshot() {
    return {
      groupings: groupings().map((descriptor) => ({
        groupingKey: descriptor.groupingKey,
        singularLabel: descriptor.singularLabel,
        pluralLabel: descriptor.pluralLabel,
        ...(descriptor.icon === undefined ? {} : { icon: descriptor.icon }),
        defaultGroupId: descriptor.defaultGroupId,
        groups: descriptor.groups.map(fullGroup),
        available:
          "available" in descriptor ? descriptor.available === true : true,
        membershipWritable:
          descriptor.membership.kind === "ribbon" ||
          descriptor.membership.writable,
      })),
    };
  }

  async function refreshCatalogsAndRoots() {
    const catalogBefore = JSON.stringify(sidebarSnapshot());
    const [projects, sections, threads] = await Promise.all([
      bb.sdk.projects.list({ includePersonal: true }),
      bb.sdk.threadSections.list(),
      listAllThreads(bb),
    ]);
    personalProjectId =
      projects.find(({ kind }) => kind === "personal")?.id ?? null;
    projectGroups = [...projects]
      .sort((left, right) =>
        left.kind === right.kind ? 0 : left.kind === "personal" ? 1 : -1,
      )
      .map((project) => ({
        id: project.id,
        label: project.name,
        acceptsAssignments: true,
        visibleWhenEmpty: true,
        defaultCollapsed: false,
      }));
    sectionGroups = [
      ...sections.map((section) => ({
        id: section.id,
        label: section.name,
        acceptsAssignments: true,
        visibleWhenEmpty: true,
        defaultCollapsed: false,
      })),
      {
        id: "unsectioned",
        label: "Unorganized",
        acceptsAssignments: true,
        visibleWhenEmpty: true,
        defaultCollapsed: false,
      },
    ];
    projectByThread.clear();
    sectionByThread.clear();
    for (const thread of threads) {
      projectByThread.set(thread.id, thread.projectId);
      sectionByThread.set(thread.id, thread.sectionId ?? "unsectioned");
    }
    sidebarThreads = threads;
    const liveThreadIds = new Set(
      threads
        .filter(
          (thread) =>
            thread.archivedAt === null && thread.visibility === "visible",
        )
        .map(({ id }) => id),
    );
    const eligibleRoots = [...threads]
      .sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id))
      .filter(
        (thread) =>
          thread.archivedAt === null &&
          thread.visibility === "visible" &&
          (thread.parentThreadId === null ||
            !liveThreadIds.has(thread.parentThreadId)),
      )
      .map(({ id }) => id);
    const childThreadIds = threads
      .filter(
        (thread) =>
          thread.archivedAt === null &&
          thread.visibility === "visible" &&
          thread.parentThreadId !== null &&
          liveThreadIds.has(thread.parentThreadId),
      )
      .map(({ id }) => id);
    const result = store.reconcileRoots(eligibleRoots, childThreadIds);
    if (result.changedGroupingKeys.length > 0) {
      bb.realtime.publish("placements-changed", {
        groupingKeys: result.changedGroupingKeys,
      });
    }
    return catalogBefore !== JSON.stringify(sidebarSnapshot());
  }

  function reconcileRoot(
    thread: Awaited<ReturnType<BbPluginApi["sdk"]["threads"]["get"]>>,
    eligible: boolean | "child",
  ) {
    projectByThread.set(thread.id, thread.projectId);
    sectionByThread.set(thread.id, thread.sectionId ?? "unsectioned");
    const result = store.reconcileRoot(thread.id, eligible);
    if (result.changedGroupingKeys.length > 0) {
      bb.realtime.publish("placements-changed", {
        groupingKeys: result.changedGroupingKeys,
      });
    }
  }

  async function threadEligibility(
    thread: Awaited<ReturnType<BbPluginApi["sdk"]["threads"]["get"]>>,
  ): Promise<boolean | "child"> {
    if (thread.archivedAt !== null || thread.visibility !== "visible") {
      return false;
    }
    if (thread.parentThreadId === null) return true;
    try {
      const parent = await bb.sdk.threads.get({
        threadId: thread.parentThreadId,
      });
      return parent.archivedAt !== null || parent.visibility !== "visible"
        ? true
        : "child";
    } catch {
      return true;
    }
  }

  async function updatePlacement(
    input: z.infer<typeof updatePlacementInputSchema>,
    {
      announceStageChange = true,
      actorThreadId,
    }: { announceStageChange?: boolean; actorThreadId?: string } = {},
  ) {
    const groupingKey = input.groupingKey as GroupingKey;
    const descriptor = grouping(groupingKey);
    const before = store.getPlacement({
      groupingKey,
      threadId: input.threadId,
    });
    const movingSection =
      descriptor?.groupingKey === "builtin:sections" &&
      before.ok &&
      before.value.placement.groupId !== input.groupId;
    if (!movingSection) {
      const result = store.updatePlacement({ ...input, groupingKey });
      if (result.ok) {
        bb.realtime.publish("placements-changed", {
          groupingKeys: [input.groupingKey],
        });
        if (
          announceStageChange &&
          groupingKey === THREAD_STAGES_GROUPING_KEY &&
          before.ok &&
          actorThreadId !== input.threadId
        ) {
          stageChangeMessages.announce(input.threadId, {
            origin: input.origin,
            from: before.value.placement.groupId,
            to: result.value.placement.groupId,
          });
        }
      }
      return result;
    }

    const destination = descriptor.groups.find(
      ({ id }) => id === input.groupId,
    );
    if (destination === undefined) {
      return {
        ok: false as const,
        error: {
          code: "GROUP_NOT_FOUND" as const,
          message: `Group not found: ${input.groupingKey}/${input.groupId}`,
        },
      };
    }
    if (!destination.acceptsAssignments) {
      return {
        ok: false as const,
        error: {
          code: "GROUP_NOT_ASSIGNABLE" as const,
          message: `Group does not accept assignments: ${input.groupingKey}/${input.groupId}`,
        },
      };
    }
    if (
      input.expectedRevision !== undefined &&
      input.expectedRevision !== before.value.revision
    ) {
      return {
        ok: false as const,
        error: {
          code: "REVISION_CONFLICT" as const,
          message: "Grouping revision changed.",
          revision: before.value.revision,
        },
      };
    }
    if (input.anchor?.kind === "before" || input.anchor?.kind === "after") {
      const anchorThreadId = input.anchor.threadId;
      const destinationPlacements = store.listPlacements({
        groupingKey,
        groupIds: [input.groupId],
      });
      if (
        !destinationPlacements.ok ||
        !destinationPlacements.value.items.some(
          ({ threadId }) => threadId === anchorThreadId,
        )
      ) {
        return {
          ok: false as const,
          error: {
            code: "ANCHOR_INELIGIBLE" as const,
            message: `Anchor is not eligible in ${input.groupingKey}/${input.groupId}: ${anchorThreadId}`,
          },
        };
      }
    }

    const originalSectionId =
      before.value.placement.groupId === "unsectioned"
        ? null
        : before.value.placement.groupId;
    const nextSectionId =
      input.groupId === "unsectioned" ? null : input.groupId;
    await bb.sdk.threads.update({
      threadId: input.threadId,
      sectionId: nextSectionId,
    });
    const result = store.updatePlacement({ ...input, groupingKey });
    if (!result.ok) {
      try {
        await bb.sdk.threads.update({
          threadId: input.threadId,
          sectionId: originalSectionId,
        });
        sectionByThread.set(input.threadId, before.value.placement.groupId);
      } catch (rollbackError) {
        bb.log.error(
          `Could not roll back Section membership: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`,
        );
      }
      return result;
    }
    bb.realtime.publish("placements-changed", {
      groupingKeys: [input.groupingKey],
    });
    return result;
  }

  function reorderChildren(parentThreadId: string, threadIds: string[]) {
    if (childOrder.setOrder(parentThreadId, threadIds)) {
      bb.realtime.publish("child-order-changed", null);
    }
  }

  await refreshCatalogsAndRoots();
  await migrateWorkflowShortcuts(bb, database);
  const workflow = createWorkflowRuntime(
    bb,
    store,
    updatePlacement,
    {
      get: async () => ({
        autoArchiveCompletedAfter:
          (await settings.get()).autoArchiveCompletedAfter ?? AUTO_ARCHIVE_COMPLETED_AFTER,
      }),
    },
    {
      ranks: () => childOrder.list(),
      reorder: reorderChildren,
    },
  );
  const pullRequestDetails = createPullRequestDetailsService({
    run: createGhGraphqlRunner(),
    onError(error) {
      bb.log.warn(`GitHub pull request details unavailable: ${error.message}`);
    },
  });

  bb.rpc.register(rpcContract, {
    ...workflow,
    listThreadActionsV1() {
      return { threads: threadActions.list() };
    },
    async saveThreadActionsV1({ threadId, actions, hideTitle }) {
      const thread = await bb.sdk.threads.get({ threadId });
      if (thread.archivedAt !== null) {
        throw new Error("Archived threads cannot have actions.");
      }
      threadActions.save(threadId, actions, hideTitle);
      bb.realtime.publish("thread-actions-changed", { threadId });
      return { ok: true as const };
    },
    async runThreadActionV1({ threadId, actionId }) {
      const action = threadActions.get(threadId, actionId);
      if (!action) throw new Error("This thread action no longer exists.");
      await bb.sdk.threads.send({
        threadId,
        input: [{ type: "text", text: action.prompt, mentions: [] }],
        mode: "auto",
      });
      return { ok: true as const };
    },
    async createSectionV1({ name }) {
      const section = await bb.sdk.threadSections.create({ name });
      await refreshCatalogsAndRoots();
      return { section: { id: section.id, name: section.name } };
    },
    async deleteEntityV1({ groupingKey, id }) {
      if (groupingKey === "builtin:projects") {
        await bb.sdk.projects.delete({ projectId: id });
      } else {
        await bb.sdk.threadSections.delete({ id });
      }
      const order = store.deleteGroupOrder(groupingKey, id);
      await refreshCatalogsAndRoots();
      if (order.deleted > 0) {
        bb.realtime.publish("placements-changed", {
          groupingKeys: [groupingKey],
        });
      }
      return { ok: true as const };
    },
    getPlacementV1(input) {
      return store.getPlacement({
        ...input,
        groupingKey: input.groupingKey as GroupingKey,
      });
    },
    listChildOrderV1() {
      return { items: childOrder.list() };
    },
    listPlacementsV1(input) {
      return store.listPlacements({
        ...input,
        groupingKey: input.groupingKey as GroupingKey,
      });
    },
    async listThreadsV1() {
      return { threads: await listSidebarThreads(bb) };
    },
    async renameEntityV1({ groupingKey, id, name }) {
      if (groupingKey === "builtin:projects") {
        await bb.sdk.projects.update({ projectId: id, name });
      } else {
        await bb.sdk.threadSections.update({ id, name });
      }
      await refreshCatalogsAndRoots();
      return { ok: true as const };
    },
    async placeNewThreadV1({ groupingKey, groupId, threadId }) {
      const thread = await bb.sdk.threads.get({ threadId });
      reconcileRoot(thread, await threadEligibility(thread));
      return updatePlacement(
        {
          groupingKey,
          groupId,
          threadId,
          origin: "ui",
        },
        { announceStageChange: false },
      );
    },
    async pullRequestDetailsV1({ requests }) {
      return { details: await pullRequestDetails.get(requests) };
    },
    reorderChildrenV1({ parentThreadId, threadIds }) {
      reorderChildren(parentThreadId, threadIds);
      return { ok: true as const };
    },
    async searchThreadIdsV1({ query }) {
      const result = await bb.sdk.threads.search({
        query,
        limitPerGroup: "50",
      });
      const seen = new Set<string>();
      const threads = sidebarThreadsFromSearchResult(result);
      const threadIds = threads
        .map(({ id }) => id)
        .filter((threadId) => {
          if (seen.has(threadId)) return false;
          seen.add(threadId);
          return true;
        });
      return { threadIds, threads };
    },
    sidebarSnapshotV1() {
      return sidebarSnapshot();
    },
    async synchronizeV1() {
      await refreshCatalogsAndRoots();
      return sidebarSnapshot();
    },
    updatePlacementV1: updatePlacement,
    async updateSettingsV1(values) {
      await bb.sdk.plugins.updateSettings({
        pluginId: bb.pluginId,
        values,
      });
      return { ok: true as const };
    },
  });

  const cli = defineRibbonSidebarCli({
    store,
    groupings,
    threads: async ({ includeArchived, includeHidden, includeChildren }) => {
      const threads =
        includeArchived || includeHidden
          ? await listThreadsForSidebar(bb, {
              includeArchived,
              includeHidden,
            })
          : sidebarThreads;
      for (const thread of threads) {
        projectByThread.set(thread.id, thread.projectId);
        sectionByThread.set(thread.id, thread.sectionId ?? "unsectioned");
      }
      return includeChildren ? threads : sidebarRootThreads(threads);
    },
    updatePlacement,
    async hierarchy() {
      return {
        threads: await listAllThreads(bb),
        ranks: childOrder.list(),
      };
    },
    reorderChildren,
    extraCommands,
  });
  bb.cli.register({
    ...cli,
    async run(argv, context) {
      await refreshCatalogsAndRoots();
      const result = await cli.run(argv, context);
      if (
        result.exitCode === 0 &&
        ["place", "rekey"].includes(argv[0] ?? "")
      ) {
        bb.realtime.publish("placements-changed", {
          groupingKeys: groupings().map(({ groupingKey }) => groupingKey),
        });
      }
      return result;
    },
  });

  bb.events.on("thread.deleted", ({ thread }) => {
    threadActions.delete(thread.id);
    if (childOrder.deleteThread(thread.id)) {
      bb.realtime.publish("child-order-changed", null);
    }
    projectByThread.delete(thread.id);
    sectionByThread.delete(thread.id);
    const result = store.deleteThread(thread.id);
    if (result.changedGroupingKeys.length > 0) {
      bb.realtime.publish("placements-changed", {
        groupingKeys: result.changedGroupingKeys,
      });
    }
  });
  registerThreadGroupInheritance(bb, {
    eligibleRoot: threadEligibility,
    reconcileRoot,
    groupings,
    getPlacement: store.getPlacement,
    updatePlacement,
  });
  bb.events.on("thread.created", async ({ thread }) => {
    reconcileRoot(thread, await threadEligibility(thread));
  });
  bb.events.on("thread.archived", ({ thread }) => {
    reconcileRoot(thread, false);
  });
  bb.background.schedule("catalog-reconciliation", "* * * * *", async () => {
    await importRibbonSettings().catch(() => undefined);
    if (await refreshCatalogsAndRoots()) {
      bb.realtime.publish("catalog-changed", null);
    }
  });
  settings.onChange(() => {
    bb.realtime.publish("settings-changed", null);
  });
  await refreshCatalogsAndRoots();
  bb.log.info("Thread stages loaded");
}
