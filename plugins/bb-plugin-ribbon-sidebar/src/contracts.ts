import { z } from "zod";

export const groupingKeySchema = z.union([
  z.literal("builtin:projects"),
  z.literal("builtin:sections"),
  z.string().regex(/^plugin:[^:/]+:[^:/]+$/u),
]);

export const localIdSchema = z
  .string()
  .min(1)
  .max(128)
  .refine((value) => value.trim() === value, {
    message: "IDs cannot have surrounding whitespace.",
  })
  .refine((value) => !value.includes(":") && !value.includes("/"), {
    message: "IDs cannot contain colons or slashes.",
  });

export const threadIdSchema = z.string().min(1).max(256);
export const placementOriginSchema = z.enum(["ui", "cli", "auto"]);

export interface IconDataV1 {
  tag:
    | "svg"
    | "g"
    | "path"
    | "circle"
    | "ellipse"
    | "rect"
    | "line"
    | "polyline"
    | "polygon";
  attrs: Record<string, string | number>;
  children?: IconDataV1[];
}

const SAFE_ICON_ATTRIBUTES = new Set([
  "clipRule",
  "cx",
  "cy",
  "d",
  "fill",
  "fillOpacity",
  "fillRule",
  "height",
  "opacity",
  "points",
  "r",
  "rx",
  "ry",
  "stroke",
  "strokeDasharray",
  "strokeDashoffset",
  "strokeLinecap",
  "strokeLinejoin",
  "strokeOpacity",
  "strokeWidth",
  "transform",
  "viewBox",
  "width",
  "x",
  "x1",
  "x2",
  "y",
  "y1",
  "y2",
]);
const UNSAFE_ICON_VALUE = /(?:\b(?:data|https?|javascript):|url\s*\()/iu;

export const iconDataSchema: z.ZodType<IconDataV1> = z.lazy(() =>
  z
    .object({
      tag: z.enum([
        "svg",
        "g",
        "path",
        "circle",
        "ellipse",
        "rect",
        "line",
        "polyline",
        "polygon",
      ]),
      attrs: z
        .record(z.string(), z.union([z.string(), z.number().finite()]))
        .superRefine((attrs, context) => {
          for (const [name, value] of Object.entries(attrs)) {
            if (!SAFE_ICON_ATTRIBUTES.has(name)) {
              context.addIssue({
                code: "custom",
                message: `Unsafe SVG attribute: ${name}`,
                path: [name],
              });
            }
            if (typeof value === "string" && UNSAFE_ICON_VALUE.test(value)) {
              context.addIssue({
                code: "custom",
                message: `SVG attribute ${name} cannot contain a URL.`,
                path: [name],
              });
            }
          }
        }),
      children: z.array(iconDataSchema).max(64).optional(),
    })
    .strict(),
);

export const groupSchema = z
  .object({
    id: localIdSchema,
    label: z.string(),
    icon: iconDataSchema.optional(),
    visibleWhenEmpty: z.boolean(),
    acceptsAssignments: z.boolean(),
    defaultCollapsed: z.boolean(),
  })
  .strict();

export const groupingSchema = z
  .object({
    id: localIdSchema,
    singularLabel: z.string(),
    pluralLabel: z.string(),
    icon: iconDataSchema.optional(),
    defaultGroupId: localIdSchema,
    groups: z.array(groupSchema).min(1),
  })
  .strict()
  .superRefine((grouping, context) => {
    const groupIds = new Set<string>();
    for (const [index, group] of grouping.groups.entries()) {
      if (groupIds.has(group.id)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate group id: ${group.id}`,
          path: ["groups", index, "id"],
        });
      }
      groupIds.add(group.id);
    }
    const defaultGroup = grouping.groups.find(
      ({ id }) => id === grouping.defaultGroupId,
    );
    if (!defaultGroup?.acceptsAssignments) {
      context.addIssue({
        code: "custom",
        message: "The default group must exist and accept assignments.",
        path: ["defaultGroupId"],
      });
    }
  });

export const groupingCatalogSchema = z
  .object({
    protocolVersion: z.literal(1),
    groupings: z.array(groupingSchema).min(1),
  })
  .strict()
  .superRefine((catalog, context) => {
    const groupingIds = new Set<string>();
    for (const [index, grouping] of catalog.groupings.entries()) {
      if (groupingIds.has(grouping.id)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate grouping id: ${grouping.id}`,
          path: ["groupings", index, "id"],
        });
      }
      groupingIds.add(grouping.id);
    }
  });

export type GroupingCatalogV1 = z.output<typeof groupingCatalogSchema>;

export const placementAnchorSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.enum(["before", "after"]),
      threadId: threadIdSchema,
    })
    .strict(),
  z.object({ kind: z.enum(["start", "end", "preserve"]) }).strict(),
]);

export const placementRecordSchema = z
  .object({
    groupingKey: groupingKeySchema,
    groupId: localIdSchema,
    threadId: threadIdSchema,
    enteredAtMs: z.number().int().nonnegative().nullable(),
    previousGroupId: localIdSchema.optional(),
    origin: placementOriginSchema.optional(),
  })
  .strict();

