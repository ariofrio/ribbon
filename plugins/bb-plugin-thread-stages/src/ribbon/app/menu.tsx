import {
  ContextMenuItem,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/ui/icon";
import { TouchInteraction01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useRef, useState } from "react";
import type { SidebarThread } from "../../app/model/sidebar-thread.js";
import type { ActionMenuSurface } from "../../app/ui/action-menu-items.js";
import { STAGE_ICONS } from "../workflow/catalog";
import { WORKFLOW_STAGES, WORKFLOW_STAGE_LABELS } from "../workflow/workflow-stage";
import { useRibbonData } from "./data";
import { ProviderIcon } from "./provider-icon";
import { ThreadActionsEditor } from "./ThreadActionsEditor";

/**
 * A child's stage is its own, so this applies to every live thread.
 */
export function RibbonThreadStageMenu({
  thread,
  surface,
  drawer = false,
  drawerStep = false,
  onBack,
  onOpenDrawerStep,
}: {
  thread: SidebarThread;
  surface: ActionMenuSurface;
  drawer?: boolean;
  drawerStep?: boolean;
  onBack?: () => void;
  onOpenDrawerStep?: () => void;
}) {
  const ribbon = useRibbonData();
  if (ribbon === null || thread.archivedAt !== null) return null;
  const current = ribbon.stageOf(thread.id);
  // Laid out like bb's own choices, in the Organize menu: the glyph, the
  // label, and a check at the far end where the row is the one in effect.
  const Item = surface === "context" ? ContextMenuItem : DropdownMenuItem;
  const items = WORKFLOW_STAGES.map((stage) => (
    <Item
      key={stage}
      role="menuitemradio"
      aria-checked={stage === current}
      onSelect={() => {
        if (stage !== current) void ribbon.setStage(thread.id, stage);
      }}
    >
      {/* The label names the choice; the glyph beside it is decoration. */}
      <span aria-hidden className="contents">
        <ProviderIcon icon={STAGE_ICONS[stage]} label="" />
      </span>
      {WORKFLOW_STAGE_LABELS[stage]}
      <span className="ml-auto inline-flex size-4 shrink-0 items-center justify-center">
        {stage === current ? <Icon name="Check" className="size-4" aria-hidden /> : null}
      </span>
    </Item>
  ));
  const Sub = surface === "context" ? ContextMenuSub : DropdownMenuSub;
  const SubTrigger =
    surface === "context" ? ContextMenuSubTrigger : DropdownMenuSubTrigger;
  const SubContent =
    surface === "context" ? ContextMenuSubContent : DropdownMenuSubContent;
  if (drawer) {
    if (!drawerStep) {
      return (
        <DropdownMenuItem onSelect={(event) => {
          event.preventDefault();
          onOpenDrawerStep?.();
        }}>
          <ProviderIcon icon={STAGE_ICONS.Completed} label="Stage icon" />
          <span className="min-w-0 flex-1 truncate">Move to stage</span>
          <Icon name="ChevronRight" className="ml-auto" aria-hidden />
        </DropdownMenuItem>
      );
    }
    return (
      <>
        <DropdownMenuItem onSelect={(event) => {
          event.preventDefault();
          onBack?.();
        }}>
          <Icon name="ChevronLeft" aria-hidden />
          Back
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Move to stage</DropdownMenuLabel>
        {items}
      </>
    );
  }
  return (
    <Sub>
      <SubTrigger>
        <ProviderIcon icon={STAGE_ICONS.Completed} label="Stage icon" />
        Move to stage
      </SubTrigger>
      <SubContent>{items}</SubContent>
    </Sub>
  );
}

export function RibbonThreadActionsMenu({
  thread,
  surface,
  drawer = false,
  onOpenEditor,
}: {
  thread: SidebarThread;
  surface: ActionMenuSurface;
  drawer?: boolean;
  onOpenEditor?: () => void;
}) {
  const ribbon = useRibbonData();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLDivElement>(null);
  if (ribbon === null || thread.archivedAt !== null) return null;
  const icon = <HugeiconsIcon icon={TouchInteraction01Icon} className="size-4 shrink-0" aria-hidden />;
  if (drawer) {
    return (
      <DropdownMenuItem onSelect={(event) => {
        event.preventDefault();
        onOpenEditor?.();
      }}>
        {icon}
        <span className="min-w-0 flex-1 truncate">Edit thread actions</span>
        <Icon name="ChevronRight" className="ml-auto" aria-hidden />
      </DropdownMenuItem>
    );
  }
  const Sub = surface === "context" ? ContextMenuSub : DropdownMenuSub;
  const SubTrigger = surface === "context" ? ContextMenuSubTrigger : DropdownMenuSubTrigger;
  const SubContent = surface === "context" ? ContextMenuSubContent : DropdownMenuSubContent;
  const closeEditor = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  return (
    <Sub open={open} onOpenChange={setOpen}>
      <SubTrigger ref={trigger}>{icon}Edit thread actions</SubTrigger>
      <SubContent
        aria-label="Edit thread actions"
        className="max-h-[min(32rem,calc(100dvh-2rem))] w-96 max-w-[calc(100vw-2rem)] overflow-y-auto"
        onEscapeKeyDown={(event) => {
          event.preventDefault();
          closeEditor();
        }}
        onFocus={(event) => {
          if (event.target === event.currentTarget) {
            event.currentTarget.querySelector<HTMLElement>("input:not(:disabled), button:not(:disabled)")?.focus();
          }
        }}
      >
        <ThreadActionsEditor threadId={thread.id} onExit={closeEditor} />
      </SubContent>
    </Sub>
  );
}
