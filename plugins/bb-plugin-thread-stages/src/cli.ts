import { WORKFLOW_STAGES, parseWorkflowStage } from "./workflow-stage";
import {
  RibbonSidebarDependencyError,
  THREAD_STAGES_GROUPING_KEY,
  type RibbonSidebarClient,
} from "./ribbon-sidebar-client";

interface CliResult {
  exitCode: number;
  stdout?: string;
  stderr?: string;
}

export interface ThreadWorkflowCliContext {
  enabledStages?: readonly (typeof WORKFLOW_STAGES)[number][];
  listThreadIds?: readonly string[];
  rootIdsByThreadId?: ReadonlyMap<string, string | null>;
  threadId?: string;
}

interface WorkflowLookup {
  threadId: string;
  workflowStage: (typeof WORKFLOW_STAGES)[number];
  sortKey: string | null;
  updatedAt: number | null;
  explicit: true;
}

const STAGE_LABELS = WORKFLOW_STAGES.join(", ");
const USAGE = {
  list: "Usage: bb thread-stages list [--stage <stage>] [--json]\n",
  show: "Usage: bb thread-stages show [id] [--self] [--json]\n",
  update:
    "Usage: bb thread-stages update [id] [--self] [--stage <stage>] [--after <id>] [--before <id>] [--json]\n",
} as const;
const HELP = `Usage: bb thread-stages [options] [command]

Organize root threads into stages through Ribbon sidebar

Options:
  -h, --help                         display help for command

Commands:
  list [options]                     List threads
  show [options] [id]                Show stage details
  update [options] [id]              Update a stage or position
  help [command]                     display help for command
`;
const COMMAND_HELP: Record<keyof typeof USAGE, string> = {
  list: `${USAGE.list}\nList threads\n\nOptions:\n  --stage <stage>  Filter by stage\n  --json           Print machine-readable JSON output\n  -h, --help       display help for command\n`,
  show: `${USAGE.show}\nShow stage details\n\nOptions:\n  --self      Target the current thread\n  --json      Print machine-readable JSON output\n  -h, --help  display help for command\n`,
  update: `${USAGE.update}\nUpdate a stage or position\n\nOptions:\n  --self           Target the current thread\n  --stage <stage>  Set the stage: ${STAGE_LABELS}\n  --after <id>     Previous thread, or omit for the start\n  --before <id>    Next thread, or omit for the end\n  --json           Print machine-readable JSON output\n  -h, --help       display help for command\n`,
};

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function workflowJson(value: WorkflowLookup) {
  const { threadId, workflowStage, sortKey: _sortKey, ...workflow } = value;
  return { id: threadId, workflowStage, ...workflow };
}

