import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";
import {
  AUTO_ARCHIVE_OPTIONS,
  registerCompletedAutoArchive,
} from "./auto-archive";
import { runThreadWorkflowCli } from "./cli";
import { listAllThreads } from "./list-all-threads";
import { sortExplicitPinnedThreadIds } from "./pinned-threads";
import { sidebarThreadsFromSearchResult } from "./search-results";
import { resolveStageChord } from "./workflow-chords";
import { resolveWorkflowReorder } from "./workflow-reorder";
import {
  THREAD_WORKFLOW_MIGRATIONS,
  createThreadWorkflowStore,
} from "./store";
import { registerThreadWorkflow } from "./workflow-automation";
import { registerThreadPreviews } from "./thread-preview";
import {
  WORKFLOW_STAGES,
  enabledWorkflowStages,
  type WorkflowStage,
} from "./workflow-stage";
import {
  partitionWorkflowThreads,
  rootThreadIdByThreadId,
  type WorkflowHierarchyThread,
} from "./root-thread-ownership";

const workflowStageSchema = z.enum(WORKFLOW_STAGES);
const sectionSchema = z
  .object({
    id: z.string(),
    name: z.string(),
  })
  .strict();
const assignmentSchema = z
  .object({
    threadId: z.string(),
    workflowStage: workflowStageSchema,
    sortKey: z.string().min(1),
    updatedAt: z.number().int(),
  })
  .strict();
const destinationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("stay") }).strict(),
  z
    .object({
      kind: z.literal("thread"),
      threadId: z.string(),
      projectId: z.string().nullable(),
    })
    .strict(),
  z.object({ kind: z.literal("compose") }).strict(),
]);
type ChordDestination = z.infer<typeof destinationSchema>;
const stateSchema = z
  .object({
    assignments: z.array(assignmentSchema),
  })
  .strict();
const previewsSchema = z
  .object({
    previews: z.array(
      z
        .object({
          threadId: z.string(),
          preview: z.string().max(500).nullable(),
        })
        .strict(),
    ),
  })
  .strict();
