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
} from "./placement-store";
import {
  liveChildren,
  liveParentId,
  moveChild,
  type ChildRank,
} from "./child-order";
import { groupingKeySchema } from "./contracts";
import { THREAD_STAGES_GROUPING_KEY } from "./workflow/catalog";
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
  }):
    | readonly RibbonSidebarThread[]
    | Promise<readonly RibbonSidebarThread[]>;
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
  if (slash <= 0 || slash !== value.lastIndexOf("/") || slash === value.length - 1) {
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
        .map((value, column) =>
          value.padEnd(widths?.[column] ?? value.length),
        )
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
    groupings.map((grouping) => [
      grouping.groupingKey,
      grouping,
    ]),
  );
  const details = placements.map(
    (placement) => {
      const descriptor = descriptors.get(placement.groupingKey);
      return `  ${descriptor?.singularLabel ?? "Group"}: ${
        descriptor ? groupName(descriptor, placement.groupId) : placement.groupId
      }`;
    },
  );
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

function domainFailure(result: { ok: false; error: { message: string } }): never {
  throw new PluginCliError(result.error.message);
}

function groupJson(group: GroupingDescriptor["groups"][number]) {
  return {
    id: group.id,
    label: group.label,
    acceptsAssignments: group.acceptsAssignments,
    ...(group.visibleWhenEmpty === undefined
      ? {}
      : { visibleWhenEmpty: group.visibleWhenEmpty }),
    ...(group.defaultCollapsed === undefined
      ? {}
      : { defaultCollapsed: group.defaultCollapsed }),
  };
}

function groupName(
  grouping: GroupingDescriptor,
  groupId: string,
): string {
  return grouping.groups.find(({ id }) => id === groupId)?.label ?? groupId;
}

function richThreadRows(
  context: RibbonSidebarCliContext,
  groupings: readonly GroupingDescriptor[],
  candidates: readonly RibbonSidebarThread[],
  threadIds: readonly string[],
) {
  const threads = new Map(candidates.map((thread) => [thread.id, thread]));
  const rootIds = rootThreadIdByThreadId(candidates);
  const groupIds = new Map<GroupingKey, Map<string, string>>();
  for (const grouping of groupings) {
    const listed = context.store.listPlacements({
      groupingKey: grouping.groupingKey,
      threadIds,
    });
    if (!listed.ok) throw new Error(listed.error.message);
    const ids = new Map(
      listed.value.items.map(({ threadId, groupId }) => [threadId, groupId]),
    );
    for (const threadId of threadIds) {
      if (ids.has(threadId)) continue;
      const rootId = rootIds.get(threadId);
      if (grouping.groupingKey.startsWith("builtin:") && rootId && ids.has(rootId)) {
        ids.set(threadId, ids.get(rootId)!);
        continue;
      }
      const groupId = grouping.membership.kind === "ribbon"
        ? grouping.defaultGroupId
        : grouping.membership.groupIdForThread(threadId);
      if (groupId !== null) ids.set(threadId, groupId);
    }
    groupIds.set(grouping.groupingKey, ids);
  }
  const projects = groupings.find(
    ({ groupingKey: key }) => key === "builtin:projects",
  );
  const sections = groupings.find(
    ({ groupingKey: key }) => key === "builtin:sections",
  );
  const pluginGroupings = groupings.filter(({ groupingKey: key }) =>
    key.startsWith("plugin:"),
  );

  return threadIds.flatMap((threadId) => {
    const thread = threads.get(threadId);
    if (!thread) return [];
    const projectId = projects
      ? groupIds.get(projects.groupingKey)?.get(threadId)
      : undefined;
    const sectionId = sections
      ? groupIds.get(sections.groupingKey)?.get(threadId)
      : undefined;
    return [{
      ...thread,
      project:
        projects && projectId
          ? { id: projectId, name: groupName(projects, projectId) }
          : null,
      section:
        sections && sectionId
          ? { id: sectionId, name: groupName(sections, sectionId) }
          : null,
      pluginGroups: pluginGroupings.flatMap((grouping) => {
        const groupId = groupIds.get(grouping.groupingKey)?.get(threadId);
        if (!groupId) return [];
        const [, pluginId, groupingId] = grouping.groupingKey.split(":");
        return [{
          pluginId: pluginId ?? "",
          groupingId: groupingId ?? "",
          groupingName: grouping.pluralLabel,
          groupId,
          groupName: groupName(grouping, groupId),
        }];
      }),
    }];
  });
}

function rowMatchesScope(
  row: ReturnType<typeof richThreadRows>[number],
  scope: { groupingKey: GroupingKey; groupId: string },
) {
  if (scope.groupingKey === "builtin:projects") {
    return row.project?.id === scope.groupId;
  }
  if (scope.groupingKey === "builtin:sections") {
    return row.section?.id === scope.groupId;
  }
  const [, pluginId, groupingId] = scope.groupingKey.split(":");
  return row.pluginGroups.some(
    (group) =>
      group.pluginId === pluginId &&
      group.groupingId === groupingId &&
      group.groupId === scope.groupId,
  );
}