function parseArguments(
  args: readonly string[],
  valueOptions: readonly string[],
  booleanOptions: readonly string[] = [],
) {
  const options = new Map<string, string | true>();
  const positionals: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? "";
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }
    if (options.has(arg)) throw new Error(`Option ${arg} cannot be repeated.`);
    if (booleanOptions.includes(arg)) {
      options.set(arg, true);
      continue;
    }
    if (!valueOptions.includes(arg)) throw new Error(`Unknown option: ${arg}`);
    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Option ${arg} requires a value.`);
    }
    options.set(arg, value);
    index += 1;
  }
  return { options, positionals };
}

function resolveRootThreadId(
  positionalId: string | undefined,
  self: boolean,
  context: ThreadWorkflowCliContext,
): string {
  if (self && positionalId) {
    throw new Error("Cannot combine a thread ID argument with --self.");
  }
  const threadId = self ? context.threadId : positionalId;
  if (!threadId) {
    throw new Error(
      self
        ? "--self requires a current bb thread."
        : "Missing thread ID. Pass <id> or use --self.",
    );
  }
  if (context.rootIdsByThreadId?.has(threadId)) {
    const rootId = context.rootIdsByThreadId.get(threadId) ?? null;
    if (rootId !== threadId) {
      throw new Error(
        rootId === null
          ? `Child thread ${threadId} has no stage.`
          : `Child thread ${threadId} has no stage; its stage belongs to root thread ${rootId}.`,
      );
    }
  }
  return threadId;
}

function humanWorkflow(value: WorkflowLookup): string {
  return `Thread: ${value.threadId}\n  Stage: ${value.workflowStage}\n  Order: ${value.sortKey ?? "-"}\n`;
}

function humanWorkflowList(
  assignments: ReadonlyArray<Pick<WorkflowLookup, "threadId" | "workflowStage">>,
): string {
  if (assignments.length === 0) return "No threads found\n";
  const rows = [
    ["ID", "Stage"],
    ...assignments.map(({ threadId, workflowStage }) => [threadId, workflowStage]),
  ];
  const widths = [0, 1].map((column) =>
    Math.max(...rows.map((row) => row[column]?.length ?? 0)),
  );
  return `\n${rows
    .map((row) =>
      row
        .map((value, column) => value.padEnd(widths[column] ?? value.length))
        .join("  ")
        .trimEnd(),
    )
    .join("\n")}\n\n`;
}

function commandHelp(command: string | undefined): string | null {
  if (!command) return HELP;
  return command in COMMAND_HELP
    ? COMMAND_HELP[command as keyof typeof COMMAND_HELP]
    : null;
}

function placementValue<Value>(
  result:
    | { ok: true; value: Value }
    | { ok: false; error: { code: string; message: string } },
): Value {
  if (!result.ok) {
    throw new RibbonSidebarDependencyError(
      `Ribbon sidebar rejected the request (${result.error.code}): ${result.error.message}`,
    );
  }
  return result.value;
}

function lookup(placement: {
  threadId: string;
  groupId: string;
  enteredAtMs: number | null;
}): WorkflowLookup {
  const workflowStage = parseWorkflowStage(placement.groupId);
  if (workflowStage === null) {
    throw new RibbonSidebarDependencyError(
      `Ribbon sidebar returned unknown stage ${placement.groupId}.`,
    );
  }
  return {
    threadId: placement.threadId,
    workflowStage,
    sortKey: null,
    updatedAt: placement.enteredAtMs,
    explicit: true,
  };
}

export async function runForwardedThreadWorkflowCli(
  ribbonSidebar: RibbonSidebarClient,
  argv: readonly string[],
  context: ThreadWorkflowCliContext = {},
): Promise<CliResult> {
  const wantsJson = argv.includes("--json");
  const args = argv.filter((arg) => arg !== "--json");
  const command = args[0];

  try {
    if (!command || command === "--help" || command === "-h") {
      return { exitCode: 0, stdout: HELP };
    }
    if (command === "help" || args[1] === "--help" || args[1] === "-h") {
      const help = commandHelp(command === "help" ? args[1] : command);
      return help
        ? { exitCode: 0, stdout: help }
        : { exitCode: 2, stderr: `Unknown command: ${args[1] ?? command}\n\n${HELP}` };
    }
    if (command === "list") {
      const { options, positionals } = parseArguments(args.slice(1), ["--stage"]);
      if (positionals.length > 0) return { exitCode: 2, stderr: USAGE.list };
      const rawStage = options.get("--stage");
      const stage = typeof rawStage === "string" ? parseWorkflowStage(rawStage) : null;
      if (rawStage && !stage) {
        throw new Error(`Unknown stage. Expected one of: ${STAGE_LABELS}`);
      }
      const result = placementValue(
        await ribbonSidebar.listPlacementsV1({
          groupingKey: THREAD_STAGES_GROUPING_KEY,
          ...(context.listThreadIds ? { threadIds: [...context.listThreadIds] } : {}),
          ...(stage ? { groupIds: [stage] } : {}),
        }),
      );
      const assignments = result.items.map(lookup);
      return {
        exitCode: 0,
        stdout: wantsJson
          ? json(assignments.map(workflowJson))
          : humanWorkflowList(assignments),
      };
    }
    if (command === "show") {
      const { options, positionals } = parseArguments(args.slice(1), [], ["--self"]);
      if (positionals.length > 1) return { exitCode: 2, stderr: USAGE.show };
      const threadId = resolveRootThreadId(
        positionals[0],
        options.get("--self") === true,
        context,
      );
      const current = placementValue(
        await ribbonSidebar.getPlacementV1({
          groupingKey: THREAD_STAGES_GROUPING_KEY,
          threadId,
        }),
      );
      const workflow = lookup(current.placement);
      return {
        exitCode: 0,
        stdout: wantsJson ? json(workflowJson(workflow)) : humanWorkflow(workflow),
      };
    }
    if (command === "update") {
      const { options, positionals } = parseArguments(
        args.slice(1),
        ["--stage", "--after", "--before"],
        ["--self"],
      );
      if (positionals.length > 1) return { exitCode: 2, stderr: USAGE.update };
      const rawStage = options.get("--stage");
      const rawAfter = options.get("--after");
      const rawBefore = options.get("--before");
      if (
        typeof rawStage !== "string" &&
        typeof rawAfter !== "string" &&
        typeof rawBefore !== "string"
      ) {
        throw new Error("No changes requested. Provide --stage, --after, or --before.");
      }
      const threadId = resolveRootThreadId(
        positionals[0],
        options.get("--self") === true,
        context,
      );
      const current = placementValue(
        await ribbonSidebar.getPlacementV1({
          groupingKey: THREAD_STAGES_GROUPING_KEY,
          threadId,
        }),
      );
      const currentStage = parseWorkflowStage(current.placement.groupId);
      const stage = typeof rawStage === "string" ? parseWorkflowStage(rawStage) : currentStage;
      if (stage === null) {
        throw new Error(`Unknown stage. Expected one of: ${STAGE_LABELS}`);
      }
      if (
        typeof rawStage === "string" &&
        context.enabledStages &&
        !context.enabledStages.includes(stage)
      ) {
        throw new Error(`Stage ${stage} is disabled in Thread stages settings.`);
      }

      const warnings: string[] = [];
      const validNeighbor = async (
        flag: "--after" | "--before",
        raw: string | true | undefined,
      ): Promise<string | null> => {
        if (typeof raw !== "string") return null;
        const neighbor = placementValue(
          await ribbonSidebar.getPlacementV1({
            groupingKey: THREAD_STAGES_GROUPING_KEY,
            threadId: raw,
          }),
        );
        if (neighbor.placement.groupId !== stage) {
          warnings.push(
            `Warning: ${flag} thread ${raw} is not in stage ${stage}; ignoring ${flag}.`,
          );
          return null;
        }
        return raw;
      };
      const after = await validNeighbor("--after", rawAfter);
      const before = await validNeighbor("--before", rawBefore);
      const anchor =
        before !== null
          ? { kind: "before" as const, threadId: before }
          : after !== null
            ? { kind: "after" as const, threadId: after }
            : currentStage === stage
              ? { kind: "preserve" as const }
              : { kind: "end" as const };
      const updated = placementValue(
        await ribbonSidebar.updatePlacementV1({
          groupingKey: THREAD_STAGES_GROUPING_KEY,
          groupId: stage,
          threadId,
          anchor,
          expectedRevision: current.revision,
          origin: "cli",
        }),
      );
      const workflow = lookup(updated.placement);
      return {
        exitCode: 0,
        stdout: wantsJson
          ? json(workflowJson(workflow))
          : `Thread ${threadId} updated\n${humanWorkflow(workflow)}`,
        ...(warnings.length > 0 ? { stderr: `${warnings.join("\n")}\n` } : {}),
      };
    }
    return { exitCode: 2, stderr: `Unknown command: ${command}\n\n${HELP}` };
  } catch (error) {
    return {
      exitCode: 1,
      stderr: `${error instanceof Error ? error.message : String(error)}\n`,
    };
  }
}
