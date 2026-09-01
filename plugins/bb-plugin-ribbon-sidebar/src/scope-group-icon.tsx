import type { IconDataV1 } from "./contracts";
import { ProviderIcon } from "./provider-icon";
import { UnorganizedIcon } from "./unorganized-icon";
import { Icon } from "./vendor/components/ui/icon";

interface ScopeGroupIconProps {
  group: {
    id: string;
    label: string;
    icon?: IconDataV1;
  };
  groupingKey: string;
  projects: readonly {
    id: string;
    isPersonal?: boolean;
  }[];
}

export function ScopeGroupIcon({
  group,
  groupingKey,
  projects,
}: ScopeGroupIconProps) {
  if (groupingKey === "builtin:projects") {
    const project = projects.find(({ id }) => id === group.id);
    return (
      <span
        aria-hidden
        data-ribbon-icons-project={group.id}
        data-ribbon-sidebar-icon={project?.isPersonal ? "personal" : "project"}
      />
    );
  }
  if (groupingKey === "builtin:sections") {
    return group.id === "unsectioned" ? (
      <UnorganizedIcon />
    ) : (
      <span
        aria-hidden
        data-ribbon-icons-section={group.id}
        data-ribbon-sidebar-icon="section"
      />
    );
  }
  return group.icon ? (
    <ProviderIcon icon={group.icon} label={`${group.label} icon`} />
  ) : (
    <Icon aria-hidden className="size-4 shrink-0" name="Workflow" />
  );
}
