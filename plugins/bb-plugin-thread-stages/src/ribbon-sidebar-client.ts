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
function placementErrorSchema<const Codes extends readonly [string, ...string[]]>(
  codes: Codes,
) {
  return z.object({
    code: z.enum(codes),
    message: z.string(),
    revision: z.number().int().nonnegative().optional(),
  }).strict();
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
      error: placementErrorSchema([
        "GROUPING_NOT_FOUND",
        "THREAD_INELIGIBLE",
      ]),
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

const rpcEnvelopeSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), result: z.unknown() }).strict(),
  z
    .object({
      ok: z.literal(false),
      error: z
        .object({
          code: z.string(),
          message: z.string(),
          issues: z.array(z.unknown()).optional(),
        })
        .strict(),
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
  baseUrl,
  fetcher = fetch,
}: {
  baseUrl: string;
  fetcher?: typeof fetch;
}): RibbonSidebarClient {
  async function call(method: string, input: unknown): Promise<unknown> {
    let response: Response;
    try {
      response = await fetcher(
        `${baseUrl}/api/v1/plugins/ribbon-sidebar/rpc/${method}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(input),
        },
      );
    } catch (cause) {
      throw new RibbonSidebarDependencyError(
        cause instanceof Error ? cause.message : "request failed",
        { cause },
      );
    }
    if (response.status === 404) {
      throw new RibbonSidebarDependencyError(
        "Install and enable Ribbon sidebar, then retry.",
      );
    }

    let envelope: z.output<typeof rpcEnvelopeSchema>;
    try {
      envelope = rpcEnvelopeSchema.parse(await response.json());
    } catch (cause) {
      throw new RibbonSidebarDependencyError(
        `RPC ${method} returned an invalid response (${response.status}).`,
        { cause },
      );
    }
    if (!response.ok || !envelope.ok) {
      const detail = envelope.ok
        ? `HTTP ${response.status}`
        : `${envelope.error.code}: ${envelope.error.message}`;
      throw new RibbonSidebarDependencyError(`RPC ${method} failed: ${detail}`);
    }
    return envelope.result;
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
      const result = await call("updatePlacementV1", validatedInput);
      const parsed = updatePlacementOutputSchema.safeParse(result);
      if (!parsed.success) {
        throw new RibbonSidebarDependencyError(
          `RPC updatePlacementV1 returned invalid output: ${parsed.error.message}`,
        );
      }
      return parsed.data;
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
