import type { BbPluginApi } from "@get-bb/plugin-sdk";
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
const USAGE = {
  groupings: "Usage: bb sidebar groupings [--json]\n",
  groups: "Usage: bb sidebar groups <grouping> [--json]\n",
  list:
    "Usage: bb sidebar list [--scope <group-ref>] [--include-archived] [--include-hidden] [--json]\n",
  show:
    "Usage: bb sidebar show [thread] [--self] [--json]\n",
  place:
    "Usage: bb sidebar place [thread] [--self] --to <group-ref> [--before <thread>|--after <thread>] [--json]\n",
  migrate: "Usage: bb sidebar migrate thread-stages [--json]\n",
  rekey:
    "Usage: bb sidebar rekey --from <plugin-key> --to <plugin-key> [--json]\n",
} as const;
const HELP = `Usage: bb sidebar [options] [command]

Inspect and change Ribbon sidebar placement

Options:
  -h, --help                                  display help for command

Commands:
  groupings [options]                         List groupings
  groups [options] <grouping>                 List groups
  list [options]                              List threads
  show [options] [thread]                     Show thread placement
  place [options] [thread]                    Place a thread
  migrate [options] thread-stages             Migrate legacy placement
  rekey [options]                             Rekey provider placement
  help [command]                              display help for command
`;
const COMMAND_HELP: Record<keyof typeof USAGE, string> = {
  groupings: `${USAGE.groupings}\nList groupings\n\nOptions:\n  --json      Print machine-readable JSON output\n  -h, --help  display help for command\n`,
  groups: `${USAGE.groups}\nList groups\n\nArguments:\n  grouping    Grouping key\n\nOptions:\n  --json      Print machine-readable JSON output\n  -h, --help  display help for command\n`,
  list: `${USAGE.list}\nList threads with their Ribbon groups\n\nOptions:\n  --scope <group-ref>  Filter by group\n  --include-archived   Include archived roots\n  --include-hidden     Include hidden roots\n  --json               Print machine-readable JSON output\n  -h, --help           display help for command\n`,
  show: `${USAGE.show}\nShow thread placement\n\nOptions:\n  --self      Target the current thread\n  --json      Print machine-readable JSON output\n  -h, --help  display help for command\n`,
  place: `${USAGE.place}\nPlace a thread\n\nOptions:\n  --self             Target the current thread\n  --to <group-ref>   Destination group\n  --before <thread>  Next thread\n  --after <thread>   Previous thread\n  --json             Print machine-readable JSON output\n  -h, --help         display help for command\n`,
  migrate: `${USAGE.migrate}\nMigrate legacy Thread stages placement\n\nOptions:\n  --json      Print machine-readable JSON output\n  -h, --help  display help for command\n`,
  rekey: `${USAGE.rekey}\nRekey provider placement\n\nOptions:\n  --from <plugin-key>  Existing plugin grouping key\n  --to <plugin-key>    Replacement plugin grouping key\n  --json               Print machine-readable JSON output\n  -h, --help           display help for command\n`,
};

function json(value: unknown) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function groupingKey(value: string | undefined): GroupingKey {
  if (value === undefined || !GROUPING_KEY.test(value)) {
    throw new Error(`Invalid grouping key: ${value ?? "(missing)"}`);
  }
  return value as GroupingKey;
}

function pluginKey(value: string | undefined): `plugin:${string}:${string}` {
  if (value === undefined || !PLUGIN_KEY.test(value)) {
    throw new Error(`Invalid plugin grouping key: ${value ?? "(missing)"}`);
  }
  return value as `plugin:${string}:${string}`;
}

function groupRef(value: string | undefined) {
  if (value === undefined) throw new Error("Missing group reference.");
  const slash = value.indexOf("/");
  if (slash <= 0 || slash !== value.lastIndexOf("/") || slash === value.length - 1) {
    throw new Error(
      `Invalid group reference: ${value}. Expected <grouping-key>/<group-id>.`,
    );
  }
  return {
    groupingKey: groupingKey(value.slice(0, slash)),
    groupId: value.slice(slash + 1),
  };
}

