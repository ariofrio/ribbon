import type {
  GroupingDescriptor,
  GroupingKey,
  PlacementStore,
} from "./placement-store";

interface CliResult {
  exitCode: number;
  stdout?: string;
  stderr?: string;
}

export interface RibbonSidebarCliContext {
  store: PlacementStore;
  groupings(): readonly GroupingDescriptor[];
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

export interface RibbonSidebarCliInvocation {
  threadId?: string;
}

const GROUPING_KEY = /^(?:builtin:(?:projects|sections)|plugin:[^:/]+:[^:/]+)$/u;
const PLUGIN_KEY = /^plugin:[^:/]+:[^:/]+$/u;
const HELP = `Usage: bb ribbon-sidebar <command>

Commands:
  groupings
  groups <grouping>
  list [--scope <group-ref>] [--group-by <grouping>]
  show [thread] [--self]
  place [thread] --to <group-ref> [--before <thread>|--after <thread>]
  migrate thread-stages
  rekey --from <plugin-key> --to <plugin-key>
`;

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

export async function runRibbonSidebarCli(
  context: RibbonSidebarCliContext,
  argv: readonly string[],
  invocation: RibbonSidebarCliInvocation = {},
): Promise<CliResult> {
  const wantsJson = argv.includes("--json");
  const args = argv.filter((argument) => argument !== "--json");
  const command = args[0];
  try {
    if (!command || command === "--help" || command === "-h") {
      return { exitCode: 0, stdout: HELP };
    }
    if (command === "groupings") {
      if (args.length !== 1) throw new Error("Usage: bb ribbon-sidebar groupings");
      const values = context.groupings().map((grouping) => ({
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
      if (args.length !== 2) throw new Error("Usage: bb ribbon-sidebar groups <grouping>");
      const key = groupingKey(args[1]);
      const descriptor = context.groupings().find(
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
      const { options, positionals } = parse(args.slice(1), [
        "--scope",
        "--group-by",
      ]);
      if (positionals.length > 0) throw new Error("Usage: bb ribbon-sidebar list [options]");
      const available = context.groupings();
      const displayKey = groupingKey(
        stringOption(options, "--group-by") ?? available[0]?.groupingKey,
      );
      let threadIds: string[] | undefined;
      const rawScope = stringOption(options, "--scope");
      if (rawScope !== undefined) {
        const scope = groupRef(rawScope);
        const scoped = context.store.listPlacements({
          groupingKey: scope.groupingKey,
          groupIds: [scope.groupId],
        });
        if (!scoped.ok) return domainFailure(scoped);
        threadIds = scoped.value.items.map(({ threadId }) => threadId);
      }
      const listed = context.store.listPlacements({
        groupingKey: displayKey,
        ...(threadIds === undefined ? {} : { threadIds }),
      });
      if (!listed.ok) return domainFailure(listed);
      const human = listed.value.items.length === 0
        ? "No threads found\n"
        : `${listed.value.items
            .map(({ threadId, groupId }) => `${threadId}\t${groupId}`)
            .join("\n")}\n`;
      return success(listed.value, human, wantsJson);
    }
    if (command === "show") {
      const { options, positionals } = parse(args.slice(1), [], ["--self"]);
      if (positionals.length > 1) throw new Error("Usage: bb ribbon-sidebar show [thread] [--self]");
      const threadId = resolveThreadId(
        positionals[0],
        options.get("--self") === true,
        invocation,
      );
      const values = context.groupings().map((descriptor) =>
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
        `${successful
          .map(
            ({ placement }) =>
              `${placement.groupingKey}/${placement.groupId}`,
          )
          .join("\n")}\n`,
        wantsJson,
      );
    }
    if (command === "place") {
      const { options, positionals } = parse(args.slice(1), [
        "--to",
        "--before",
        "--after",
      ], ["--self"]);
      if (positionals.length > 1) throw new Error("Usage: bb ribbon-sidebar place [thread] --to <group-ref>");
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
        `${result.value.placement.threadId}\t${result.value.placement.groupingKey}/${result.value.placement.groupId}\n`,
        wantsJson,
      );
    }
    if (command === "migrate") {
      if (args.length !== 2 || args[1] !== "thread-stages") {
        throw new Error("Usage: bb ribbon-sidebar migrate thread-stages");
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
      if (positionals.length > 0) throw new Error("Usage: bb ribbon-sidebar rekey --from <plugin-key> --to <plugin-key>");
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
      exitCode: 2,
      stderr: `${error instanceof Error ? error.message : String(error)}\n`,
    };
  }
}
