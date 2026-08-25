import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";
import {
  acknowledgePlacementMigrationInputSchema,
  acknowledgePlacementMigrationOutputSchema,
  createGroupingCatalog,
  getGroupingCatalogInputSchema,
  groupingCatalogSchema,
  placementMigrationSnapshotSchema,
} from "./contracts";
import {
  AUTO_ARCHIVE_OPTIONS,
  registerCompletedAutoArchive,
} from "./auto-archive";
import { runForwardedThreadWorkflowCli } from "./cli";
import { listAllThreads } from "./list-all-threads";
import {
  RibbonSidebarDependencyError,
  THREAD_STAGES_GROUPING_KEY,
  createRibbonSidebarClient,
  type RibbonSidebarClient,
} from "./ribbon-sidebar-client";
import { resolveStageChord } from "./workflow-chords";
import { resolveWorkflowReorder } from "./workflow-reorder";
import {
  createWorkflowObservationState,
  registerThreadWorkflow,
} from "./workflow-automation";
import {
  WORKFLOW_STAGES,
  enabledWorkflowStages,
  parseWorkflowStage,
  type WorkflowStage,
} from "./workflow-stage";
import {
  partitionWorkflowThreads,
  rootThreadIdByThreadId,
  type WorkflowHierarchyThread,
} from "./root-thread-ownership";
import {
  THREAD_STAGE_SOURCE_MIGRATIONS,
  createThreadStageMigrationSource,
} from "./migration-source";

const workflowStageSchema = z.enum(WORKFLOW_STAGES);
const assignmentSchema = z
  .object({
    threadId: z.string(),
    workflowStage: workflowStageSchema,
    sortKey: z.string().min(1),
    updatedAt: z.number().int(),
  })
  .strict();
const stateSchema = z.object({ assignments: z.array(assignmentSchema) }).strict();
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

const appKeybindingSchema = z.object({
  command: z.string(),
  desktopOnly: z.boolean(),
  shortcut: z.object({
    alt: z.boolean(),
    control: z.boolean(),
    key: z.string().min(1),
    meta: z.boolean(),
    mod: z.boolean(),
    shift: z.boolean(),
  }),
});
const appKeybindingsSchema = z.object({
  keybindings: z.array(appKeybindingSchema),
});

export const rpcContract = defineRpcContract({
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
  listAppKeybindings: {
    input: z.null(),
    output: appKeybindingsSchema,
  },
  getGroupingCatalogV1: {
    input: getGroupingCatalogInputSchema,
    output: groupingCatalogSchema,
  },
  getPlacementMigrationSnapshotV1: {
    input: z.null(),
    output: placementMigrationSnapshotSchema,
  },
  acknowledgePlacementMigrationV1: {
    input: acknowledgePlacementMigrationInputSchema,
    output: acknowledgePlacementMigrationOutputSchema,
  },
});