export function defineRibbonSidebarCli(
  context: RibbonSidebarCliContext,
): PluginCliRegistration {
  const availableGroupings = () => context.groupings();
  return defineCli({
    name: "thread-stages",
    summary: "Inspect and change thread stages, sidebar placement, and layout preferences",
    usageErrorExitCode: 2,
    commands: {
      ...context.extraCommands,
      groupings: cliCommand({
        summary: "List groupings",
        options: JSON_OPTION,
        run({ options }) {
          const values = availableGroupings().map((grouping) => ({
            groupingKey: grouping.groupingKey,
            label: grouping.pluralLabel,
          }));
          return success(
            values,
            `KEY${" ".repeat(34)}LABEL\n${values
              .map(({ groupingKey: key, label }) => `${key.padEnd(37)}${label}`)
              .join("\n")}\n`,
            options.json,
          );
        },
      }),
      groups: cliCommand({
        summary: "List groups",
        options: JSON_OPTION,
        positionals: [
          {
            name: "grouping",
            description: "Grouping key",
            required: true,
          },
        ],
        run({ options, positionals }) {
          const key = groupingKey(positionals.grouping);
          const descriptor = availableGroupings().find(
            (candidate) => candidate.groupingKey === key,
          );
          if (!descriptor) {
            throw new PluginCliError(`Grouping not found: ${key}`);
          }
          const values = descriptor.groups.map(groupJson);
          return success(
            values,
            `ID${" ".repeat(23)}LABEL\n${values
              .map(({ id, label }) => `${id.padEnd(25)}${label}`)
              .join("\n")}\n`,
            options.json,
          );
        },
      }),
      list: cliCommand({
        summary: "List threads",
        description: "List threads with their Ribbon groups.",
        options: {
          scope: {
            type: "string",
            description: "Filter by group",
            placeholder: "group-ref",
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
          const scope = options.scope === undefined
            ? undefined
            : groupRef(options.scope);
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
          const orderKey = scope?.groupingKey ??
            available.find(({ groupingKey: key }) => key === "builtin:sections")
              ?.groupingKey ?? available[0]?.groupingKey;
          if (!orderKey) {
            throw new PluginCliError("No sidebar groupings are available.");
          }
          const listed = context.store.listPlacements({ groupingKey: orderKey });
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
          const rows = scope === undefined
            ? allRows
            : allRows.filter((row) => rowMatchesScope(row, scope));
          const pluginGroupings = available.filter(({ groupingKey: key }) =>
            key.startsWith("plugin:"),
          );
          const human = rows.length === 0
            ? "No threads found\n"
            : humanTable([
                [
                  "ID",
                  "TITLE",
                  "STATUS",
                  "SECTION",
                  "PROJECT",
                  ...pluginGroupings.map(({ singularLabel }) =>
                    singularLabel.toUpperCase(),
                  ),
                ],
                ...rows.map((thread) => [
                  thread.id,
                  thread.title ?? thread.titleFallback ?? "",
                  thread.status,
                  thread.section?.name ?? "",
                  thread.project?.name ?? "",
                  ...pluginGroupings.map((grouping) => {
                    const [, pluginId, groupingId] =
                      grouping.groupingKey.split(":");
                    return thread.pluginGroups.find(
                      (group) =>
                        group.pluginId === pluginId &&
                        group.groupingId === groupingId,
                    )?.groupName ?? "";
                  }),
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
        positionals: [
          { name: "thread", description: "Thread ID" },
        ],
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
            const stageName = stage.value.placement.groupId;
            return success(
              { ...child, stage: stageName },
              `${humanChildPosition(child)}  Stage: ${stageName}\n`,
              options.json,
            );
          }
          const values = availableGroupings().map((descriptor) =>
            context.store.getPlacement({
              groupingKey: descriptor.groupingKey,
              threadId,
            }),
          );
          const failure = values.find(
            (result) => !result.ok && result.error.code !== "THREAD_INELIGIBLE",
          );
          if (failure && !failure.ok) return domainFailure(failure);
          const successful = values
            .filter((result) => result.ok)
            .map(({ value }) => value);
          if (successful.length === 0) {
            const ineligible = values.find((result) => !result.ok);
            if (ineligible && !ineligible.ok) return domainFailure(ineligible);
          }
          return success(
            successful,
            humanPlacements(
              threadId,
              successful.map(({ placement }) => placement),
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
        summary: "Place a thread",
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
        positionals: [
          { name: "thread", description: "Thread ID" },
        ],
        constraints: [
          { kind: "at-most-one", options: ["before", "after"] },
        ],
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
            if (
              anchor === threadId ||
              !child.siblingThreadIds.includes(anchor)
            ) {
              throw new PluginCliError(
                `Thread ${anchor} is not a sibling of child thread ${threadId}.`,
              );
            }
            const others = child.siblingThreadIds.filter((id) => id !== threadId);
            const beforeThreadId = options.before
              ? anchor
              : (others[others.indexOf(anchor) + 1] ?? null);
            const threadIds = moveChild(
              child.siblingThreadIds,
              threadId,
              beforeThreadId,
            )!;
            await context.reorderChildren(child.parentThreadId, threadIds);
            const moved = {
              ...child,
              position: threadIds.indexOf(threadId) + 1,
              siblingThreadIds: threadIds,
            };
            return success(
              moved,
              `Thread ${threadId} updated\n${humanChildPosition(moved)}`,
              options.json,
            );
          }
          if (options.to === undefined) {
            throw new PluginCliError(`Missing --to for root thread ${threadId}.`);
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
          const result = await context.updatePlacement(
            {
              ...destination,
              threadId,
              origin: "cli",
              ...(options.before
                ? { anchor: { kind: "before" as const, threadId: options.before } }
                : options.after
                  ? { anchor: { kind: "after" as const, threadId: options.after } }
                  : {}),
            },
            { actorThreadId: invocation.threadId },
          );
          if (!result.ok) return domainFailure(result);
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