function placementErrorSchema<const Codes extends readonly [string, ...string[]]>(
  codes: Codes,
) {
  return z
    .object({
      code: z.enum(codes),
      message: z.string(),
      revision: z.number().int().nonnegative().optional(),
    })
    .strict();
}

function resultSchema<Success extends z.ZodType, Error extends z.ZodType>(
  success: Success,
  error: Error,
) {
  return z.discriminatedUnion("ok", [
    z.object({ ok: z.literal(true), value: success }).strict(),
    z.object({ ok: z.literal(false), error }).strict(),
  ]);
}

export const getPlacementInputSchema = z
  .object({
    groupingKey: groupingKeySchema,
    threadId: threadIdSchema,
  })
  .strict();
export const getPlacementOutputSchema = resultSchema(
  z
    .object({
      placement: placementRecordSchema,
      revision: z.number().int().nonnegative(),
    })
    .strict(),
  placementErrorSchema(["GROUPING_NOT_FOUND", "THREAD_INELIGIBLE"]),
);

export const listPlacementsInputSchema = z
  .object({
    groupingKey: groupingKeySchema,
    threadIds: z.array(threadIdSchema).optional(),
    groupIds: z.array(localIdSchema).optional(),
    origins: z.array(placementOriginSchema).optional(),
    enteredBeforeMs: z.number().int().nonnegative().optional(),
  })
  .strict();
export const listPlacementsOutputSchema = resultSchema(
  z
    .object({
      groupingKey: groupingKeySchema,
      revision: z.number().int().nonnegative(),
      items: z.array(placementRecordSchema),
    })
    .strict(),
  placementErrorSchema(["GROUPING_NOT_FOUND", "GROUP_NOT_FOUND"]),
);

export const updatePlacementInputSchema = z
  .object({
    groupingKey: groupingKeySchema,
    groupId: localIdSchema,
    threadId: threadIdSchema,
    anchor: placementAnchorSchema.optional(),
    expectedRevision: z.number().int().nonnegative().optional(),
    origin: placementOriginSchema,
  })
  .strict();
export const updatePlacementOutputSchema = resultSchema(
  z
    .object({
      placement: placementRecordSchema,
      revision: z.number().int().nonnegative(),
    })
    .strict(),
  placementErrorSchema([
    "GROUPING_NOT_FOUND",
    "GROUP_NOT_FOUND",
    "GROUP_NOT_ASSIGNABLE",
    "THREAD_INELIGIBLE",
    "ANCHOR_INELIGIBLE",
    "MEMBERSHIP_NOT_WRITABLE",
    "REVISION_CONFLICT",
  ]),
);

export const invalidateGroupingCatalogInputSchema = z
  .object({ providerPluginId: localIdSchema })
  .strict();
export const invalidateGroupingCatalogOutputSchema = z.null();

const migrationOrderSchema = z
  .object({
    groupId: localIdSchema,
    sortKey: z.string().min(1),
    updatedAtMs: z.number().int().nonnegative(),
  })
  .strict();
const migrationPlacementSchema = z
  .object({
    groupingId: localIdSchema,
    threadId: threadIdSchema,
    groupId: localIdSchema,
    enteredAtMs: z.number().int().nonnegative(),
    updatedAtMs: z.number().int().nonnegative(),
    previousGroupId: localIdSchema.optional(),
    origin: placementOriginSchema,
    orders: z.array(migrationOrderSchema),
  })
  .strict()
  .superRefine((placement, context) => {
    const groupIds = new Set<string>();
    for (const [index, order] of placement.orders.entries()) {
      if (groupIds.has(order.groupId)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate retained order for group: ${order.groupId}`,
          path: ["orders", index, "groupId"],
        });
      }
      groupIds.add(order.groupId);
    }
    if (!groupIds.has(placement.groupId)) {
      context.addIssue({
        code: "custom",
        message: "The current group must have a retained order row.",
        path: ["orders"],
      });
    }
  });

export const threadStagesMigrationSnapshotSchema = z
  .object({
    sourcePluginId: z.literal("thread-stages"),
    sourceSchema: z.literal(1),
    installationId: z.string().regex(/^[a-f0-9]{32}$/u),
    revision: z.number().int().nonnegative(),
    placements: z.array(migrationPlacementSchema),
  })
  .strict()
  .superRefine((snapshot, context) => {
    const placements = new Set<string>();
    for (const [index, placement] of snapshot.placements.entries()) {
      const key = `${placement.groupingId}\u0000${placement.threadId}`;
      if (placements.has(key)) {
        context.addIssue({
          code: "custom",
          message: "Duplicate placement.",
          path: ["placements", index],
        });
      }
      placements.add(key);
    }
  });
export type ThreadStagesMigrationSnapshotV1 = z.output<
  typeof threadStagesMigrationSnapshotSchema
>;
export const acknowledgePlacementMigrationInputSchema = z
  .object({
    installationId: z.string().regex(/^[a-f0-9]{32}$/u),
    revision: z.number().int().nonnegative(),
  })
  .strict();
export const acknowledgePlacementMigrationOutputSchema = z
  .object({ transferred: z.boolean() })
  .strict();
