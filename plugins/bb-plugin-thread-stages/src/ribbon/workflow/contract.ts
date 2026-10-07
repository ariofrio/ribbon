import { z } from "zod";
import { ORDER_GROUPING_KEYS } from "../placement-store";
import { WORKFLOW_STAGES } from "./workflow-stage";
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
export type ChordDestination = z.infer<typeof destinationSchema>;

export const workflowRpcMethods = {
  setWorkflowStage: {
    input: z
      .object({
        threadId: z.string().min(1).max(256),
        groupingKey: z
          .enum(ORDER_GROUPING_KEYS)
          .optional(),
        workflowStage: workflowStageSchema,
        scope: z
          .object({
            groupingKey: z.enum(ORDER_GROUPING_KEYS),
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
        groupingKey: z
          .enum(ORDER_GROUPING_KEYS)
          .optional(),
        scope: z.enum(["step", "edge", "stage"]),
        direction: z.union([z.literal(-1), z.literal(1)]),
      })
      .strict(),
    output: stateSchema,
  },
};
