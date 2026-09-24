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
  THREAD_STAGE_SOURCE_MIGRATIONS,
  createThreadStageMigrationSource,
} from "./migration-source";
import { WORKFLOW_STAGES } from "./workflow-stage";

const AUTO_ARCHIVE_OPTIONS = ["Never", "1 day", "7 days", "30 days"] as const;

const workflowStageSchema = z.enum(WORKFLOW_STAGES);
const assignmentSchema = z
  .object({
    threadId: z.string(),
    workflowStage: workflowStageSchema,
    sortKey: z.string().min(1),
    updatedAt: z.number().int(),
  })
  .strict();
const stateSchema = z
  .object({ assignments: z.array(assignmentSchema) })
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

export const rpcContract = defineRpcContract({
  setWorkflowStage: {
    input: z
      .object({
        threadId: z.string().min(1).max(256),
        workflowStage: workflowStageSchema,
        scope: z
          .object({
            groupingKey: z.union([
              z.literal("builtin:projects"),
              z.literal("builtin:sections"),
              z.string().regex(/^plugin:[^:/]+:[^:/]+$/u),
            ]),
            groupId: z.string().min(1).max(128),
          })
          .strict()
          .nullable()
          .optional(),
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

export default async function plugin(bb: BbPluginApi) {
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
  bb.rpc.register(rpcContract, {
    setWorkflowStage: (input) =>
      bb.sdk.plugins.callRpc({
        pluginId: "ribbon-sidebar",
        method: "setWorkflowStage",
        input,
        outputSchema: rpcContract.setWorkflowStage.output,
      }),
    reorderThread: (input) =>
      bb.sdk.plugins.callRpc({
        pluginId: "ribbon-sidebar",
        method: "reorderThread",
        input,
        outputSchema: rpcContract.reorderThread.output,
      }),
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
  settings.onChange(() => {
    void settings
      .get()
      .then((values) =>
        bb.sdk.plugins.updateSettings({
          pluginId: "ribbon-sidebar",
          values,
        }),
      )
      .catch((error) =>
        bb.log.warn(`Could not update Ribbon stage settings: ${String(error)}`),
      );
  });
  bb.log.info(
    "Thread stages compatibility bridge loaded; Ribbon owns stages and automation",
  );
}
