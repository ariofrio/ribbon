import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { sidebarThreadsFromSearchResult } from "./search-results";
import {
  acknowledgePlacementMigrationOutputSchema,
  getPlacementInputSchema,
  getPlacementOutputSchema,
  groupingCatalogSchema,
  iconDataSchema,
  invalidateGroupingCatalogInputSchema,
  invalidateGroupingCatalogOutputSchema,
  listPlacementsInputSchema,
  listPlacementsOutputSchema,
  threadStagesMigrationSnapshotSchema,
  updatePlacementInputSchema,
  updatePlacementOutputSchema,
} from "./contracts";
import { migrateThreadStages } from "./migration";
import {
  RIBBON_SIDEBAR_MIGRATIONS,
  createPlacementStore,
  type GroupingDescriptor,
  type GroupingKey,
} from "./placement-store";
import { createProviderCatalog } from "./provider-catalog";
import { runRibbonSidebarCli } from "./cli";
import { orderedGroupings } from "./grouping-order";
import { createPreviewStore } from "./preview-store";
import { registerThreadPreviews } from "./thread-previews";
import { registerThreadGroupInheritance } from "./group-inheritance";

const ICONS_PLUGIN_ID = "icons";
const iconGlyphSchema = z.array(
  z.tuple([z.string(), z.record(z.string(), z.any())]),
);
const iconDefaultsSchema = z.object({
  project: iconGlyphSchema,
  personal: iconGlyphSchema,
  section: iconGlyphSchema,
});
const entityIconSchema = z.object({
  kind: z.enum(["project", "section"]),
  id: z.string(),
  icon: z.string(),
  color: z.string().nullable(),
  glyph: iconGlyphSchema,
});
const iconsAnswerSchema = z.object({
  icons: z.array(z.unknown()),
  defaults: iconDefaultsSchema,
});
const entityIconsSchema = z.object({
  icons: z.array(entityIconSchema),
  defaults: iconDefaultsSchema,
});

