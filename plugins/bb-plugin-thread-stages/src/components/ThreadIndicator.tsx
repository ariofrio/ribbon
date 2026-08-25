import type {
  PluginSidebarThread,
  PluginSidebarThreadIndicator,
} from "@get-bb/plugin-sdk/app";
import { Icon } from "./Icon";

export function ThreadIndicator({
  indicator,
  label,
}: {
  indicator: PluginSidebarThreadIndicator;
  label: string | null;
}) {
  const iconClass = "size-4 shrink-0";
  const ariaLabel = label ?? undefined;

  switch (indicator) {
    case "unread-error":
      return (
        <Icon
          name="CircleX"
          aria-label={ariaLabel}
          className={`${iconClass} text-destructive`}
        />
      );
    case "waiting-for-input":
      return (
        <Icon
          name="CircleQuestion"
          aria-label={ariaLabel}
          className={`${iconClass} text-muted-foreground/75`}
        />
      );
    case "runtime":
      return (
        <Icon
          name="Loading"
          aria-label={ariaLabel}
          className={`${iconClass} animate-spin text-muted-foreground/50`}
        />
      );
    case "workflow":
      return <ActiveIcon name="Workflow" label={ariaLabel} />;
    case "background-agent":
      return <ActiveIcon name="UserRoundPlus" label={ariaLabel} />;
    case "background-command":
      return <ActiveIcon name="Terminal" label={ariaLabel} />;
    case "plan-mode":
      return <ActiveIcon name="ListTodo" label={ariaLabel} />;
    case "goal":
      return <ActiveIcon name="Target" label={ariaLabel} />;
    case "draft":
      return (
        <Icon
          name="Edit"
          aria-label={ariaLabel}
          className={`${iconClass} text-muted-foreground`}
        />
      );
    case "working-draft":
      return (
        <Icon
          name="Edit"
          aria-label={ariaLabel}
          className={`${iconClass} animate-shine-icon text-muted-foreground/50`}
        />
      );
    case "unread-success":
      return (
        <span
          aria-label={ariaLabel}
          className="flex size-4 shrink-0 items-center justify-center"
        >
          <span className="size-[5px] rounded-full bg-muted-foreground/60" />
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
}: {
  name: "Workflow" | "UserRoundPlus" | "Terminal" | "ListTodo" | "Target";
  label: string | undefined;
}) {
  return (
    <Icon
      name={name}
      aria-label={label}
      className="size-4 shrink-0 animate-shine-icon text-muted-foreground/50"
    />
  );
}

// bb gives plugins each computed indicator and label, but not the aggregate
// precedence. This is bb's per-thread precedence with unread-success omitted.
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
): PluginSidebarThread | null {
  for (const indicator of INDICATOR_PRIORITY) {
    const thread = threads.find((candidate) => candidate.indicator === indicator);
    if (thread) return thread;
  }
  return null;
}