export default function plugin(bb: BbPluginApi) {
  const database = bb.storage.database();
  bb.storage.migrate(database, THREAD_STAGE_SOURCE_MIGRATIONS);
  const migrationSource = createThreadStageMigrationSource(database);
  const settings = bb.settings.define({
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
        "Archive unpinned Completed thread hierarchies after the selected time without a root or descendant thread update.",
      options: [...AUTO_ARCHIVE_OPTIONS],
      default: "7 days",
    },
  });
  const ribbonSidebar = createRibbonSidebarClient({
    baseUrl: bb.server.loopbackBaseUrl,
  });

  async function updatePlacement(
    input: Parameters<RibbonSidebarClient["updatePlacementV1"]>[0],
  ): Promise<void> {
    const result = await ribbonSidebar.updatePlacementV1(input);
    if (!result.ok) {
      throw new RibbonSidebarDependencyError(
        `placement update was rejected (${result.error.code}): ${result.error.message}`,
      );
    }
  }

  async function listPlacements(
    input: Parameters<RibbonSidebarClient["listPlacementsV1"]>[0],
  ) {
    const result = await ribbonSidebar.listPlacementsV1(input);
    if (!result.ok) {
      throw new RibbonSidebarDependencyError(
        `placement list was rejected (${result.error.code}): ${result.error.message}`,
      );
    }
    return result.value;
  }

  async function ribbonAssignments(threadIds: readonly string[]) {
    const placementState = await listPlacements({
      groupingKey: THREAD_STAGES_GROUPING_KEY,
      threadIds: [...threadIds],
    });
    return {
      assignments: placementState.items.map((placement, index) => {
        const workflowStage = parseWorkflowStage(placement.groupId);
        if (workflowStage === null) {
          throw new RibbonSidebarDependencyError(
            `Ribbon sidebar returned unknown stage ${placement.groupId}.`,
          );
        }
        return {
          threadId: placement.threadId,
          workflowStage,
          sortKey: index.toString().padStart(12, "0"),
          updatedAt: placement.enteredAtMs ?? 0,
        };
      }),
      placements: placementState.items,
      revision: placementState.revision,
    };
  }

  async function updateLifecycleStage(
    threadId: string,
    stage: Extract<WorkflowStage, "Active" | "Idle">,
  ): Promise<void> {
    const current = await ribbonSidebar.getPlacementV1({
      groupingKey: THREAD_STAGES_GROUPING_KEY,
      threadId,
    });
    if (!current.ok) {
      throw new RibbonSidebarDependencyError(
        `placement read was rejected (${current.error.code}): ${current.error.message}`,
      );
    }
    if (
      (stage === "Active" && current.value.placement.groupId !== "Idle") ||
      (stage === "Idle" && current.value.placement.groupId !== "Active")
    ) {
      return;
    }
    await updatePlacement({
      groupingKey: THREAD_STAGES_GROUPING_KEY,
      groupId: stage,
      threadId,
      expectedRevision: current.value.revision,
      origin: "auto",
    });
  }

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
    if (enabledWorkflowStages(await settings.get()).includes(stage)) return;
    throw new Error(`Stage ${stage} is disabled in Thread stages settings.`);
  }

  bb.rpc.register(rpcContract, {
    async setWorkflowStage({ threadId, workflowStage }) {
      await requireEnabledStage(workflowStage);
      const threads = await listAllThreads(({ limit, offset }) =>
        bb.sdk.threads.list({ archived: false, limit, offset }),
      );
      requireRootThread(threadId, threads);
      const rootThreadIds = partitionWorkflowThreads(threads).rootThreads.map(
        ({ id }) => id,
      );
      const placementState = await ribbonAssignments(rootThreadIds);
      const undoCandidates = placementState.placements
        .filter(
          (placement) =>
            placement.origin === "ui" &&
            (placement.groupId === "Deferred" ||
              placement.groupId === "Blocked" ||
              placement.groupId === "Completed"),
        )
        .map((placement) => {
          const previousStage = placement.previousGroupId
            ? parseWorkflowStage(placement.previousGroupId)
            : null;
          return {
            threadId: placement.threadId,
            previousStage,
            previousSortKey: previousStage === "Idle" ? "preserve" : null,
            updatedAt: placement.enteredAtMs ?? 0,
          };
        })
        .sort((left, right) => right.updatedAt - left.updatedAt);
      const chord = resolveStageChord({
        threadId,
        workflowStage,
        threads,
        assignments: placementState.assignments,
        undoCandidates,
      });
      const stay: ChordDestination = { kind: "stay" };
      if (chord.kind === "none") return { destination: stay };

      if (chord.kind === "restore") {
        await updatePlacement({
          groupingKey: THREAD_STAGES_GROUPING_KEY,
          groupId: "Idle",
          threadId: chord.threadId,
          anchor:
            chord.sortKey !== null ? { kind: "preserve" } : { kind: "end" },
          expectedRevision: placementState.revision,
          origin: "ui",
        });
      } else {
        await updatePlacement({
          groupingKey: THREAD_STAGES_GROUPING_KEY,
          groupId: chord.workflowStage,
          threadId,
          anchor: { kind: "end" },
          expectedRevision: placementState.revision,
          origin: "ui",
        });
      }

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
      const placementState = await ribbonAssignments(
        partitionWorkflowThreads(threads).rootThreads.map(({ id }) => id),
      );
      const assignments = placementState.assignments;
      const move = resolveWorkflowReorder({
        threads,
        assignments,
        threadId,
        workflowStage:
          assignments.find(({ threadId: id }) => id === threadId)
            ?.workflowStage ?? "Idle",
        enabledStages: enabledWorkflowStages(await settings.get()),
        intent: { scope, direction },
      });
      if (move.kind === "none") return { assignments };
      if (move.kind === "pinned") {
        await bb.sdk.threads.reorderPinned({
          threadId,
          previousThreadId: move.previousThreadId,
          nextThreadId: move.nextThreadId,
        });
        return { assignments };
      }
      await updatePlacement({
        groupingKey: THREAD_STAGES_GROUPING_KEY,
        groupId: move.workflowStage,
        threadId,
        anchor:
          move.kind === "stage"
            ? { kind: "end" }
            : move.nextThreadId !== null
              ? { kind: "before", threadId: move.nextThreadId }
              : move.previousThreadId !== null
                ? { kind: "after", threadId: move.previousThreadId }
                : { kind: "preserve" },
        expectedRevision: placementState.revision,
        origin: "ui",
      });
      return { assignments };
    },
    async listAppKeybindings() {
      const { keybindings } = await bb.sdk.system.config();
      return {
        keybindings: keybindings.flatMap((binding) => {
          const parsed = appKeybindingSchema.safeParse(binding);
          return parsed.success ? [parsed.data] : [];
        }),
      };
    },
    async getGroupingCatalogV1() {
      return createGroupingCatalog(await settings.get());
    },
    getPlacementMigrationSnapshotV1() {
      return migrationSource.snapshot();
    },
    acknowledgePlacementMigrationV1(input) {
      return migrationSource.acknowledge(input);
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
      }
      return runForwardedThreadWorkflowCli(ribbonSidebar, argv, {
        enabledStages: enabledWorkflowStages(await settings.get()),
        ...(listThreadIds ? { listThreadIds } : {}),
        ...(rootIdsByThreadId ? { rootIdsByThreadId } : {}),
        ...(context.threadId ? { threadId: context.threadId } : {}),
      });
    },
  });

  registerThreadWorkflow(
    bb,
    updateLifecycleStage,
    createWorkflowObservationState(database),
  );
  registerCompletedAutoArchive(
    bb,
    {
      async listCompletedBefore(cutoff) {
        const placements = await listPlacements({
          groupingKey: THREAD_STAGES_GROUPING_KEY,
          groupIds: ["Completed"],
          enteredBeforeMs: cutoff + 1,
        });
        return placements.items.flatMap((placement) =>
          placement.enteredAtMs === null
            ? []
            : [{
                threadId: placement.threadId,
                enteredAt: placement.enteredAtMs,
              }],
        );
      },
    },
    async () => (await settings.get()).autoArchiveCompletedAfter,
  );

  settings.onChange(() => {
    void ribbonSidebar
      .invalidateGroupingCatalogV1({ providerPluginId: "thread-stages" })
      .catch((error: unknown) => {
        bb.log.warn(
          `Could not invalidate Ribbon sidebar's Thread stages catalog: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
  });

  bb.log.info("Thread stages loaded; Ribbon sidebar owns placement and rendering");
}