const sidebarGroupSchema = z
  .object({
    id: z.string(),
    label: z.string(),
    icon: iconDataSchema.optional(),
    visibleWhenEmpty: z.boolean(),
    acceptsAssignments: z.boolean(),
    defaultCollapsed: z.boolean(),
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

export const rpcContract = defineRpcContract({
  addProjectLocalPathV1: {
    input: z.object({ projectId: z.string().min(1).max(256) }).strict(),
    output: z.object({ added: z.boolean() }).strict(),
  },
  createProjectV1: {
    input: z.null(),
    output: z
      .object({
        project: z
          .object({ id: z.string(), name: z.string() })
          .strict()
          .nullable(),
      })
      .strict(),
  },
  createSectionV1: {
    input: z.object({ name: z.string().trim().min(1).max(256) }).strict(),
    output: z
      .object({ section: z.object({ id: z.string(), name: z.string() }).strict() })
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
  invalidateGroupingCatalogV1: {
    input: invalidateGroupingCatalogInputSchema,
    output: invalidateGroupingCatalogOutputSchema,
  },
  listPlacementsV1: {
    input: listPlacementsInputSchema,
    output: listPlacementsOutputSchema,
  },
  listPreviewsV1: {
    input: z.object({ threadIds: z.array(z.string().min(1).max(256)) }).strict(),
    output: z
      .object({
        previews: z.array(
          z
            .object({
              threadId: z.string(),
              preview: z.string().nullable(),
            })
            .strict(),
        ),
      })
      .strict(),
  },
  listProjectActionStatesV1: {
    input: z.null(),
    output: z
      .object({
        projects: z.array(
          z
            .object({
              id: z.string(),
              canAddLocalPath: z.boolean(),
            })
            .strict(),
        ),
      })
      .strict(),
  },
  placeNewThreadV1: {
    input: updatePlacementInputSchema.omit({
      anchor: true,
      expectedRevision: true,
      origin: true,
    }),
    output: updatePlacementOutputSchema,
  },
  listEntityIconsV1: {
    input: z.null(),
    output: entityIconsSchema,
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
  reorderPinnedV1: {
    input: z
      .object({
        threadId: z.string().min(1).max(256),
        previousThreadId: z.string().min(1).max(256).nullable(),
        nextThreadId: z.string().min(1).max(256).nullable(),
      })
      .strict(),
    output: z.object({ reordered: z.literal(true) }).strict(),
  },
  sidebarSnapshotV1: {
    input: z.null(),
    output: sidebarSnapshotSchema,
  },
  synchronizeV1: {
    input: z.object({ migrateThreadStages: z.boolean() }).strict(),
    output: sidebarSnapshotSchema,
  },
  updatePlacementV1: {
    input: updatePlacementInputSchema,
    output: updatePlacementOutputSchema,
  },
  updateSettingsV1: {
    input: z
      .object({
        showProjectsAndSections: z.boolean().optional(),
        showMessagePreviews: z.boolean().optional(),
        showCollapsedGroupIndicators: z.boolean().optional(),
        showGroupHeaderIcons: z.boolean().optional(),
      })
      .strict(),
    output: z.object({ ok: z.literal(true) }).strict(),
  },
});

interface ThreadSummary {
  id: string;
  projectId: string;
  sectionId: string | null;
  parentThreadId: string | null;
  archivedAt: number | null;
  visibility: "visible" | "hidden";
}

async function listAllThreads(bb: BbPluginApi): Promise<ThreadSummary[]> {
  const threads: ThreadSummary[] = [];
  const limit = 100;
  while (threads.length <= 10_000) {
    const page = await bb.sdk.threads.list({
      archived: false,
      includeHidden: false,
      limit,
      offset: threads.length,
    });
    threads.push(...page);
    if (page.length < limit) return threads;
  }
  throw new Error("Thread list exceeds 10000 entries.");
}

function fullGroup(group: GroupingDescriptor["groups"][number]) {
  return {
    id: group.id,
    label: group.label,
    ...(group.icon === undefined ? {} : { icon: group.icon }),
    visibleWhenEmpty: group.visibleWhenEmpty ?? true,
    acceptsAssignments: group.acceptsAssignments,
    defaultCollapsed: group.defaultCollapsed ?? false,
  };
}

export default async function plugin(bb: BbPluginApi) {
  const settings = bb.settings.define({
    showProjectsAndSections: {
      type: "boolean",
      label: "Show groups",
      description: "Show grouping, filtering, and group management controls in the sidebar.",
      default: true,
    },
    showMessagePreviews: {
      type: "boolean",
      label: "Show message previews",
      description: "Show the latest message preview below each thread title.",
      default: true,
    },
    showCollapsedGroupIndicators: {
      type: "boolean",
      label: "Show collapsed-group indicators (experimental)",
      description:
        "Show live activity indicators on collapsed groups outside Thread stages.",
      default: false,
    },
    showGroupHeaderIcons: {
      type: "boolean",
      label: "Show group header icons",
      description: "Show each group’s icon beside its sidebar heading.",
      default: true,
    },
  });
  const database = bb.storage.database();
  bb.storage.migrate(database, RIBBON_SIDEBAR_MIGRATIONS);
  const previews = createPreviewStore(database);
  registerThreadPreviews(bb, previews);

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

  const providers = createProviderCatalog(database, {
    call: (providerPluginId) =>
      bb.sdk.plugins.callRpc({
        pluginId: providerPluginId,
        method: "getGroupingCatalogV1",
        input: null,
        outputSchema: groupingCatalogSchema,
      }),
  });
  const grouping = (groupingKey: GroupingKey): GroupingDescriptor | null => {
    if (groupingKey === "builtin:projects") return projectGrouping();
    if (groupingKey === "builtin:sections") return sectionGrouping();
    return providers.getGrouping(groupingKey);
  };
  const groupings = (): GroupingDescriptor[] =>
    orderedGroupings([
      projectGrouping(),
      sectionGrouping(),
      ...providers.allGroupings(),
    ]);
  const store = createPlacementStore(database, { grouping, groupings });
  let threadStagesInstalled = false;
  let mountedMigrationPending = false;

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

  function providerCatalogFingerprint() {
    return JSON.stringify(
      providers.allGroupings().map((descriptor) => ({
        providerPluginId: descriptor.providerPluginId,
        groupingId: descriptor.groupingId,
        singularLabel: descriptor.singularLabel,
        pluralLabel: descriptor.pluralLabel,
        icon: descriptor.icon,
        defaultGroupId: descriptor.defaultGroupId,
        groups: descriptor.groups,
        available: descriptor.available,
      })),
    );
  }

  async function refreshCatalogsAndRoots() {
    const catalogBefore = providerCatalogFingerprint();
    const [installed, projects, sections, threads] = await Promise.all([
      bb.sdk.plugins.list(),
      bb.sdk.projects.list({ includePersonal: true }),
      bb.sdk.threadSections.list(),
      listAllThreads(bb),
    ]);
    const providerPluginIds = installed.plugins
      .filter(
        (candidate) =>
          candidate.id !== bb.pluginId && candidate.status === "running",
      )
      .map(({ id }) => id);
    threadStagesInstalled = installed.plugins.some(
      ({ id, status }) => id === "thread-stages" && status === "running",
    );
    await providers.refresh(providerPluginIds);

    personalProjectId =
      projects.find(({ kind }) => kind === "personal")?.id ?? null;
    projectGroups = [...projects]
      .sort((left, right) =>
        left.kind === right.kind ? 0 : left.kind === "personal" ? 1 : -1,
      )
      .map((project) => ({
        id: project.id,
        label: project.kind === "personal" ? "Chats" : project.name,
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
    const liveThreadIds = new Set(
      threads
        .filter(
          (thread) =>
            thread.archivedAt === null && thread.visibility === "visible",
        )
        .map(({ id }) => id),
    );
    const eligibleRoots = threads
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
    return catalogBefore !== providerCatalogFingerprint();
  }

  function reconcileRoot(
    thread: Awaited<ReturnType<BbPluginApi["sdk"]["threads"]["get"]>>,
    eligible: boolean,
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

  async function migrateFromThreadStages() {
    if (!threadStagesInstalled) {
      throw new Error("Thread stages is not installed and running.");
    }
    return migrateThreadStages(store, {
      getPlacementMigrationSnapshotV1: () =>
        bb.sdk.plugins.callRpc({
          pluginId: "thread-stages",
          method: "getPlacementMigrationSnapshotV1",
          input: null,
          outputSchema: threadStagesMigrationSnapshotSchema,
        }),
      acknowledgePlacementMigrationV1: (input) =>
        bb.sdk.plugins.callRpc({
          pluginId: "thread-stages",
          method: "acknowledgePlacementMigrationV1",
          input,
          outputSchema: acknowledgePlacementMigrationOutputSchema,
        }),
    });
  }

  async function attemptMountedMigration() {
    if (!mountedMigrationPending || !threadStagesInstalled) return false;
    try {
      await migrateFromThreadStages();
      mountedMigrationPending = false;
      return true;
    } catch (error) {
      bb.log.warn(
        `Could not migrate Thread stages placement; reconciliation will retry: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }

  async function updatePlacement(
    input: z.infer<typeof updatePlacementInputSchema>,
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
      }
      return result;
    }

    const destination = descriptor.groups.find(({ id }) => id === input.groupId);
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
    const nextSectionId = input.groupId === "unsectioned" ? null : input.groupId;
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

  bb.rpc.register(rpcContract, {
    async addProjectLocalPathV1({ projectId }) {
      const { primaryHostId } = await bb.sdk.system.config();
      if (!primaryHostId) throw new Error("No primary host is available.");
      const project = await bb.sdk.projects.get({ projectId });
      if (
        project.kind === "personal" ||
        project.sources.some(
          (source) =>
            source.type === "local_path" && source.hostId === primaryHostId,
        )
      ) {
        return { added: false };
      }
      const { path } = await bb.sdk.hosts.pickFolder({
        hostId: primaryHostId,
        clientHostId: primaryHostId,
      });
      if (path === null) return { added: false };
      await bb.sdk.projects.sources.add({
        projectId,
        type: "local_path",
        hostId: primaryHostId,
        path,
      });
      return { added: true };
    },
    async createProjectV1() {
      const { primaryHostId } = await bb.sdk.system.config();
      if (!primaryHostId) throw new Error("No primary host is available.");
      const { path } = await bb.sdk.hosts.pickFolder({
        hostId: primaryHostId,
        clientHostId: primaryHostId,
      });
      if (path === null) return { project: null };
      const trimmedPath = path.replace(/[\\/]+$/u, "");
      const name = trimmedPath.split(/[\\/]/u).at(-1)?.trim();
      if (!name) throw new Error("The selected folder has no project name.");
      const project = await bb.sdk.projects.create({
        name,
        source: { type: "local_path", hostId: primaryHostId, path },
      });
      await refreshCatalogsAndRoots();
      return { project: { id: project.id, name: project.name } };
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
    invalidateGroupingCatalogV1({ providerPluginId }) {
      providers.invalidate(providerPluginId);
      void refreshCatalogsAndRoots()
        .then(() => {
          bb.realtime.publish("catalog-changed", null);
        })
        .catch((error: unknown) => {
          bb.log.warn(
            `Could not refresh grouping catalogs: ${error instanceof Error ? error.message : String(error)}`,
          );
        });
      return null;
    },
    listPlacementsV1(input) {
      return store.listPlacements({
        ...input,
        groupingKey: input.groupingKey as GroupingKey,
      });
    },
    listPreviewsV1({ threadIds }) {
      return { previews: previews.list(threadIds) };
    },
    async listProjectActionStatesV1() {
      const [{ primaryHostId }, projects] = await Promise.all([
        bb.sdk.system.config(),
        bb.sdk.projects.list(),
      ]);
      return {
        projects: projects
          .filter((project) => project.kind === "standard")
          .map((project) => ({
            id: project.id,
            canAddLocalPath:
              primaryHostId !== null &&
              !project.sources.some(
                (source) =>
                  source.type === "local_path" &&
                  source.hostId === primaryHostId,
              ),
          })),
      };
    },
    async listEntityIconsV1() {
      const answer = await bb.sdk.plugins.callRpc({
        pluginId: ICONS_PLUGIN_ID,
        method: "listIcons",
        input: null,
        outputSchema: iconsAnswerSchema,
      });
      return {
        ...answer,
        icons: answer.icons.flatMap((icon) => {
          const parsed = entityIconSchema.safeParse(icon);
          return parsed.success ? [parsed.data] : [];
        }),
      };
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
      reconcileRoot(
        thread,
        thread.parentThreadId === null &&
          thread.archivedAt === null &&
          thread.visibility === "visible",
      );
      return updatePlacement({
        groupingKey,
        groupId,
        threadId,
        anchor: { kind: "end" },
        origin: "ui",
      });
    },
    async reorderPinnedV1({ threadId, previousThreadId, nextThreadId }) {
      await bb.sdk.threads.reorderPinned({
        threadId,
        previousThreadId,
        nextThreadId,
      });
      return { reordered: true as const };
    },
    async searchThreadIdsV1({ query }) {
      const result = await bb.sdk.threads.search({
        query,
        limitPerGroup: "50",
      });
      const seen = new Set<string>();
      const threads = sidebarThreadsFromSearchResult(result);
      const threadIds = threads.map(({ id }) => id).filter((threadId) => {
        if (seen.has(threadId)) return false;
        seen.add(threadId);
        return true;
      });
      return { threadIds, threads };
    },
    sidebarSnapshotV1() {
      return sidebarSnapshot();
    },
    async synchronizeV1({ migrateThreadStages: shouldMigrate }) {
      await refreshCatalogsAndRoots();
      if (shouldMigrate) mountedMigrationPending = true;
      await attemptMountedMigration();
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

  bb.cli.register({
    name: "ribbon-sidebar",
    summary: "Inspect and change Ribbon sidebar placement",
    commands: [
      { name: "groupings", summary: "List groupings", usage: "bb ribbon-sidebar groupings [--json]" },
      { name: "groups", summary: "List groups", usage: "bb ribbon-sidebar groups <grouping> [--json]" },
      { name: "list", summary: "List threads", usage: "bb ribbon-sidebar list [--scope <group-ref>] [--group-by <grouping>] [--json]" },
      { name: "show", summary: "Show thread placement", usage: "bb ribbon-sidebar show [thread] [--self] [--json]" },
      { name: "place", summary: "Place a thread", usage: "bb ribbon-sidebar place [thread] [--self] --to <group-ref> [--before <thread>|--after <thread>] [--json]" },
      { name: "migrate", summary: "Migrate legacy placement", usage: "bb ribbon-sidebar migrate thread-stages [--json]" },
      { name: "rekey", summary: "Rekey provider placement", usage: "bb ribbon-sidebar rekey --from <plugin-key> --to <plugin-key> [--json]" },
    ],
    async run(argv, context) {
      await refreshCatalogsAndRoots();
      const result = await runRibbonSidebarCli(
        {
          store,
          groupings,
          updatePlacement,
          migrateThreadStages: migrateFromThreadStages,
        },
        argv,
        context.threadId ? { threadId: context.threadId } : {},
      );
      if (
        result.exitCode === 0 &&
        ["place", "migrate", "rekey"].includes(argv[0] ?? "")
      ) {
        bb.realtime.publish("placements-changed", {
          groupingKeys: groupings().map(({ groupingKey }) => groupingKey),
        });
      }
      return result;
    },
  });

  bb.events.on("thread.deleted", ({ thread }) => {
    previews.delete(thread.id);
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
    reconcileRoot,
    groupings,
    getPlacement: store.getPlacement,
    updatePlacement,
  });
  bb.events.on("thread.created", ({ thread }) => {
    reconcileRoot(
      thread,
      thread.parentThreadId === null &&
        thread.archivedAt === null &&
        thread.visibility === "visible",
    );
  });
  bb.events.on("thread.archived", ({ thread }) => {
    reconcileRoot(thread, false);
  });
  bb.background.schedule("catalog-reconciliation", "* * * * *", async () => {
    const catalogChanged = await refreshCatalogsAndRoots();
    const migrationCompleted = await attemptMountedMigration();
    if (catalogChanged) {
      bb.realtime.publish("catalog-changed", null);
    }
    if (migrationCompleted) {
      bb.realtime.publish("placements-changed", {
        groupingKeys: ["plugin:thread-stages:stages"],
      });
    }
  });
  settings.onChange(() => {
    bb.realtime.publish("settings-changed", null);
  });
  await refreshCatalogsAndRoots();
  bb.log.info("Ribbon sidebar loaded");
}
