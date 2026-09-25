import { z } from "zod";
import { WORKFLOW_STAGES, type WorkflowStage } from "./workflow-stage";

const localIdSchema = z
  .string()
  .min(1)
  .max(128)
  .refine((value) => value.trim() === value && value.trim().length > 0, {
    message: "IDs cannot have surrounding whitespace.",
  })
  .refine((value) => !value.includes(":") && !value.includes("/"), {
    message: "IDs cannot contain colons or slashes.",
  });

export const placementOriginSchema = z.enum(["ui", "cli", "auto"]);

const placementOrderSchema = z
  .object({
    groupId: localIdSchema,
    sortKey: z.string().min(1),
    updatedAtMs: z.number().int().nonnegative(),
  })
  .strict();

const migrationPlacementSchema = z
  .object({
    groupingId: localIdSchema,
    threadId: z.string().min(1).max(256),
    groupId: localIdSchema,
    enteredAtMs: z.number().int().nonnegative(),
    updatedAtMs: z.number().int().nonnegative(),
    previousGroupId: localIdSchema.optional(),
    origin: placementOriginSchema,
    orders: z.array(placementOrderSchema),
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

export const placementMigrationSnapshotSchema = z
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

export type PlacementMigrationSnapshotV1 = z.infer<
  typeof placementMigrationSnapshotSchema
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

const groupSchema = z
  .object({
    id: localIdSchema,
    label: z.string(),
    icon: iconDataSchema.optional(),
    visibleWhenEmpty: z.boolean(),
    acceptsAssignments: z.boolean(),
    defaultCollapsed: z.boolean(),
    defaultPlacement: z.enum(["start", "end"]).optional(),
  })
  .strict();

const groupingSchema = z
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

export const getGroupingCatalogInputSchema = z.null();

const progressRing: IconDataV1 = {
  tag: "circle",
  attrs: {
    cx: 12,
    cy: 12,
    r: 8,
    stroke: "currentColor",
    strokeWidth: 1.5,
  },
};
const stageIcon = (children: IconDataV1[]): IconDataV1 => ({
  tag: "svg",
  attrs: { viewBox: "0 0 24 24", fill: "none" },
  children,
});
const strokedPath = (d: string): IconDataV1 => ({
  tag: "path",
  attrs: {
    d,
    stroke: "currentColor",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    strokeWidth: 1.5,
  },
});
// Six dashes around the ring, one centred every 60 degrees from 30.
const RING_SIXTH = (2 * Math.PI * 8) / 6;

const STAGE_ICONS: Record<WorkflowStage, IconDataV1> = {
  Deferred: stageIcon([
    {
      tag: "circle",
      attrs: {
        ...progressRing.attrs,
        strokeLinecap: "round",
        strokeDasharray: `4 ${RING_SIXTH - 4}`,
        strokeDashoffset: 2 - RING_SIXTH / 2,
      },
    },
  ]),
  Idle: stageIcon([progressRing]),
  // Lucide's LoaderCircle, drawn on the same ring; rows spin it.
  Active: stageIcon([strokedPath("M20 12a8 8 0 1 1-5.528-7.609")]),
  // Lucide's Ban, drawn on the same ring.
  Blocked: stageIcon([
    progressRing,
    strokedPath("M6.343 6.343 17.657 17.657"),
  ]),
  Completed: stageIcon([
    progressRing,
    {
      tag: "circle",
      attrs: { cx: 12, cy: 12, r: 5, fill: "currentColor" },
    },
  ]),
};

export function createGroupingCatalog(settings: {
  showDeferredStage?: boolean | string;
  showBlockedStage?: boolean | string;
}) {
  const optionalStageEnabled = (stage: WorkflowStage) =>
    stage === "Deferred"
      ? settings.showDeferredStage !== false
      : stage === "Blocked"
        ? settings.showBlockedStage !== false
        : true;
  return groupingCatalogSchema.parse({
    protocolVersion: 1,
    groupings: [
      {
        id: "stages",
        singularLabel: "Stage",
        pluralLabel: "Stages",
        icon: STAGE_ICONS.Active,
        defaultGroupId: "Idle",
        groups: WORKFLOW_STAGES.map((stage) => ({
          id: stage,
          label: stage,
          icon: STAGE_ICONS[stage],
          visibleWhenEmpty: optionalStageEnabled(stage),
          acceptsAssignments: optionalStageEnabled(stage),
          defaultCollapsed: stage === "Deferred" || stage === "Completed",
          ...(stage === "Completed" ? { defaultPlacement: "start" } : {}),
        })),
      },
    ],
  });
}
