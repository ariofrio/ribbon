import { useState, type ReactNode } from "react";
import { Button } from "./vendor/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./vendor/components/ui/dropdown-menu";
import { CompactViewportOverrideProvider } from "./vendor/components/ui/hooks/use-compact-viewport";
import { Icon } from "./vendor/components/ui/icon";

export type HeaderGroupActions = {
  kind: "section";
  onRemove(): void;
  onRename(): void;
};

export function GroupHeaderMenu({
  actions,
  label,
  trailing,
}: {
  actions: HeaderGroupActions | null;
  label: string;
  trailing?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  if (!actions)
    return trailing ? <span className="mr-2">{trailing}</span> : null;
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
              <Button
                variant="ghost"
                size="icon"
                aria-label={`${label} options`}
                className="relative m-1 size-5 shrink-0 p-0 text-subtle-foreground ring-sidebar-ring focus-visible:bg-state-hover focus-visible:ring-2"
                type="button"
              >
                <Icon aria-hidden className="size-4" name="MoreHorizontal" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={actions.onRename}>
                <Icon name="Edit" className="size-4" aria-hidden />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={actions.onRemove}
                variant="destructive"
              >
                <Icon name="Trash2" className="size-4" aria-hidden />
                Remove
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </CompactViewportOverrideProvider>
      </span>
    </span>
  );
}