function parse(
  args: readonly string[],
  valueOptions: readonly string[],
  booleanOptions: readonly string[] = [],
) {
  const options = new Map<string, string | true>();
  const positionals: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index] ?? "";
    if (!argument.startsWith("--")) {
      positionals.push(argument);
      continue;
    }
    if (options.has(argument)) throw new Error(`Option cannot repeat: ${argument}`);
    if (booleanOptions.includes(argument)) {
      options.set(argument, true);
      continue;
    }
    if (!valueOptions.includes(argument)) throw new Error(`Unknown option: ${argument}`);
    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Option ${argument} requires a value.`);
    }
    options.set(argument, value);
    index += 1;
  }
  return { options, positionals };
}

function stringOption(options: Map<string, string | true>, name: string) {
  const value = options.get(name);
  return typeof value === "string" ? value : undefined;
}

function resolveThreadId(
  positional: string | undefined,
  self: boolean,
  invocation: RibbonSidebarCliInvocation,
) {
  if (self && positional) throw new Error("Cannot combine a thread ID with --self.");
  if (self) {
    if (!invocation.threadId) throw new Error("--self requires a current bb thread.");
    return invocation.threadId;
  }
  if (!positional) throw new Error("Missing thread ID. Pass <thread> or --self.");
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

function domainFailure(result: { ok: false; error: { message: string } }): CliResult {
  return { exitCode: 1, stderr: `${result.error.message}\n` };
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

function commandHelp(command: string | undefined): string | null {
  if (!command) return HELP;
  return command in COMMAND_HELP
    ? COMMAND_HELP[command as keyof typeof COMMAND_HELP]
    : null;
}

export async function runRibbonSidebarCli(
  context: RibbonSidebarCliContext,
  argv: readonly string[],
  invocation: RibbonSidebarCliInvocation = {},
): Promise<CliResult> {
  const wantsJson = argv.includes("--json");
  const args = argv.filter((argument) => argument !== "--json");
  const command = args[0];
  const availableGroupings = () => orderedGroupings(context.groupings());
  try {
    if (!command || command === "--help" || command === "-h") {
      return { exitCode: 0, stdout: HELP };
    }
    if (
      command === "help" ||
      args.slice(1).some((argument) => argument === "--help" || argument === "-h")
    ) {
      const requested = command === "help" ? args[1] : command;
      const help = commandHelp(requested);
      return help
        ? { exitCode: 0, stdout: help }
        : {
            exitCode: 2,
            stderr: `Unknown command: ${requested ?? command}\n\n${HELP}`,
          };
    }
    if (command === "groupings") {
      if (args.length !== 1) {
        return { exitCode: 2, stderr: USAGE.groupings };
      }
      const values = availableGroupings().map((grouping) => ({
        groupingKey: grouping.groupingKey,
        label: grouping.pluralLabel,
      }));
      return success(
        values,
        `KEY${" ".repeat(34)}LABEL\n${values
          .map(({ groupingKey: key, label }) => `${key.padEnd(37)}${label}`)
          .join("\n")}\n`,
        wantsJson,
      );
    }
    if (command === "groups") {
      if (args.length !== 2) {
        return { exitCode: 2, stderr: USAGE.groups };
      }
      const key = groupingKey(args[1]);
      const descriptor = availableGroupings().find(
        (candidate) => candidate.groupingKey === key,
      );
      if (!descriptor) throw new Error(`Grouping not found: ${key}`);
      const values = descriptor.groups.map(groupJson);
      return success(
        values,
        `ID${" ".repeat(23)}LABEL\n${values
          .map(({ id, label }) => `${id.padEnd(25)}${label}`)
          .join("\n")}\n`,
        wantsJson,
      );
    }
    if (command === "list") {
      const { options, positionals } = parse(
        args.slice(1),
        ["--scope"],
        ["--include-archived", "--include-hidden"],
      );
      if (positionals.length > 0) {
        return { exitCode: 2, stderr: USAGE.list };
      }
      const available = availableGroupings();
      const rawScope = stringOption(options, "--scope");
      const scope = rawScope === undefined ? undefined : groupRef(rawScope);
      if (scope !== undefined) {
        const scopedGrouping = available.find(
          ({ groupingKey: key }) => key === scope.groupingKey,
        );
        if (!scopedGrouping) {
          throw new Error(`Grouping not found: ${scope.groupingKey}`);
        }
        if (!scopedGrouping.groups.some(({ id }) => id === scope.groupId)) {
          throw new Error(
            `Group not found: ${scope.groupingKey}/${scope.groupId}`,
          );
        }
      }
      const orderKey = scope?.groupingKey ??
        available.find(({ groupingKey: key }) => key === "builtin:sections")
          ?.groupingKey ?? available[0]?.groupingKey;
      if (!orderKey) throw new Error("No sidebar groupings are available.");
      const listed = context.store.listPlacements({
        groupingKey: orderKey,
      });
      if (!listed.ok) return domainFailure(listed);
      const candidates = await context.threads({
        includeArchived: options.get("--include-archived") === true,
        includeHidden: options.get("--include-hidden") === true,
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
                const [, pluginId, groupingId] = grouping.groupingKey.split(":");
                return thread.pluginGroups.find(
                  (group) =>
                    group.pluginId === pluginId &&
                    group.groupingId === groupingId,
                )?.groupName ?? "";
              }),
            ]),
          ]);
      return success(rows, human, wantsJson);
    }
    if (command === "show") {
      const { options, positionals } = parse(args.slice(1), [], ["--self"]);
      if (positionals.length > 1) {
        return { exitCode: 2, stderr: USAGE.show };
      }
      const threadId = resolveThreadId(
        positionals[0],
        options.get("--self") === true,
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
        wantsJson,
      );
    }
    if (command === "place") {
      const { options, positionals } = parse(args.slice(1), [
        "--to",
        "--before",
        "--after",
      ], ["--self"]);
      if (positionals.length > 1) {
        return { exitCode: 2, stderr: USAGE.place };
      }
      const before = stringOption(options, "--before");
      const after = stringOption(options, "--after");
      if (before && after) throw new Error("Use only one of --before or --after.");
      const threadId = resolveThreadId(
        positionals[0],
        options.get("--self") === true,
        invocation,
      );
      const destination = groupRef(stringOption(options, "--to"));
      const result = await context.updatePlacement({
        ...destination,
        threadId,
        origin: "cli",
        ...(before
          ? { anchor: { kind: "before" as const, threadId: before } }
          : after
            ? { anchor: { kind: "after" as const, threadId: after } }
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
        wantsJson,
      );
    }
    if (command === "migrate") {
      if (args.length !== 2 || args[1] !== "thread-stages") {
        return { exitCode: 2, stderr: USAGE.migrate };
      }
      if (!context.migrateThreadStages) {
        throw new Error("Thread stages migration is unavailable.");
      }
      const result = await context.migrateThreadStages();
      return success(
        result,
        `${result.imported ? "Imported" : "Verified"} Thread stages placement revision ${result.revision}.\n`,
        wantsJson,
      );
    }
    if (command === "rekey") {
      const { options, positionals } = parse(args.slice(1), ["--from", "--to"]);
      if (positionals.length > 0) {
        return { exitCode: 2, stderr: USAGE.rekey };
      }
      const from = pluginKey(stringOption(options, "--from"));
      const to = pluginKey(stringOption(options, "--to"));
      const result = context.store.rekeyGrouping(from, to);
      const value = { from, to, ...result };
      return success(
        value,
        `Rekeyed ${result.assignments} assignments and ${result.orders} order rows.\n`,
        wantsJson,
      );
    }
    return { exitCode: 2, stderr: `Unknown command: ${command}\n\n${HELP}` };
  } catch (error) {
    return {
      exitCode: 1,
      stderr: `${error instanceof Error ? error.message : String(error)}\n`,
    };
  }
}
