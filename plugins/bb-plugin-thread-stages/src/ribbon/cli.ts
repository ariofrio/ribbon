import {
  PluginCliError,
  cliCommand,
  defineCli,
  type BbPluginApi,
  type PluginCliContext,
  type PluginCliRegistration,
} from "@get-bb/plugin-sdk";
import type {
  GroupingDescriptor,
  GroupingKey,
  PlacementStore,
  OrderGroupingKey,
} from "./placement-store";
import {
  liveChildren,
  liveParentId,
  moveChild,
  type ChildRank,
} from "./child-order";
import { groupingKeySchema } from "./contracts";
import { THREAD_STAGES_GROUPING_KEY } from "./workflow/catalog";
import {
  parseWorkflowStage,
  WORKFLOW_STAGES,
  WORKFLOW_STAGE_LABELS,
} from "./workflow/workflow-stage";
import { rootThreadIdByThreadId } from "./workflow/root-thread-ownership";

interface CliResult {
  exitCode: number;
  stdout?: string;
  stderr?: string;
}

export interface RibbonSidebarCliContext {
  store: PlacementStore;
  groupings(): readonly GroupingDescriptor[];
  threads(options: {
    includeArchived: boolean;
    includeHidden: boolean;
    includeChildren: boolean;
  }): readonly RibbonSidebarThread[] | Promise<readonly RibbonSidebarThread[]>;
  updatePlacement(
    input: Parameters<PlacementStore["updatePlacement"]>[0],
    options?: { actorThreadId?: string },
  ):
    | ReturnType<PlacementStore["updatePlacement"]>
    | Promise<ReturnType<PlacementStore["updatePlacement"]>>;
  /** Every thread, live or not, and the saved child order. */
  hierarchy():
    | { threads: readonly RibbonSidebarThread[]; ranks: readonly ChildRank[] }
    | Promise<{
        threads: readonly RibbonSidebarThread[];
        ranks: readonly ChildRank[];
      }>;
  reorderChildren(
    parentThreadId: string,
    threadIds: string[],
  ): void | Promise<void>;
  /** Commands registered beside the placement ones, such as `prefs …`. */
  extraCommands?: Record<string, ReturnType<typeof cliCommand>>;
}

export type RibbonSidebarThread = Awaited<
  ReturnType<BbPluginApi["sdk"]["threads"]["list"]>
>[number];

export interface RibbonSidebarCliInvocation {
  threadId?: string;
}

const JSON_OPTION = {
  json: {
    type: "boolean",
    description: "Print machine-readable JSON output",
  },
} as const;

function json(value: unknown) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function groupingKey(value: string | undefined): GroupingKey {
  const parsed = groupingKeySchema.safeParse(value);
  if (!parsed.success) {
    throw new PluginCliError(`Invalid grouping key: ${value ?? "(missing)"}`);
  }
  return parsed.data;
}

function groupRef(value: string | undefined) {
  if (value === undefined) throw new PluginCliError("Missing group reference.");
  const slash = value.indexOf("/");
  if (
    slash <= 0 ||
    slash !== value.lastIndexOf("/") ||
    slash === value.length - 1
  ) {
    throw new PluginCliError(
      `Invalid group reference: ${value}. Expected <grouping-key>/<group-id>.`,
    );
  }
  return {
    groupingKey: groupingKey(value.slice(0, slash)),
    groupId: value.slice(slash + 1),
  };
}

export function resolveThreadId(
  positional: string | undefined,
  self: boolean,
  invocation: RibbonSidebarCliInvocation,
) {
  if (self && positional) {
    throw new PluginCliError("Cannot combine a thread ID with --self.");
  }
  if (self) {
    if (!invocation.threadId) {
      throw new PluginCliError("--self requires a current bb thread.");
    }
    return invocation.threadId;
  }
  if (!positional) {
    throw new PluginCliError("Missing thread ID. Pass <thread> or --self.");
  }
  return positional;
}

function success(value: unknown, human: string, wantsJson: boolean): CliResult {
  return { exitCode: 0, stdout: wantsJson ? json(value) : human };
}

