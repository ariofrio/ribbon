import { Icon } from "@/vendor/components/ui/icon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/vendor/components/ui/dropdown-menu";
import { useState } from "react";
import { RemoveSectionDialog, RenameSectionDialog } from "./SectionDialogs";

interface SectionBreadcrumbProps {
  sectionName: string;
  onRename(name: string): Promise<void>;
  onRemove(): Promise<void>;
  /** Asked before the menu opens, so a name renamed elsewhere is current. */
  onOpen(): void;
}

/**
 * bb's own sidebar section menu is exactly Rename and Remove — no settings
 * page to send anyone to, unlike a project — so this crumb offers the two.
 */
const sectionActions: ReadonlyArray<{
  label: "Rename" | "Remove";
  icon: "Edit" | "Trash2";
  destructive?: boolean;
}> = [
  { label: "Rename", icon: "Edit" },
  { label: "Remove", icon: "Trash2", destructive: true },
];

export function SectionBreadcrumb({
  sectionName,
  onRename,
  onRemove,
  onOpen,
}: SectionBreadcrumbProps) {
  const [renameOpen, setRenameOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);

  return (
    <>
      <DropdownMenu
        onOpenChange={(open) => {
          if (open) onOpen();
        }}
      >
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="relative z-50 -mx-2 inline-flex min-h-7 min-w-0 shrink-0 cursor-pointer items-center rounded-md px-2 text-muted-foreground transition-colors duration-150 hover:duration-0 hover:bg-state-hover hover:text-foreground data-[state=open]:bg-state-active data-[state=open]:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring [app-region:no-drag] [-webkit-app-region:no-drag]"
            aria-label={`${sectionName} actions`}
          >
            <span className="max-w-48 truncate">{sectionName}</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" mobileTitle={`${sectionName} actions`}>
          {sectionActions.map((action) => (
            <DropdownMenuItem
              key={action.label}
              variant={action.destructive ? "destructive" : "default"}
              onSelect={() =>
                action.label === "Rename"
                  ? setRenameOpen(true)
                  : setRemoveOpen(true)
              }
            >
              <Icon name={action.icon} aria-hidden="true" />
              {action.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <Icon
        name="ChevronRight"
        className="size-3.5 shrink-0 text-subtle-foreground"
        aria-hidden="true"
      />
      <RenameSectionDialog
        key={`rename-${sectionName}`}
        open={renameOpen}
        sectionName={sectionName}
        onOpenChange={setRenameOpen}
        onRename={onRename}
      />
      <RemoveSectionDialog
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        onRemove={onRemove}
      />
    </>
  );
}
