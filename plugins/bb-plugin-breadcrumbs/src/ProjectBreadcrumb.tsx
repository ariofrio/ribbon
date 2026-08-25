import { Icon } from "@/vendor/components/ui/icon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/vendor/components/ui/dropdown-menu";
import { useState } from "react";
import { RemoveProjectDialog, RenameProjectDialog } from "./ProjectDialogs";

type ProjectAction = "Project settings" | "Rename" | "Remove";

interface ProjectBreadcrumbProps {
  projectName: string;
  onOpenSettings(): void;
  onRename(name: string): Promise<void>;
  onRemove(): Promise<void>;
}

const projectActions: ReadonlyArray<{
  label: ProjectAction;
  icon: "Settings" | "Edit" | "Trash2";
  destructive?: boolean;
}> = [
  { label: "Project settings", icon: "Settings" },
  { label: "Rename", icon: "Edit" },
  { label: "Remove", icon: "Trash2", destructive: true },
];

export function ProjectBreadcrumb({
  projectName,
  onOpenSettings,
  onRename,
  onRemove,
}: ProjectBreadcrumbProps) {
  const [renameOpen, setRenameOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const runAction = (action: ProjectAction) => {
    if (action === "Project settings") {
      onOpenSettings();
    } else if (action === "Rename") {
      setRenameOpen(true);
    } else {
      setRemoveOpen(true);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="relative z-50 -mx-2 inline-flex min-h-7 min-w-0 shrink-0 cursor-pointer items-center rounded-md px-2 text-muted-foreground transition-colors duration-150 hover:duration-0 hover:bg-state-hover hover:text-foreground data-[state=open]:bg-state-active data-[state=open]:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring [app-region:no-drag] [-webkit-app-region:no-drag]"
            aria-label={`${projectName} actions`}
          >
            <span className="max-w-48 truncate">{projectName}</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" mobileTitle={`${projectName} actions`}>
          {projectActions.map((action, index) => (
            <span key={action.label}>
              {index === 1 ? <DropdownMenuSeparator /> : null}
              <DropdownMenuItem
                variant={action.destructive ? "destructive" : "default"}
                onSelect={() => runAction(action.label)}
              >
                <Icon name={action.icon} aria-hidden="true" />
                {action.label}
              </DropdownMenuItem>
            </span>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <Icon
        name="ChevronRight"
        className="size-3.5 shrink-0 text-subtle-foreground"
        aria-hidden="true"
      />
      <RenameProjectDialog
        key={`rename-${projectName}`}
        open={renameOpen}
        projectName={projectName}
        onOpenChange={setRenameOpen}
        onRename={onRename}
      />
      <RemoveProjectDialog
        open={removeOpen}
        projectName={projectName}
        onOpenChange={setRemoveOpen}
        onRemove={onRemove}
      />
    </>
  );
}
