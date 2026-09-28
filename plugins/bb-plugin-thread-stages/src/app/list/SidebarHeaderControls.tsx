import { createContext, useContext, useState, type ReactNode } from "react";
import type { SidebarSectionId } from "../model/sidebar-section-id.js";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { COARSE_POINTER_ICON_SIZE_CLASS } from "@/components/ui/coarse-pointer-sizing";
import { useIsCompactViewport } from "@/components/ui/hooks/use-compact-viewport";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarControlButton,
  SidebarRowControls,
} from "../rows/SidebarRowControls.js";
import { SIDEBAR_CONTROL_BUTTON_CLASS } from "../rows/sidebarRowClasses.js";
import { cn } from "@/lib/utils";
import { useRibbonData } from "../../ribbon/app/data.js";
import { HEADING_ACTION_CLASS } from "../../ribbon/app/heading.js";

/** Ribbon's heading buttons: a 20px glyph box in a 28px hit area, inked like the heading. */
export const RIBBON_HEADING_BUTTON_CLASS = `relative m-1 size-5 shrink-0 cursor-pointer rounded-md p-0 outline-none ring-sidebar-ring focus-visible:ring-2 ${HEADING_ACTION_CLASS}`;
import { ThreadListVisibilityMenuItems } from "./ThreadListVisibility.js";
import { SidebarHeaderMenuContents } from "./SidebarViewItems.js";

export interface HeaderCreationActions {
  onNewSection?: (anchorSectionId?: SidebarSectionId) => void;
  isCreatingSection?: boolean;
}

const HeaderCreationContext = createContext<HeaderCreationActions>({});
export const SidebarHeaderActionsProvider = HeaderCreationContext.Provider;

export function SidebarHeaderControls({
  label,
  sectionId,
  onNewThread,
  showNewThread = true,
  children,
  open,
  onOpenChange,
  onCloseAutoFocus,
}: {
  label: string;
  sectionId?: SidebarSectionId;
  onNewThread?: () => void;
  showNewThread?: boolean;
  children?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onCloseAutoFocus?: (event: Event) => void;
}) {
  const creation = useContext(HeaderCreationContext);
  const compact = useIsCompactViewport();
  const ribbon = useRibbonData() !== null;
  const [page, setPage] = useState<"organize" | "sort" | "filter" | null>(null);
  const changeOpen = (next: boolean) => {
    if (!next) setPage(null);
    onOpenChange?.(next);
  };
  return (
    <SidebarRowControls
      primaryAction={
        showNewThread ? (
          <SidebarControlButton
            label={`New thread in ${label}`}
            icon="MessageSquarePlus"
            onClick={() => onNewThread?.()}
            disabled={!onNewThread}
            className={ribbon ? RIBBON_HEADING_BUTTON_CLASS : undefined}
          />
        ) : null
      }
    >
      <DropdownMenu open={open} onOpenChange={changeOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`${label} actions`}
            data-sidebar-rename-anchor=""
            className={cn(ribbon ? RIBBON_HEADING_BUTTON_CLASS : SIDEBAR_CONTROL_BUTTON_CLASS)}
          >
            <Icon
              name="MoreHorizontal"
              className={COARSE_POINTER_ICON_SIZE_CLASS}
            />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          onCloseAutoFocus={onCloseAutoFocus}
          mobileTitle={
            page === "organize"
              ? "Organize"
              : page === "sort"
                ? "Sort by"
                : page === "filter"
                  ? "Filter"
                  : `${label} actions`
          }
        >
          <SidebarHeaderMenuContents
            creation={creation}
            anchorSectionId={sectionId}
            compact={compact}
            page={page}
            onPageChange={setPage}
          >
            {children}
          </SidebarHeaderMenuContents>
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarRowControls>
  );
}

export function SidebarSectionMenuItems({
  onRename,
  onRemove,
  onChangeIcon,
}: {
  onRename?: () => void;
  onRemove?: () => void;
  onChangeIcon?: () => void;
}) {
  return (
    <>
      {onRename && (
        <DropdownMenuItem onSelect={onRename}>
          <Icon name="Edit" />
          Rename
        </DropdownMenuItem>
      )}
      {onChangeIcon && (
        <DropdownMenuItem onSelect={onChangeIcon}>
          <Icon name="Palette" />
          Change icon
        </DropdownMenuItem>
      )}
      <ThreadListVisibilityMenuItems />
      {onRemove && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={onRemove}>
            <Icon name="Trash2" />
            Remove
          </DropdownMenuItem>
        </>
      )}
    </>
  );
}
