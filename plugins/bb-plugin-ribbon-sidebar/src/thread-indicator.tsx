import type {
  PluginSidebarThread,
  PluginSidebarThreadIndicator,
  PluginSidebarThreadRowStatus,
} from "@get-bb/plugin-sdk/app";
import { Icon } from "./vendor/components/ui/icon";
import type { PullRequestMark } from "./pull-request-status";
import { resolveThreadStatus, type ThreadStatus } from "./thread-status";

export function ThreadIndicator({
  indicator,
  label,
  pluginStatus = null,
  pullRequestMark = null,
  hideIdleDraftLabel = false,
  shine = true,
}: {
  indicator: PluginSidebarThreadIndicator;
  label: string | null;
  pluginStatus?: PluginSidebarThreadRowStatus | null;
  pullRequestMark?: PullRequestMark | null;
  hideIdleDraftLabel?: boolean;
  /** Off where the whole row shimmers instead, as bb's own icons do alone. */
  shine?: boolean;
}) {
  const className = "pointer-events-none size-4 shrink-0";
  const shineClass = shine ? "animate-shine-icon" : "";
  const ariaLabel = label ?? undefined;

  // GitHub's marks: red ✗ needs a fix, amber ● is pending, green ✓ is done.
  if (pullRequestMark === "failing" || pullRequestMark === "ready") {
    return (
      <Icon
        name={pullRequestMark === "failing" ? "X" : "Check"}
        aria-label={ariaLabel}
        className={`${className} ${pullRequestMark === "failing" ? "text-destructive" : "text-success"}`}
      />
    );
  }
  if (pullRequestMark === "waiting") {
    return (
      <span
        aria-label={ariaLabel}
        className="flex size-4 shrink-0 items-center justify-center"
        role="img"
      >
        <span className="size-[7px] rounded-full bg-attention" />
      </span>
    );
  }

  if (pluginStatus) {
    if (pluginStatus.tone === "running") {
      return (
        <span className="inline-flex size-4 items-center justify-center motion-safe:animate-pulse text-success">
          <Icon name={pluginStatus.icon} aria-label={pluginStatus.label} className={`${className} ${shineClass}`} />
        </span>
      );
    }
    return (
      <Icon
        name={pluginStatus.icon}
        aria-label={pluginStatus.label}
        className={`${className} ${pluginStatus.tone === "success" ? "text-success-foreground" : pluginStatus.tone === "error" ? "text-destructive" : "text-muted-foreground"}`}
      />
    );
  }

  switch (indicator) {
    case "unread-error":
    case "queued-failed":
      return (
        <Icon
          name="CircleX"
          aria-label={ariaLabel}
          className={`${className} text-destructive`}
        />
      );
    case "waiting-for-input":
    case "queued-waiting":
      return (
        <Icon
          name={indicator === "queued-waiting" ? "Clock" : "CircleQuestion"}
          aria-label={ariaLabel}
          className={`${className} text-muted-foreground/75`}
        />
      );
    case "runtime":
      return (
        <Icon
          name="Loading"
          aria-label={ariaLabel}
          className={`${className} animate-spin motion-reduce:animate-none text-muted-foreground/50`}
        />
      );
    case "workflow":
      return <ActiveIcon name="Workflow" label={ariaLabel} shine={shine} />;
    case "background-agent":
      return <ActiveIcon name="UserRoundPlus" label={ariaLabel} shine={shine} />;
    case "background-command":
      return <ActiveIcon name="Terminal" label={ariaLabel} shine={shine} />;
    case "plan-mode":
      return <ActiveIcon name="ListTodo" label={ariaLabel} shine={shine} />;
    case "goal":
      return <ActiveIcon name="Target" label={ariaLabel} shine={shine} />;
    case "draft":
      return (
        <Icon
          name="Edit"
          {...(hideIdleDraftLabel ? { "aria-hidden": true } : { "aria-label": ariaLabel })}
          className={`${className} text-muted-foreground`}
        />
      );
    case "working-draft":
      return (
        <Icon
          name="Edit"
          aria-label={ariaLabel}
          className={`${className} ${shineClass} text-muted-foreground/50`}
        />
      );
    case "unread-success":
      return (
        <span
          aria-label={ariaLabel}
          className="flex size-4 shrink-0 items-center justify-center"
        >
          <span className="size-[5px] rounded-full bg-muted-foreground/60 max-md:pointer-coarse:size-1.5" />
        </span>
      );
    case "none":
    default:
      return null;
  }
}

function ActiveIcon({
  name,
  label,
  shine,
}: {
  name: "Workflow" | "UserRoundPlus" | "Terminal" | "ListTodo" | "Target";
  label: string | undefined;
  shine: boolean;
}) {
  return (
    <Icon
      name={name}
      aria-label={label}
      className={`size-4 shrink-0 ${shine ? "animate-shine-icon" : ""} text-muted-foreground/50`}
    />
  );
}

// bb-app@0.43.4 provides each computed indicator and label, but does not export
// aggregate precedence. Keep the replacement sidebar aligned with bb and the
// compatible Thread stages renderer, including omission of unread-success.
const INDICATOR_PRIORITY: readonly PluginSidebarThreadIndicator[] = [
  "unread-error",
  "waiting-for-input",
  "working-draft",
  "plan-mode",
  "goal",
  "runtime",
  "workflow",
  "background-agent",
  "background-command",
  "draft",
];

export function groupIndicator(
  threads: readonly PluginSidebarThread[],
  draftIds: ReadonlySet<string>,
  pluginStatuses: ReadonlyMap<string, PluginSidebarThreadRowStatus>,
): ThreadStatus | null {
  const statuses = threads.map((thread) => resolveThreadStatus([thread], draftIds, pluginStatuses.get(thread.id)));
  for (const indicator of INDICATOR_PRIORITY) {
    const status = statuses.find((candidate) => candidate.indicator === indicator);
    if (status) return status;
  }
  return statuses.find((status) => status.pluginStatus !== null) ?? null;
}