function humanTable(rows: readonly (readonly string[])[]): string {
  const widths = rows[0]?.map((_, column) =>
    Math.max(...rows.map((row) => row[column]?.length ?? 0)),
  );
  return `\n${rows
    .map((row) =>
      row
        .map((value, column) => value.padEnd(widths?.[column] ?? value.length))
        .join("  ")
        .trimEnd(),
    )
    .join("\n")}\n\n`;
}

function humanPlacements(
  threadId: string,
  placements: readonly { groupingKey: GroupingKey; groupId: string }[],
  groupings: readonly GroupingDescriptor[],
): string {
  const descriptors = new Map(
    groupings.map((grouping) => [grouping.groupingKey, grouping]),
  );
  const details = placements.map((placement) => {
    const descriptor = descriptors.get(placement.groupingKey);
    return `  ${descriptor?.singularLabel ?? (placement.groupingKey === "builtin:machines" ? "Machine" : "Group")}: ${
      descriptor ? groupName(descriptor, placement.groupId) : placement.groupId
    }`;
  });
  return `Thread: ${threadId}${details.length > 0 ? `\n${details.join("\n")}` : ""}\n`;
}

/** Where a child sits among its siblings, or null for a root. */
async function childPosition(
  context: RibbonSidebarCliContext,
  threadId: string,
) {
  const { threads, ranks } = await context.hierarchy();
  const parentThreadId = liveParentId(threads, threadId);
  if (parentThreadId === null) return null;
  const siblingThreadIds = liveChildren(threads, ranks, parentThreadId).map(
    ({ id }) => id,
  );
  return {
    threadId,
    parentThreadId,
    position: siblingThreadIds.indexOf(threadId) + 1,
    siblingThreadIds,
  };
}

function humanChildPosition(child: {
  threadId: string;
  parentThreadId: string;
  position: number;
  siblingThreadIds: readonly string[];
}) {
  return `Thread: ${child.threadId}\n  Parent: ${child.parentThreadId}\n  Position: ${child.position} of ${child.siblingThreadIds.length}\n`;
}

function domainFailure(result: {
  ok: false;
  error: { message: string };
}): never {
  throw new PluginCliError(result.error.message);
}

function groupName(grouping: GroupingDescriptor, groupId: string): string {
  return grouping.groups.find(({ id }) => id === groupId)?.label ?? groupId;
}

function stageBand(stage: string) {
  return stage === "Deferred" || stage === "Completed" ? stage : "main";
}

function orderGrouping(by: string | undefined): OrderGroupingKey {
  if (by === undefined || by === "section") return "builtin:sections";
  if (by === "project") return "builtin:projects";
  if (by === "machine") return "builtin:machines";
  throw new PluginCliError(
    `Invalid --by: ${by}. Choose section, project, or machine.`,
  );
}

function stageId(value: string) {
  const stage = parseWorkflowStage(value);
  if (!stage)
    throw new PluginCliError(
      `Unknown stage: ${value}. Choose ${WORKFLOW_STAGES.join(", ")}.`,
    );
  return stage;
}

function richThreadRows(
  context: RibbonSidebarCliContext,
  groupings: readonly GroupingDescriptor[],
  candidates: readonly RibbonSidebarThread[],
  threadIds: readonly string[],
) {
  const threads = new Map(candidates.map((thread) => [thread.id, thread]));
  const rootIds = rootThreadIdByThreadId(candidates);
  const named = (key: GroupingKey, id: string) => {
    const descriptor = groupings.find(({ groupingKey }) => groupingKey === key);
    return {
      id,
      name: descriptor
        ? groupName(descriptor, id)
        : id === "no-machine"
          ? "No machine"
          : id,
    };
  };
  return threadIds.flatMap((threadId) => {
    const thread = threads.get(threadId);
    if (!thread) return [];
    const root = threads.get(rootIds.get(threadId) ?? threadId) ?? thread;
    const stage = context.store.getStage(threadId);
    return [
      {
        ...thread,
        project: named("builtin:projects", root.projectId),
        section: named("builtin:sections", root.sectionId ?? "unsectioned"),
        machine: named(
          "builtin:machines",
          root.environmentHostId ?? "no-machine",
        ),
        stage: stageId(stage.groupId),
        stageEnteredAtMs: stage.enteredAtMs,
      },
    ];
  });
}

