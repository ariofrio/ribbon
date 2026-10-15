import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";

const snapshotSchema = z.object({
  instructions: z.string(),
  revision: z.string(),
  path: z.string(),
}).strict();

export type InstructionsSnapshot = z.infer<typeof snapshotSchema>;

export const rpcContract = defineRpcContract({
  "instructions.read": { input: z.null(), output: snapshotSchema },
  "instructions.save": {
    input: z.object({ instructions: z.string(), revision: z.string() }).strict(),
    output: z.object({
      status: z.enum(["saved", "conflict"]),
      snapshot: snapshotSchema,
    }).strict(),
  },
});
