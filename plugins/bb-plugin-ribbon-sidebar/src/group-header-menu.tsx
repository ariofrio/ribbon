import { ListTreeIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState, type ReactNode } from "react";
import type { IconDataV1 } from "./contracts";
import { ProviderIcon } from "./provider-icon";
import {
  ProjectGroupActionItems,
  SectionGroupActionItems,
} from "./scope-filter";
import { Icon } from "./vendor/components/ui/icon";
import { CompactViewportOverrideProvider } from "./vendor/components/ui/hooks/use-compact-viewport";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "./vendor/components/ui/dropdown-menu";

interface HeaderGrouping {
  groupingKey: string;
  pluralLabel: string;
  icon?: IconDataV1;
}

export type HeaderGroupActions =
  | {
      kind: "section";
      onRemove(): void;
      onRename(): void;
    }
  | {
      kind: "project";
      canAddLocalPath: boolean;
      onAddLocalPath(): void;
      onOpenSettings(): void;
      onRemove(): void;
      onRename(): void;
    };

function GroupingIcon({ grouping }: { grouping: HeaderGrouping }) {
  if (grouping.groupingKey === "builtin:sections") {
    return <Icon aria-hidden className="size-4 shrink-0" name="ListView" />;
  }
  if (grouping.groupingKey === "builtin:projects") {
    return <Icon aria-hidden className="size-4 shrink-0" name="Folder" />;
  }
  return grouping.icon ? (
    <span
      aria-hidden
      className="inline-flex size-4 shrink-0 items-center justify-center leading-none"
    >
      <ProviderIcon
        icon={grouping.icon}
        label={`${grouping.pluralLabel} icon`}
      />
    </span>
  ) : (
    <Icon aria-hidden className="size-4 shrink-0" name="Workflow" />
  );
}

export function GroupHeaderMenu({
  actions,
  activeGroupingKey,
  groupings,
  label,
  onGroupingChange,
  trailing,
}: {
  actions: HeaderGroupActions | null;
  activeGroupingKey: string | null;
  groupings: readonly HeaderGrouping[];
  label: string;
  onGroupingChange(groupingKey: string | null): void;
  trailing?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative flex w-7 shrink-0 self-stretch items-center justify-end max-md:pointer-coarse:w-9">
      <span
        className="bb-sidebar-hover-actions-fade absolute inset-0 flex items-center justify-center"
        data-sidebar-hover-actions-open={open ? "true" : undefined}
      >
        {trailing}
      </span>
      <span
        className="bb-sidebar-hover-actions absolute inset-0 z-30 flex items-center justify-end"
        data-sidebar-hover-actions-open={open ? "true" : undefined}
      >
        <CompactViewportOverrideProvider isCompactViewport={false}>
          <DropdownMenu onOpenChange={setOpen}>
            <DropdownMenuTrigger asChild>
              <button
                aria-label={`${label} options`}
                className="relative m-1 flex size-5 cursor-pointer items-center justify-center rounded-md p-0 text-subtle-foreground outline-none ring-sidebar-ring after:absolute after:left-1/2 after:top-1/2 after:size-7 after:-translate-x-1/2 after:-translate-y-1/2 after:content-[''] hover:text-foreground focus-visible:ring-2 data-[state=open]:bg-state-active data-[state=open]:text-foreground"
                type="button"
              >
                <Icon aria-hidden className="size-4" name="MoreHorizontal" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <HugeiconsIcon
                    aria-hidden
                    className="size-4 shrink-0"
                    icon={ListTreeIcon}
                    size={16}
                  />
                  Group by
                </DropdownMenuSubTrigger>
                <DropdownMenuPortal>
                  <DropdownMenuSubContent>
                    <DropdownMenuItem
                      aria-checked={activeGroupingKey === null}
                      className="pl-7"
                      onSelect={() => onGroupingChange(null)}
                      role="menuitemcheckbox"
                    >
                      {activeGroupingKey === null ? (
                        <span className="absolute left-2 inline-flex size-3.5 items-center justify-center">
                          <Icon
                            aria-hidden
                            className="size-3.5"
                            name="Check"
                          />
                        </span>
                      ) : null}
                      <HugeiconsIcon
                        aria-hidden
                        className="size-4 shrink-0"
                        icon={ListTreeIcon}
                        size={16}
                      />
                      No grouping
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {groupings.map((grouping) => {
                      const checked =
                        activeGroupingKey === grouping.groupingKey;
                      return (
                        <DropdownMenuItem
                          aria-checked={checked}
                          className="pl-7"
                          key={grouping.groupingKey}
                          onSelect={() => {
                            if (!checked) {
                              onGroupingChange(grouping.groupingKey);
                            }
                          }}
                          role="menuitemcheckbox"
                        >
                          {checked ? (
                            <span className="absolute left-2 inline-flex size-3.5 items-center justify-center">
                              <Icon
                                aria-hidden
                                className="size-3.5"
                                name="Check"
                              />
                            </span>
                          ) : null}
                          <GroupingIcon grouping={grouping} />
                          {grouping.pluralLabel}
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuSubContent>
                </DropdownMenuPortal>
              </DropdownMenuSub>
              {actions ? <DropdownMenuSeparator /> : null}
              {actions?.kind === "section" ? (
                <SectionGroupActionItems
                  onRemove={actions.onRemove}
                  onRename={actions.onRename}
                />
              ) : actions?.kind === "project" ? (
                <ProjectGroupActionItems
                  canAddLocalPath={actions.canAddLocalPath}
                  onAddLocalPath={actions.onAddLocalPath}
                  onOpenSettings={actions.onOpenSettings}
                  onRemove={actions.onRemove}
                  onRename={actions.onRename}
                />
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </CompactViewportOverrideProvider>
      </span>
    </span>
  );
}