const searchResultSchema = z
  .object({
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
  .strict();
const projectSummarySchema = z
  .object({
    id: z.string(),
    name: z.string(),
  })
  .strict();

export const rpcContract = defineRpcContract({
  createProjectFromFolder: {
    input: z.null(),
    output: z.object({ project: projectSummarySchema.nullable() }).strict(),
  },
  addProjectLocalPath: {
    input: z.object({ projectId: z.string().min(1).max(256) }).strict(),
    output: z.object({ added: z.boolean() }).strict(),
  },
  createSection: {
    input: z.object({ name: z.string().trim().min(1).max(256) }).strict(),
    output: z.object({ section: sectionSchema }).strict(),
  },
  createSectionForThread: {
    input: z
      .object({
        threadId: z.string().min(1).max(256),
        name: z.string().trim().min(1).max(256),
      })
      .strict(),
    output: z.object({ section: sectionSchema }).strict(),
  },
  deleteProject: {
    input: z.object({ projectId: z.string().min(1).max(256) }).strict(),
    output: z.object({ ok: z.literal(true) }).strict(),
  },
  deleteSection: {
    input: z.object({ sectionId: z.string().min(1).max(256) }).strict(),
    output: z.object({ ok: z.literal(true) }).strict(),
  },
  listProjectActionStates: {
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
  listSections: {
    input: z.null(),
    output: z.object({ sections: z.array(sectionSchema) }).strict(),
  },
  listState: {
    input: z.null(),
    output: stateSchema,
  },
  listPreviews: {
    input: z.null(),
    output: previewsSchema,
  },
  listPinnedThreadIds: {
    input: z.null(),
    output: z.object({ threadIds: z.array(z.string()) }).strict(),
  },
  reorderPinnedThread: {
    input: z
      .object({
        threadId: z.string().min(1).max(256),
        previousThreadId: z.string().min(1).max(256).nullable(),
        nextThreadId: z.string().min(1).max(256).nullable(),
      })
      .strict(),
    output: z.object({ threadIds: z.array(z.string()) }).strict(),
  },
  searchThreads: {
    input: z
      .object({
        query: z.string().trim().min(1).max(500),
      })
      .strict(),
    output: searchResultSchema,
  },
  setThreadSection: {
    input: z
      .object({
        threadId: z.string().min(1).max(256),
        sectionId: z.string().min(1).max(256).nullable(),
      })
      .strict(),
    output: z.object({ sectionId: z.string().nullable() }).strict(),
  },
  syncThreads: {
    input: z
      .object({
        rootThreadIds: z.array(z.string().min(1).max(256)).max(10_000),
        childThreadIds: z.array(z.string().min(1).max(256)).max(10_000),
      })
      .strict(),
    output: stateSchema,
  },
  moveThread: {
    input: z
      .object({
        threadId: z.string().min(1).max(256),
        workflowStage: workflowStageSchema,
        previousThreadId: z.string().min(1).max(256).nullable(),
        nextThreadId: z.string().min(1).max(256).nullable(),
      })
      .strict(),
    output: stateSchema,
  },
  setWorkflowStage: {
    input: z
      .object({
        threadId: z.string().min(1).max(256),
        workflowStage: workflowStageSchema,
      })
      .strict(),
    output: z.object({ destination: destinationSchema }).strict(),
  },
  reorderThread: {
    input: z
      .object({
        threadId: z.string().min(1).max(256),
        scope: z.enum(["step", "edge", "stage"]),
        direction: z.union([z.literal(-1), z.literal(1)]),
      })
      .strict(),
    output: stateSchema,
  },
  renameProject: {
    input: z
      .object({
        projectId: z.string().min(1).max(256),
        name: z.string().trim().min(1).max(256),
      })
      .strict(),
    output: z.object({ ok: z.literal(true) }).strict(),
  },
  renameSection: {
    input: z
      .object({
        sectionId: z.string().min(1).max(256),
        name: z.string().trim().min(1).max(256),
      })
      .strict(),
    output: z.object({ ok: z.literal(true) }).strict(),
  },
});

export default function plugin(bb: BbPluginApi) {
  const settings = bb.settings.define({
    showSidebarFilter: {
      type: "boolean",
      label: "Show sections and projects in sidebar",
      description:
        "Show the Sections and projects filter and management controls in the sidebar.",
      default: true,
    },
    showCollapsedStageIndicators: {
      type: "boolean",
      label: "Show collapsed stage indicators (experimental)",
      description:
        "Show the highest-priority thread activity indicator in collapsed stage headers.",
      default: false,
    },
    showThreadPreviews: {
      type: "boolean",
      label: "Show thread message previews",
      description: "Show the latest message preview below each thread title.",
      default: true,
    },
    showDeferredStage: {
      type: "boolean",
      label: "Show Deferred stage",
      description:
        "Allow threads to move into Deferred. A nonempty Deferred stage remains visible until it is emptied.",
      default: true,
    },
    showBlockedStage: {
      type: "boolean",
      label: "Show Blocked stage",
      description:
        "Allow threads to move into Blocked. A nonempty Blocked stage remains visible until it is emptied.",
      default: true,
    },
    autoArchiveCompletedAfter: {
      type: "select",
      label: "Auto-archive completed threads",
      description:
        "Archive unpinned Completed thread hierarchies after they have stayed in that stage for the selected time.",
      options: [...AUTO_ARCHIVE_OPTIONS],
      default: "7 days",
    },
  });
  const db = bb.storage.database();
  bb.storage.migrate(db, THREAD_WORKFLOW_MIGRATIONS);
  const store = createThreadWorkflowStore(db);

  function requireRootThread(
    threadId: string,
    threads: readonly WorkflowHierarchyThread[],
  ): void {
    const rootId = rootThreadIdByThreadId(threads).get(threadId);
    if (rootId === threadId) return;
    throw new Error(
      rootId
        ? `Child thread ${threadId} has no stage; its stage belongs to root thread ${rootId}.`
        : `Thread ${threadId} is not a root thread.`,
    );
  }

  async function requireEnabledStage(stage: WorkflowStage): Promise<void> {
    const enabledStages = enabledWorkflowStages(await settings.get());
    if (enabledStages.includes(stage)) return;
    throw new Error(`Stage ${stage} is disabled in Thread stages settings.`);
  }

  bb.rpc.register(rpcContract, {
    async createProjectFromFolder() {
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
        source: {
          type: "local_path",
          hostId: primaryHostId,
          path,
        },
      });
      return { project: { id: project.id, name: project.name } };
    },
    async addProjectLocalPath({ projectId }) {
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
    async createSection({ name }) {
      const section = await bb.sdk.threadSections.create({ name });
      return { section: { id: section.id, name: section.name } };
    },
    async createSectionForThread({ threadId, name }) {
      const section = await bb.sdk.threadSections.create({ name });
      await bb.sdk.threads.update({ threadId, sectionId: section.id });
      return { section: { id: section.id, name: section.name } };
    },
    async deleteProject({ projectId }) {
      await bb.sdk.projects.delete({ projectId });
      return { ok: true as const };
    },
    async deleteSection({ sectionId }) {
      await bb.sdk.threadSections.delete({ id: sectionId });
      return { ok: true as const };
    },
    async listProjectActionStates() {
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
    async listSections() {
      const sections = await bb.sdk.threadSections.list();
      return {
        sections: sections.map(({ id, name }) => ({ id, name })),
      };
    },
    listState: () => store.listState(),
    listPreviews: () => ({ previews: store.listPreviews() }),
    async listPinnedThreadIds() {
      const threads = await listAllThreads(({ limit, offset }) =>
        bb.sdk.threads.list({ archived: false, limit, offset }),
      );
      return { threadIds: sortExplicitPinnedThreadIds(threads) };
    },
    async reorderPinnedThread(input) {
      const threads = await bb.sdk.threads.reorderPinned(input);
      return { threadIds: sortExplicitPinnedThreadIds(threads) };
    },
    async searchThreads({ query }) {
      const result = await bb.sdk.threads.search({
        query,
        limitPerGroup: "50",
      });
      return {
        threads: sidebarThreadsFromSearchResult(result),
      };
    },
    async setThreadSection({ threadId, sectionId }) {
      await bb.sdk.threads.update({ threadId, sectionId });
      return { sectionId };
    },
    syncThreads({ rootThreadIds, childThreadIds }) {
      const previousIds = store
        .listState()
        .assignments.map(({ threadId }) => threadId)
        .join("\n");
      const state = store.syncRootThreads(rootThreadIds, childThreadIds);
      if (
        state.assignments.map(({ threadId }) => threadId).join("\n") !==
        previousIds
      ) {
        bb.realtime.publish("state-changed", { threadId: null });
      }
      return state;
    },
    async moveThread(input) {
      await requireEnabledStage(input.workflowStage);
      const threads = await listAllThreads(({ limit, offset }) =>
        bb.sdk.threads.list({ archived: false, limit, offset }),
      );
      requireRootThread(input.threadId, threads);
      const state = store.reorderThread(input);
      bb.realtime.publish("state-changed", { threadId: input.threadId });
      return state;
    },
    async setWorkflowStage({ threadId, workflowStage }) {
      await requireEnabledStage(workflowStage);
      const threads = await listAllThreads(({ limit, offset }) =>
        bb.sdk.threads.list({ archived: false, limit, offset }),
      );
      requireRootThread(threadId, threads);
      const chord = resolveStageChord({
        threadId,
        workflowStage,
        threads,
        assignments: store.listState().assignments,
        undoCandidates: store.listUndoCandidates(),
      });
      const stay: ChordDestination = { kind: "stay" };
      if (chord.kind === "none") return { destination: stay };

      if (chord.kind === "restore") {
        store.restoreToIdle(chord.threadId, chord.sortKey);
      } else {
        store.setStage(threadId, chord.workflowStage, "app");
      }
      bb.realtime.publish("state-changed", { threadId });

      const next = chord.next;
      const destination: ChordDestination =
        next.kind === "thread"
          ? {
              kind: "thread",
              threadId: next.threadId,
              projectId:
                threads.find(({ id }) => id === next.threadId)?.projectId ??
                null,
            }
          : next;
      return { destination };
    },
    async reorderThread({ threadId, scope, direction }) {
      const threads = await listAllThreads(({ limit, offset }) =>
        bb.sdk.threads.list({ archived: false, limit, offset }),
      );
      requireRootThread(threadId, threads);
      store.ensureThreads([threadId]);
      const move = resolveWorkflowReorder({
        threads,
        assignments: store.listState().assignments,
        threadId,
        workflowStage: store.get(threadId).workflowStage,
        enabledStages: enabledWorkflowStages(await settings.get()),
        intent: { scope, direction },
      });
      if (move.kind === "none") return store.listState();
      if (move.kind === "pinned") {
        await bb.sdk.threads.reorderPinned({
          threadId,
          previousThreadId: move.previousThreadId,
          nextThreadId: move.nextThreadId,
        });
        bb.realtime.publish("state-changed", { threadId });
        return store.listState();
      }
      const state =
        move.kind === "stage"
          ? store.setStage(threadId, move.workflowStage)
          : store.reorderThread({
              threadId,
              workflowStage: move.workflowStage,
              previousThreadId: move.previousThreadId,
              nextThreadId: move.nextThreadId,
            });
      bb.realtime.publish("state-changed", { threadId });
      return state;
    },
    async renameProject({ projectId, name }) {
      await bb.sdk.projects.update({ projectId, name });
      return { ok: true as const };
    },
    async renameSection({ sectionId, name }) {
      await bb.sdk.threadSections.update({ id: sectionId, name });
      return { ok: true as const };
    },
  });

  bb.cli.register({
    name: "thread-stages",
    summary: "Organize root threads into stages",
    commands: [
      {
        name: "list",
        summary: "List threads by stage",
        usage: "bb thread-stages list [--stage <stage>] [--json]",
      },
      {
        name: "show",
        summary: "Show stage details",
        usage: "bb thread-stages show [id] [--self] [--json]",
      },
      {
        name: "update",
        summary: "Update a stage or position",
        usage:
          "bb thread-stages update [id] [--self] [--stage <stage>] [--after <id>] [--before <id>] [--json]",
      },
    ],
    async run(argv, context) {
      let listThreadIds: string[] | undefined;
      let rootIdsByThreadId: ReadonlyMap<string, string | null> | undefined;
      if (["list", "show", "update"].includes(argv[0] ?? "")) {
        const threads = await listAllThreads(({ limit, offset }) =>
          bb.sdk.threads.list({ archived: false, limit, offset }),
        );
        const partition = partitionWorkflowThreads(threads);
        rootIdsByThreadId = rootThreadIdByThreadId(threads);
        if (argv[0] === "list") {
          listThreadIds = partition.rootThreads.map((thread) => thread.id);
        }
        const previousIds = store
          .listState()
          .assignments.map(({ threadId }) => threadId)
          .join("\n");
        const state = store.syncRootThreads(
          partition.rootThreads.map((thread) => thread.id),
          partition.childThreads.map((thread) => thread.id),
        );
        if (
          state.assignments.map(({ threadId }) => threadId).join("\n") !==
          previousIds
        ) {
          bb.realtime.publish("state-changed", { threadId: null });
        }
      }
      const result = runThreadWorkflowCli(store, argv, {
        enabledStages: enabledWorkflowStages(await settings.get()),
        ...(listThreadIds ? { listThreadIds } : {}),
        ...(rootIdsByThreadId ? { rootIdsByThreadId } : {}),
        ...(context.threadId ? { threadId: context.threadId } : {}),
      });
      if (argv[0] === "update" && result.exitCode === 0) {
        bb.realtime.publish("state-changed", { threadId: null });
      }
      return result;
    },
  });

  bb.events.on("thread.deleted", ({ thread }) => {
    if (store.delete(thread.id)) {
      bb.realtime.publish("state-changed", { threadId: thread.id });
    }
  });

  registerThreadWorkflow(bb, store);
  registerThreadPreviews(bb, store);
  registerCompletedAutoArchive(
    bb,
    store,
    async () => (await settings.get()).autoArchiveCompletedAfter,
  );

  bb.log.info("Thread stages loaded");
}