type OrderAnchor =
  | { kind: "before" | "after"; threadId: string }
  | { kind: "start" | "end" };

async function validateRootOrder(
  context: RibbonSidebarCliContext,
  threadId: string,
  groupingKey: OrderGroupingKey,
  anchor: OrderAnchor,
  stage = context.store.getStage(threadId).groupId,
) {
  const { threads } = await context.hierarchy();
  if (threads.find(({ id }) => id === threadId)?.pinnedAt != null) {
    throw new PluginCliError(
      "Pinned threads use BB's pin order. Unpin the thread before ordering it in a group.",
    );
  }
  const current = context.store.getPlacement({ groupingKey, threadId });
  if (!current.ok) return domainFailure(current);
  if (anchor.kind === "before" || anchor.kind === "after") {
    const next = context.store.getPlacement({
      groupingKey,
      threadId: anchor.threadId,
    });
    if (
      anchor.threadId === threadId ||
      !next.ok ||
      next.value.placement.groupId !== current.value.placement.groupId ||
      threads.find(({ id }) => id === anchor.threadId)?.pinnedAt != null
    ) {
      throw new PluginCliError(
        `Anchor is not an eligible destination member: ${anchor.threadId}`,
      );
    }
    if (
      stageBand(stage) !==
      stageBand(context.store.getStage(anchor.threadId).groupId)
    ) {
      throw new PluginCliError("Order threads within the same stage band.");
    }
  }
  return current.value.placement.groupId;
}

async function orderThread(
  context: RibbonSidebarCliContext,
  threadId: string,
  groupingKey: OrderGroupingKey,
  anchor: OrderAnchor,
  actorThreadId?: string,
) {
  const child = await childPosition(context, threadId);
  if (child) {
    const siblings = child.siblingThreadIds.filter((id) => id !== threadId);
    let beforeId: string | null =
      anchor.kind === "end" ? null : (siblings[0] ?? null);
    if (anchor.kind === "before" || anchor.kind === "after") {
      if (!siblings.includes(anchor.threadId))
        throw new PluginCliError(
          `Thread ${anchor.threadId} is not a sibling of child thread ${threadId}.`,
        );
      beforeId =
        anchor.kind === "before"
          ? anchor.threadId
          : (siblings[siblings.indexOf(anchor.threadId) + 1] ?? null);
    }
    const threadIds = moveChild(child.siblingThreadIds, threadId, beforeId) ?? [
      ...child.siblingThreadIds,
    ];
    await context.reorderChildren(child.parentThreadId, threadIds);
    return {
      ...child,
      position: threadIds.indexOf(threadId) + 1,
      siblingThreadIds: threadIds,
    };
  }
  const groupId = await validateRootOrder(
    context,
    threadId,
    groupingKey,
    anchor,
  );
  const result = await context.updatePlacement(
    { groupingKey, groupId, threadId, anchor, origin: "cli" },
    { actorThreadId },
  );
  if (!result.ok) return domainFailure(result);
  return result.value;
}

