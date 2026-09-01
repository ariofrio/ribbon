import { useState } from "react";
import type { IconDataV1 } from "./contracts";
import type { GroupingKey } from "./placement-store";
import { ProviderIcon } from "./provider-icon";
import type {
  HiddenThreadKinds,
  SidebarSort,
} from "./view-state";
import { CHROME_SECTION_LABEL_CLASS } from "./chrome-style-tokens";
import { Button } from "./vendor/components/ui/button";
import {
  COARSE_POINTER_ICON_SIZE_CLASS,
  COARSE_POINTER_ROW_ACTION_SIZE_CLASS,
} from "./vendor/components/ui/coarse-pointer-sizing";
import { Icon } from "./vendor/components/ui/icon";
import { CompactViewportOverrideProvider } from "./vendor/components/ui/hooks/use-compact-viewport";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "./vendor/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./vendor/components/ui/tooltip";

interface DisplayGrouping {
  groupingKey: string;
  singularLabel: string;
  pluralLabel: string;
  icon?: IconDataV1;
}

interface SidebarDisplayOptionsMenuProps {
  groupings: readonly DisplayGrouping[];
  headingsGroupingKey: GroupingKey | null;
  hide: HiddenThreadKinds;
  onHeadingsGroupingChange(groupingKey: GroupingKey | null): void;
  onHideChange(kind: keyof HiddenThreadKinds, hidden: boolean): void;
  onPagesGroupingChange(groupingKey: GroupingKey): void;
  onSortChange(sort: SidebarSort): void;
  pagesGroupingKey: GroupingKey;
  sort: SidebarSort;
}

const SORT_OPTIONS: readonly { value: SidebarSort; label: string }[] = [
  { value: "updated", label: "Last updated" },
  { value: "created", label: "Last created" },
  { value: "alphabetical", label: "Alphabetically" },
  { value: "manual", label: "Manually" },
];

function GroupingIcon({ grouping }: { grouping: DisplayGrouping }) {
  if (grouping.groupingKey === "builtin:sections") {
    return <Icon aria-hidden className="size-4 shrink-0" name="ListView" />;
  }
  if (grouping.groupingKey === "builtin:projects") {
    return <Icon aria-hidden className="size-4 shrink-0" name="Folder" />;
  }
  return grouping.icon ? (
    <span
      aria-hidden
      className="inline-flex size-4 shrink-0 items-center justify-center"
    >
      <ProviderIcon
        icon={grouping.icon}
        label={`${grouping.singularLabel} icon`}
      />
    </span>
  ) : (
    <Icon aria-hidden className="size-4 shrink-0" name="Workflow" />
  );
}

function MenuValueRow({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex flex-1 items-center justify-between gap-4">
      <span>{label}</span>
      <span className="whitespace-nowrap text-muted-foreground">{value}</span>
    </span>
  );
}

function groupingMenuItems(
  groupings: readonly DisplayGrouping[],
  selected: GroupingKey | null,
  onChange: (groupingKey: GroupingKey | null) => void,
  includeNone: boolean,
) {
  return (
    <>
      {includeNone ? (
        <DropdownMenuCheckboxItem
          checked={selected === null}
          onCheckedChange={() => onChange(null)}
        >
          No headings
        </DropdownMenuCheckboxItem>
      ) : null}
      {includeNone ? <DropdownMenuSeparator /> : null}
      {groupings.map((grouping) => (
        <DropdownMenuCheckboxItem
          checked={selected === grouping.groupingKey}
          key={grouping.groupingKey}
          onCheckedChange={() => onChange(grouping.groupingKey as GroupingKey)}
        >
          <span className="flex items-center gap-2">
            <GroupingIcon grouping={grouping} />
            <span>{grouping.pluralLabel}</span>
          </span>
        </DropdownMenuCheckboxItem>
      ))}
    </>
  );
}

