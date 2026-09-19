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
import { orderedGroupings } from "./grouping-order";

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
  }):
    | readonly RibbonSidebarThread[]
    | Promise<readonly RibbonSidebarThread[]>;
  updatePlacement(
    input: Parameters<PlacementStore["updatePlacement"]>[0],
  ):
    | ReturnType<PlacementStore["updatePlacement"]>
    | Promise<ReturnType<PlacementStore["updatePlacement"]>>;
  migrateThreadStages?(): Promise<{
    installationId: string;
    revision: number;
    imported: boolean;
  }>;
}

export type RibbonSidebarThread = Awaited<
  ReturnType<BbPluginApi["sdk"]["threads"]["list"]>
>[number];

export interface RibbonSidebarCliInvocation {
  threadId?: string;
}

const GROUPING_KEY = /^(?:builtin:(?:projects|sections)|plugin:[^:/]+:[^:/]+)$/u;
const PLUGIN_KEY = /^plugin:[^:/]+:[^:/]+$/u;
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
  if (value === undefined || !GROUPING_KEY.test(value)) {
    throw new PluginCliError(`Invalid grouping key: ${value ?? "(missing)"}`);
  }
  return value as GroupingKey;
}

function pluginKey(value: string | undefined): `plugin:${string}:${string}` {
  if (value === undefined || !PLUGIN_KEY.test(value)) {
    throw new PluginCliError(
      `Invalid plugin grouping key: ${value ?? "(missing)"}`,
    );
  }
  return value as `plugin:${string}:${string}`;
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

function resolveThreadId(
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
  const availableGroupings = () => orderedGroupings(context.groupings());
  return defineCli({
    name: "sidebar",
    summary: "Inspect and change Ribbon sidebar placement",
    usageErrorExitCode: 2,
    commands: {
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
            description: "Include archived roots",
          },
          "include-hidden": {
            type: "boolean",
            description: "Include hidden roots",
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
        run({ options, positionals }, invocation) {
          const threadId = resolveThreadId(
            positionals.thread,
            options.self,
            invocation,
          );
          const values = availableGroupings().map((descriptor) =>
            context.store.getPlacement({
              groupingKey: descriptor.groupingKey,
              threadId,
            }),
          );
          const failure = values.find((result) => !result.ok);
          if (failure && !failure.ok) return domainFailure(failure);
          const successful = values
            .filter((result) => result.ok)
            .map(({ value }) => value);
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
      place: cliCommand({
        summary: "Place a thread",
        options: {
          self: {
            type: "boolean",
            description: "Target the current thread",
          },
          to: {
            type: "string",
            description: "Destination group",
            placeholder: "group-ref",
            required: true,
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
          const destination = groupRef(options.to);
          const result = await context.updatePlacement({
            ...destination,
            threadId,
            origin: "cli",
            ...(options.before
              ? { anchor: { kind: "before" as const, threadId: options.before } }
              : options.after
                ? { anchor: { kind: "after" as const, threadId: options.after } }
                : {}),
          });
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
      "migrate thread-stages": cliCommand({
        summary: "Migrate legacy Thread stages placement",
        options: JSON_OPTION,
        async run({ options }) {
          if (!context.migrateThreadStages) {
            throw new PluginCliError(
              "Thread stages migration is unavailable.",
            );
          }
          const result = await context.migrateThreadStages();
          return success(
            result,
            `${result.imported ? "Imported" : "Verified"} Thread stages placement revision ${result.revision}.\n`,
            options.json,
          );
        },
      }),
      rekey: cliCommand({
        summary: "Rekey provider placement",
        options: {
          from: {
            type: "string",
            description: "Existing plugin grouping key",
            placeholder: "plugin-key",
            required: true,
          },
          to: {
            type: "string",
            description: "Replacement plugin grouping key",
            placeholder: "plugin-key",
            required: true,
          },
          ...JSON_OPTION,
        },
        run({ options }) {
          const from = pluginKey(options.from);
          const to = pluginKey(options.to);
          const result = context.store.rekeyGrouping(from, to);
          const value = { from, to, ...result };
          return success(
            value,
            `Rekeyed ${result.assignments} assignments and ${result.orders} order rows.\n`,
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
