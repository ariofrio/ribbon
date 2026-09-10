import type { JsonValue } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { placementOriginSchema } from "./contracts";

export const THREAD_STAGES_GROUPING_KEY =
  "plugin:thread-stages:stages" as const;

const groupingKeySchema = z.union([
  z.literal("builtin:projects"),
  z.literal("builtin:sections"),
  z.string().regex(/^plugin:[^:]+:[^:]+$/u),
]);
const placementAnchorSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.enum(["before", "after"]),
      threadId: z.string().min(1).max(256),
    })
    .strict(),
  z.object({ kind: z.enum(["start", "end", "preserve"]) }).strict(),
]);

export const updatePlacementInputSchema = z
  .object({
    groupingKey: groupingKeySchema,
    groupId: z.string().min(1).max(128),
    threadId: z.string().min(1).max(256),
    anchor: placementAnchorSchema.optional(),
    expectedRevision: z.number().int().nonnegative().optional(),
    origin: placementOriginSchema,
  })
  .strict();

const placementRecordSchema = z
  .object({
    groupingKey: groupingKeySchema,
    groupId: z.string().min(1).max(128),
    threadId: z.string().min(1).max(256),
    enteredAtMs: z.number().int().nonnegative().nullable(),
    previousGroupId: z.string().min(1).max(128).optional(),
    origin: placementOriginSchema.optional(),
  })
  .strict();
function placementErrorSchema<
  const Codes extends readonly [string, ...string[]],
>(codes: Codes) {
  return z
    .object({
      code: z.enum(codes),
      message: z.string(),
      revision: z.number().int().nonnegative().optional(),
    })
    .strict();
}

const getPlacementInputSchema = z
  .object({
    groupingKey: groupingKeySchema,
    threadId: z.string().min(1).max(256),
  })
  .strict();
const getPlacementOutputSchema = z.discriminatedUnion("ok", [
  z
    .object({
      ok: z.literal(true),
      value: z
        .object({
          placement: placementRecordSchema,
          revision: z.number().int().nonnegative(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ok: z.literal(false),
      error: placementErrorSchema(["GROUPING_NOT_FOUND", "THREAD_INELIGIBLE"]),
    })
    .strict(),
]);
const listPlacementsInputSchema = z
  .object({
    groupingKey: groupingKeySchema,
    threadIds: z.array(z.string().min(1).max(256)).optional(),
    groupIds: z.array(z.string().min(1).max(128)).optional(),
    origins: z.array(placementOriginSchema).optional(),
    enteredBeforeMs: z.number().int().nonnegative().optional(),
  })
  .strict();
const listPlacementsOutputSchema = z.discriminatedUnion("ok", [
  z
    .object({
      ok: z.literal(true),
      value: z
        .object({
          groupingKey: groupingKeySchema,
          revision: z.number().int().nonnegative(),
          items: z.array(placementRecordSchema),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ok: z.literal(false),
      error: placementErrorSchema(["GROUPING_NOT_FOUND", "GROUP_NOT_FOUND"]),
    })
    .strict(),
]);

const updatePlacementOutputSchema = z.discriminatedUnion("ok", [
  z
    .object({
      ok: z.literal(true),
      value: z
        .object({
          placement: placementRecordSchema,
          revision: z.number().int().nonnegative(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ok: z.literal(false),
      error: placementErrorSchema([
        "GROUPING_NOT_FOUND",
        "GROUP_NOT_FOUND",
        "GROUP_NOT_ASSIGNABLE",
        "THREAD_INELIGIBLE",
        "ANCHOR_INELIGIBLE",
        "MEMBERSHIP_NOT_WRITABLE",
        "REVISION_CONFLICT",
      ]),
    })
    .strict(),
]);

export class RibbonSidebarDependencyError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(`Ribbon sidebar dependency problem: ${message}`, options);
    this.name = "RibbonSidebarDependencyError";
  }
}

export interface RibbonSidebarClient {
  getPlacementV1(
    input: z.input<typeof getPlacementInputSchema>,
  ): Promise<z.output<typeof getPlacementOutputSchema>>;
  listPlacementsV1(
    input: z.input<typeof listPlacementsInputSchema>,
  ): Promise<z.output<typeof listPlacementsOutputSchema>>;
  updatePlacementV1(
    input: z.input<typeof updatePlacementInputSchema>,
  ): Promise<z.output<typeof updatePlacementOutputSchema>>;
  invalidateGroupingCatalogV1(input: {
    providerPluginId: string;
  }): Promise<null>;
}

export function createRibbonSidebarClient({
  callRpc,
}: {
  callRpc: (method: string, input: JsonValue) => Promise<unknown>;
}): RibbonSidebarClient {
  async function call(method: string, input: JsonValue): Promise<unknown> {
    try {
      return await callRpc(method, input);
    } catch (cause) {
      const status =
        cause !== null && typeof cause === "object" && "status" in cause
          ? cause.status
          : undefined;
      const message =
        status === 404
          ? "Install and enable Ribbon sidebar, then retry."
          : status === 503
            ? "Enable Ribbon sidebar or wait for it to finish starting, then retry."
            : `RPC ${method} failed: ${cause instanceof Error ? cause.message : "request failed"}`;
      throw new RibbonSidebarDependencyError(message, { cause });
    }
  }

  return {
    async getPlacementV1(input) {
      const validatedInput = getPlacementInputSchema.parse(input);
      const result = await call("getPlacementV1", validatedInput);
      const parsed = getPlacementOutputSchema.safeParse(result);
      if (!parsed.success) {
        throw new RibbonSidebarDependencyError(
          `RPC getPlacementV1 returned invalid output: ${parsed.error.message}`,
        );
      }
      return parsed.data;
    },
    async listPlacementsV1(input) {
      const validatedInput = listPlacementsInputSchema.parse(input);
      const result = await call("listPlacementsV1", validatedInput);
      const parsed = listPlacementsOutputSchema.safeParse(result);
      if (!parsed.success) {
        throw new RibbonSidebarDependencyError(
          `RPC listPlacementsV1 returned invalid output: ${parsed.error.message}`,
        );
      }
      return parsed.data;
    },
    async updatePlacementV1(input) {
      const validatedInput = updatePlacementInputSchema.parse(input);
      const invoke = async (nextInput: typeof validatedInput) => {
        const result = await call("updatePlacementV1", nextInput);
        const parsed = updatePlacementOutputSchema.safeParse(result);
        if (!parsed.success) {
          throw new RibbonSidebarDependencyError(
            `RPC updatePlacementV1 returned invalid output: ${parsed.error.message}`,
          );
        }
        return parsed.data;
      };
      const first = await invoke(validatedInput);
      if (
        validatedInput.origin !== "auto" &&
        !first.ok &&
        first.error.code === "REVISION_CONFLICT" &&
        first.error.revision !== undefined
      ) {
        return invoke({
          ...validatedInput,
          expectedRevision: first.error.revision,
        });
      }
      return first;
    },
    async invalidateGroupingCatalogV1(input) {
      const validatedInput = z
        .object({ providerPluginId: z.string().min(1).max(128) })
        .strict()
        .parse(input);
      const result = await call("invalidateGroupingCatalogV1", validatedInput);
      if (result !== null) {
        throw new RibbonSidebarDependencyError(
          "RPC invalidateGroupingCatalogV1 returned invalid output.",
        );
      }
      return null;
    },
  };
}