export function defineRibbonSidebarCli(
  context: RibbonSidebarCliContext,
): PluginCliRegistration {
  const availableGroupings = () => context.groupings();
  return defineCli({
    name: "thread-stages",
    summary:
      "Inspect and change thread stages, sidebar placement, and layout preferences",
    usageErrorExitCode: 2,
    commands: {
      ...context.extraCommands,
      stage: cliCommand({
        summary: "Set a thread's workflow stage",
        options: {
          self: { type: "boolean", description: "Target the current thread" },
          ...JSON_OPTION,
        },
        positionals: [
          {
            name: "stage",
            description: WORKFLOW_STAGES.join(", "),
            required: true,
          },
          { name: "thread", description: "Thread ID" },
        ],
        async run({ options, positionals }, invocation) {
          const threadId = resolveThreadId(
            positionals.thread,
            options.self,
            invocation,
          );
          const groupId = stageId(positionals.stage);
          const result = await context.updatePlacement(
            {
              threadId,
              groupingKey: THREAD_STAGES_GROUPING_KEY,
              groupId,
              origin: "cli",
            },
            { actorThreadId: invocation.threadId },
          );
          if (!result.ok) return domainFailure(result);
          return success(
            { threadId, stage: groupId },
            `Thread ${threadId}: ${WORKFLOW_STAGE_LABELS[groupId]}\n`,
            options.json,
          );
        },
      }),
      order: cliCommand({
        summary: "Order a thread within its stage band or among siblings",
        options: {
          self: { type: "boolean", description: "Target the current thread" },
          by: {
            type: "string",
            description:
              "Organization whose order to change (default: section)",
            placeholder: "section|project|machine",
          },
          before: {
            type: "string",
            description: "Next thread",
            placeholder: "thread",
          },
          after: {
            type: "string",
            description: "Previous thread",
            placeholder: "thread",
          },
          first: { type: "boolean", description: "Place first in the band" },
          last: { type: "boolean", description: "Place last in the band" },
          ...JSON_OPTION,
        },
        positionals: [{ name: "thread", description: "Thread ID" }],
        constraints: [
          {
            kind: "exactly-one",
            options: ["before", "after", "first", "last"],
          },
        ],
        async run({ options, positionals }, invocation) {
          const threadId = resolveThreadId(
            positionals.thread,
            options.self,
            invocation,
          );
          const anchor = options.before
            ? { kind: "before" as const, threadId: options.before }
            : options.after
              ? { kind: "after" as const, threadId: options.after }
              : { kind: options.last ? ("end" as const) : ("start" as const) };
          const result = await orderThread(
            context,
            threadId,
            orderGrouping(options.by),
            anchor,
            invocation.threadId,
          );
          return success(
            result,
            `Thread ${threadId} order updated\n`,
            options.json,
          );
        },
      }),
      list: cliCommand({
        summary: "List threads",
        description:
          "List threads in saved group order with their workflow stages.",
        options: {
          scope: {
            type: "string",
            description:
              "Deprecated group filter; use --section, --project, --machine, or --stage",
            placeholder: "group-ref",
          },
          by: {
            type: "string",
            description: "Organization whose order to list (default: section)",
            placeholder: "section|project|machine",
          },
          section: {
            type: "string",
            description: "Filter by section ID (unsectioned for Threads)",
            placeholder: "id",
          },
          project: {
            type: "string",
            description: "Filter by project ID",
            placeholder: "id",
          },
          machine: {
            type: "string",
            description:
              "Filter by machine ID (no-machine for unattached threads)",
            placeholder: "id",
          },
          stage: {
            type: "string",
            description: "Filter by workflow stage",
            placeholder: "stage",
          },
          "include-archived": {
            type: "boolean",
            description: "Include archived threads",
          },
          "include-hidden": {
            type: "boolean",
            description: "Include hidden threads",
          },
          "include-children": {
            type: "boolean",
            description: "Include child threads with their own stages",
          },
          ...JSON_OPTION,
        },
        async run({ options }) {
          const available = availableGroupings();
          const scope =
            options.scope === undefined ? undefined : groupRef(options.scope);
          if (scope !== undefined) {
            const scopedGrouping = available.find(
              ({ groupingKey: key }) => key === scope.groupingKey,
            );
            if (!scopedGrouping) {
              throw new PluginCliError(
                `Grouping not found: ${scope.groupingKey}`,
              );
            }
            if (!scopedGrouping.groups.some(({ id }) => id === scope.groupId)) {
              throw new PluginCliError(
                `Group not found: ${scope.groupingKey}/${scope.groupId}`,
              );
            }
          }
          const orderKey =
            options.by === undefined &&
            scope &&
            scope.groupingKey !== THREAD_STAGES_GROUPING_KEY
              ? scope.groupingKey
              : orderGrouping(options.by);
          const stage =
            options.stage === undefined ? undefined : stageId(options.stage);
          const listed = context.store.listPlacements({
            groupingKey: orderKey,
          });
          if (!listed.ok) return domainFailure(listed);
          const candidates = await context.threads({
            includeArchived: options["include-archived"],
            includeHidden: options["include-hidden"],
            includeChildren: options["include-children"],
          });
          const candidateIds = new Set(candidates.map(({ id }) => id));
          const orderedIds = listed.value.items
            .map(({ threadId }) => threadId)
            .filter((threadId) => candidateIds.has(threadId));
          const seen = new Set(orderedIds);
          orderedIds.push(
            ...candidates
              .map(({ id }) => id)
              .filter((threadId) => !seen.has(threadId)),
          );
          const allRows = richThreadRows(
            context,
            available,
            candidates,
            orderedIds,
          );
          const rows = allRows.filter(
            (row) =>
              (options.section === undefined ||
                row.section.id === options.section) &&
              (options.project === undefined ||
                row.project.id === options.project) &&
              (options.machine === undefined ||
                row.machine.id === options.machine) &&
              (stage === undefined || row.stage === stage) &&
              (scope === undefined ||
                (scope.groupingKey === THREAD_STAGES_GROUPING_KEY
                  ? row.stage === stageId(scope.groupId)
                  : (scope.groupingKey === "builtin:sections"
                      ? row.section
                      : scope.groupingKey === "builtin:projects"
                        ? row.project
                        : row.machine
                    ).id === scope.groupId)),
          );
          const human =
            rows.length === 0
              ? "No threads found\n"
              : humanTable([
                  [
                    "ID",
                    "TITLE",
                    "STATUS",
                    "SECTION",
                    "PROJECT",
                    "MACHINE",
                    "STAGE",
                  ],
                  ...rows.map((row) => [
                    row.id,
                    row.title ?? row.titleFallback ?? "",
                    row.status,
                    row.section.name,
                    row.project.name,
                    row.machine.name,
                    WORKFLOW_STAGE_LABELS[row.stage],
                  ]),
                ]);
          return success(rows, human, options.json);
        },
      }),
      show: cliCommand({
        summary: "Show thread placement",
        options: {
          self: {
            type: "boolean",
            description: "Target the current thread",
          },
          ...JSON_OPTION,
        },
        positionals: [{ name: "thread", description: "Thread ID" }],
        async run({ options, positionals }, invocation) {
          const threadId = resolveThreadId(
            positionals.thread,
            options.self,
            invocation,
          );
          const child = await childPosition(context, threadId);
          if (child) {
            const stage = context.store.getPlacement({
              groupingKey: THREAD_STAGES_GROUPING_KEY,
              threadId,
            });
            if (!stage.ok) return domainFailure(stage);
            const stageName = stageId(stage.value.placement.groupId);
            return success(
              { ...child, stage: stageName },
              `${humanChildPosition(child)}  Stage: ${WORKFLOW_STAGE_LABELS[stageName]}\n`,
              options.json,
            );
          }
          const candidates = await context.threads({
            includeArchived: true,
            includeHidden: true,
            includeChildren: true,
          });
          const row = richThreadRows(
            context,
            availableGroupings(),
            candidates,
            [threadId],
          )[0];
          if (!row) throw new PluginCliError(`Thread not found: ${threadId}`);
          return success(
            row,
            humanPlacements(
              threadId,
              [
                { groupingKey: "builtin:sections", groupId: row.section.id },
                { groupingKey: "builtin:projects", groupId: row.project.id },
                { groupingKey: "builtin:machines", groupId: row.machine.id },
                { groupingKey: THREAD_STAGES_GROUPING_KEY, groupId: row.stage },
              ],
              availableGroupings(),
            ),
            options.json,
          );
        },
      }),
      children: cliCommand({
        summary: "List a thread's children in order",
        options: {
          self: {
            type: "boolean",
            description: "Target the current thread",
          },
          ...JSON_OPTION,
        },
        positionals: [{ name: "thread", description: "Parent thread ID" }],
        async run({ options, positionals }, invocation) {
          const threadId = resolveThreadId(
            positionals.thread,
            options.self,
            invocation,
          );
          const { threads, ranks } = await context.hierarchy();
          const children = liveChildren(threads, ranks, threadId);
          return success(
            children,
            children.length === 0
              ? "No child threads\n"
              : humanTable([
                  ["ID", "TITLE", "STATUS"],
                  ...children.map((thread) => [
                    thread.id,
                    thread.title ?? thread.titleFallback ?? "",
                    thread.status,
                  ]),
                ]),
            options.json,
          );
        },
      }),
      place: cliCommand({
        summary: "Deprecated: use stage or order",
        hidden: true,
        options: {
          self: {
            type: "boolean",
            description: "Target the current thread",
          },
          to: {
            type: "string",
            description: "Destination group; omit when reordering a child",
            placeholder: "group-ref",
          },
          before: {
            type: "string",
            description: "Next thread",
            placeholder: "thread",
          },
          after: {
            type: "string",
            description: "Previous thread",
            placeholder: "thread",
          },
          ...JSON_OPTION,
        },
        positionals: [{ name: "thread", description: "Thread ID" }],
        constraints: [{ kind: "at-most-one", options: ["before", "after"] }],
        async run({ options, positionals }, invocation) {
          const threadId = resolveThreadId(
            positionals.thread,
            options.self,
            invocation,
          );
          const child = await childPosition(context, threadId);
          if (child && options.to === undefined) {
            const anchor = options.before ?? options.after;
            if (anchor === undefined) {
              throw new PluginCliError(
                `Pass --before or --after a sibling of child thread ${threadId}.`,
              );
            }
            const moved = await orderThread(
              context,
              threadId,
              "builtin:sections",
              {
                kind: options.before ? "before" : "after",
                threadId: anchor,
              },
              invocation.threadId,
            );
            if (!("parentThreadId" in moved))
              throw new PluginCliError(
                `Thread ${threadId} is no longer a child.`,
              );
            return success(
              moved,
              `Thread ${threadId} updated\n${humanChildPosition(moved)}`,
              options.json,
            );
          }
          if (options.to === undefined) {
            throw new PluginCliError(
              `Missing --to for root thread ${threadId}.`,
            );
          }
          const destination = groupRef(options.to);
          if (child && destination.groupingKey !== THREAD_STAGES_GROUPING_KEY) {
            throw new PluginCliError(
              `Child thread ${threadId} stays under its parent ${child.parentThreadId}; use --to only for stages.`,
            );
          }
          if (child && (options.before || options.after)) {
            throw new PluginCliError(
              `Omit --to when reordering child thread ${threadId} among siblings.`,
            );
          }
          const anchor: OrderAnchor | undefined = options.before
            ? { kind: "before", threadId: options.before }
            : options.after
              ? { kind: "after", threadId: options.after }
              : undefined;
          const isStage =
            destination.groupingKey === THREAD_STAGES_GROUPING_KEY;
          if (isStage && anchor) {
            await validateRootOrder(
              context,
              threadId,
              "builtin:sections",
              anchor,
              destination.groupId,
            );
          }
          const result = await context.updatePlacement(
            {
              ...destination,
              threadId,
              origin: "cli",
              ...(!isStage && anchor ? { anchor } : {}),
            },
            { actorThreadId: invocation.threadId },
          );
          if (!result.ok) return domainFailure(result);
          if (isStage && anchor) {
            await orderThread(
              context,
              threadId,
              "builtin:sections",
              anchor,
              invocation.threadId,
            );
          }
          return success(
            result.value,
            `Thread ${threadId} updated\n${humanPlacements(
              threadId,
              [result.value.placement],
              availableGroupings(),
            )}`,
            options.json,
          );
        },
      }),
    },
  });
}

export async function runRibbonSidebarCli(
  context: RibbonSidebarCliContext,
  argv: readonly string[],
  invocation: RibbonSidebarCliInvocation = {},
): Promise<CliResult> {
  return defineRibbonSidebarCli(context).run(
    [...argv],
    invocation as PluginCliContext,
  );
}
