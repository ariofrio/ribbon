import { useState } from "react";
import { Button } from "./vendor/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "./vendor/components/ui/dropdown-menu";
import { CompactViewportOverrideProvider } from "./vendor/components/ui/hooks/use-compact-viewport";
import { Icon } from "./vendor/components/ui/icon";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./vendor/components/ui/tooltip";
import type {
  HiddenThreadKinds,
  PullRequestNumberPosition,
} from "./view-state";

interface SidebarDisplayOptionsMenuProps {
  hide: HiddenThreadKinds;
  onHideChange(kind: keyof HiddenThreadKinds, hidden: boolean): void;
  onPullRequestNumberPositionChange(position: PullRequestNumberPosition): void;
  pullRequestNumberPosition: PullRequestNumberPosition;
}

const PR_NUMBER_OPTIONS: readonly {
  value: PullRequestNumberPosition;
  label: string;
}[] = [
  { value: "left", label: "Left" },
  { value: "right", label: "Right" },
  { value: "hidden", label: "Hidden" },
];

function MenuValueRow({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex flex-1 items-center justify-between gap-4">
      <span>{label}</span>
      <span className="whitespace-nowrap text-muted-foreground">{value}</span>
    </span>
  );
}

export function SidebarDisplayOptionsMenu({
  hide,
  onHideChange,
  onPullRequestNumberPositionChange,
  pullRequestNumberPosition,
}: SidebarDisplayOptionsMenuProps) {
  const [open, setOpen] = useState(false);
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
                  className="bb-sidebar-hover-actions m-1 size-5 shrink-0 p-0 text-subtle-foreground ring-sidebar-ring focus-visible:bg-state-hover focus-visible:ring-2"
                  data-sidebar-hover-actions-mobile="always"
                  data-sidebar-hover-actions-open={open ? "true" : undefined}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <Icon
                    aria-hidden
                    className="size-4"
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
          <DropdownMenuSub>
            <DropdownMenuSubTrigger
              aria-label={`PR number ${PR_NUMBER_OPTIONS.find(({ value }) => value === pullRequestNumberPosition)?.label}`}
            >
              <MenuValueRow
                label="PR number"
                value={
                  PR_NUMBER_OPTIONS.find(
                    ({ value }) => value === pullRequestNumberPosition,
                  )?.label ?? "Right"
                }
              />
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent>
                {PR_NUMBER_OPTIONS.map((option) => (
                  <DropdownMenuCheckboxItem
                    checked={pullRequestNumberPosition === option.value}
                    key={option.value}
                    onCheckedChange={() =>
                      onPullRequestNumberPositionChange(option.value)
                    }
                  >
                    {option.label}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger
              aria-label={`Hide ${hiddenLabels.length > 0 ? hiddenLabels.join(", ") : "Nothing"}`}
            >
              <MenuValueRow
                label="Hide"
                value={
                  hiddenLabels.length > 0 ? hiddenLabels.join(", ") : "Nothing"
                }
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
        </DropdownMenuContent>
      </DropdownMenu>
    </CompactViewportOverrideProvider>
  );
}