export function SidebarDisplayOptionsMenu({
  groupings,
  headingsGroupingKey,
  hide,
  onHeadingsGroupingChange,
  onHideChange,
  onPagesGroupingChange,
  onSortChange,
  pagesGroupingKey,
  sort,
}: SidebarDisplayOptionsMenuProps) {
  const [open, setOpen] = useState(false);
  const pagesGrouping = groupings.find(
    ({ groupingKey }) => groupingKey === pagesGroupingKey,
  );
  const headingsGrouping = groupings.find(
    ({ groupingKey }) => groupingKey === headingsGroupingKey,
  );
  const hiddenLabels = [
    hide.hidden ? "Hidden" : null,
    hide.archived ? "Archived" : null,
    hide.visible ? "Visible" : null,
    hide.notArchived ? "Not archived" : null,
  ].filter((label): label is string => label !== null);

  return (
    <CompactViewportOverrideProvider isCompactViewport={false}>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <TooltipProvider>
          <Tooltip delayDuration={350} disableHoverableContent>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button
                  aria-label="Sidebar display options"
                  className={`bb-sidebar-hover-actions shrink-0 cursor-pointer rounded-md p-0 text-sidebar-foreground/85 outline-none ring-sidebar-ring transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-foreground ${COARSE_POINTER_ROW_ACTION_SIZE_CLASS}`}
                  data-sidebar-hover-actions-mobile="always"
                  data-sidebar-hover-actions-open={open ? "true" : undefined}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <Icon
                    aria-hidden
                    className={COARSE_POINTER_ICON_SIZE_CLASS}
                    name="SlidersHorizontal"
                  />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="px-2 py-1">
              Display options
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <DropdownMenuContent align="end" mobileTitle="Display options">
          <DropdownMenuLabel className={CHROME_SECTION_LABEL_CLASS}>
            Organize
          </DropdownMenuLabel>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger aria-label={`Pages ${pagesGrouping?.pluralLabel ?? "Sections"}`}>
              <MenuValueRow
                label="Pages"
                value={pagesGrouping?.pluralLabel ?? "Sections"}
              />
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent>
                {groupingMenuItems(
                  groupings,
                  pagesGroupingKey,
                  (groupingKey) => {
                    if (groupingKey !== null) onPagesGroupingChange(groupingKey);
                  },
                  false,
                )}
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger aria-label={`Headings ${headingsGrouping?.pluralLabel ?? "None"}`}>
              <MenuValueRow
                label="Headings"
                value={headingsGrouping?.pluralLabel ?? "None"}
              />
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent>
                {groupingMenuItems(
                  groupings,
                  headingsGroupingKey,
                  onHeadingsGroupingChange,
                  true,
                )}
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          <DropdownMenuSub>
            <DropdownMenuSubTrigger aria-label={`Hide ${hiddenLabels.length > 0 ? hiddenLabels.join(", ") : "Nothing"}`}>
              <MenuValueRow
                label="Hide"
                value={hiddenLabels.length > 0 ? hiddenLabels.join(", ") : "Nothing"}
              />
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent>
                <DropdownMenuCheckboxItem
                  checked={hide.notArchived}
                  onCheckedChange={(checked) =>
                    onHideChange("notArchived", checked === true)
                  }
                >
                  Not archived
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={hide.archived}
                  onCheckedChange={(checked) =>
                    onHideChange("archived", checked === true)
                  }
                >
                  Archived
                </DropdownMenuCheckboxItem>
                <DropdownMenuSeparator />
                <DropdownMenuCheckboxItem
                  checked={hide.visible}
                  onCheckedChange={(checked) =>
                    onHideChange("visible", checked === true)
                  }
                >
                  Visible
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={hide.hidden}
                  onCheckedChange={(checked) =>
                    onHideChange("hidden", checked === true)
                  }
                >
                  Hidden
                </DropdownMenuCheckboxItem>
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger aria-label={`Sort ${SORT_OPTIONS.find(({ value }) => value === sort)?.label ?? "Last updated"}`}>
              <MenuValueRow
                label="Sort"
                value={SORT_OPTIONS.find(({ value }) => value === sort)?.label ?? "Last updated"}
              />
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent>
                {SORT_OPTIONS.map((option) => (
                  <DropdownMenuCheckboxItem
                    checked={sort === option.value}
                    key={option.value}
                    onCheckedChange={() => onSortChange(option.value)}
                  >
                    {option.label}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>
    </CompactViewportOverrideProvider>
  );
}
