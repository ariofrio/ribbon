import { Icon } from "./Icon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/vendor/components/ui/dropdown-menu";

const TRIGGER_CLASS =
  "inline-flex shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground outline-none ring-sidebar-ring transition-colors focus-visible:ring-2 data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-foreground";
const PANEL_OPTIONS_TRIGGER_CLASS =
  "relative m-1 h-5 w-5 p-0 hover:bg-state-hover hover:text-foreground after:absolute after:left-1/2 after:top-1/2 after:h-7 after:w-7 after:-translate-x-1/2 after:-translate-y-1/2 after:content-[''] max-md:pointer-coarse:m-0 max-md:pointer-coarse:h-9 max-md:pointer-coarse:w-9 max-md:pointer-coarse:after:hidden";

interface ThreadFilterOptionsMenuProps {
  onHide: () => void;
  onOpenChange?: (open: boolean) => void;
}

export function ThreadFilterOptionsMenu({
  onHide,
  onOpenChange,
}: ThreadFilterOptionsMenuProps) {
  return (
    <DropdownMenu onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Sections and projects options"
          className={`${TRIGGER_CLASS} ${PANEL_OPTIONS_TRIGGER_CLASS}`}
        >
          <Icon
            name="MoreHorizontal"
            className="size-4 max-md:pointer-coarse:size-5"
            aria-hidden
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        <DropdownMenuItem onSelect={onHide}>
          <Icon name="EyeOff" className="size-4 shrink-0" aria-hidden />
          Hide from sidebar
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
