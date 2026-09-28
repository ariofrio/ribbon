import {
  ContextMenuItem,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/ui/icon";
import type { SidebarThread } from "../../app/model/sidebar-thread.js";
import {
  ActionMenuItem,
  ActionMenuSeparator,
  type ActionMenuSurface,
} from "../../app/ui/action-menu-items.js";
import { STAGE_ICONS } from "../workflow/catalog";
import { WORKFLOW_STAGES } from "../workflow/workflow-stage";
import { useRibbonData } from "./data";
import { ProviderIcon } from "./provider-icon";

/**
 * The items Ribbon adds to a thread's menu: its stage, and the prompt
 * actions editor. A child has a stage of its own, so both apply to every
 * live thread; an archived one has neither.
 */
export function RibbonThreadMenuItems({
  thread,
  surface,
  drawer = false,
}: {
  thread: SidebarThread;
  surface: ActionMenuSurface;
  /** A compact-viewport drawer lists the stages flat rather than in a submenu. */
  drawer?: boolean;
}) {
  const ribbon = useRibbonData();
  if (ribbon === null || thread.archivedAt !== null) return null;
  const current = ribbon.stageOf(thread.id);
  const items = WORKFLOW_STAGES.map((stage) => {
    const Item = surface === "context" ? ContextMenuItem : DropdownMenuItem;
    return (
      <Item
        key={stage}
        aria-current={stage === current ? "true" : undefined}
        onSelect={() => {
          if (stage !== current) void ribbon.setStage(thread.id, stage);
        }}
      >
        <span className="w-4">
          {stage === current ? <Icon name="Check" aria-hidden /> : null}
        </span>
        <ProviderIcon icon={STAGE_ICONS[stage]} label={`${stage} icon`} />
        {stage}
      </Item>
    );
  });
  const Sub = surface === "context" ? ContextMenuSub : DropdownMenuSub;
  const SubTrigger =
    surface === "context" ? ContextMenuSubTrigger : DropdownMenuSubTrigger;
  const SubContent =
    surface === "context" ? ContextMenuSubContent : DropdownMenuSubContent;
  return (
    <>
      <ActionMenuItem
        surface={surface}
        icon="Edit"
        onSelect={() => ribbon.editActions(thread.id)}
      >
        Edit actions
      </ActionMenuItem>
      {drawer ? (
        <>
          <ActionMenuSeparator surface={surface} />
          <DropdownMenuLabel>Move to stage</DropdownMenuLabel>
          {items}
        </>
      ) : (
        <Sub>
          <SubTrigger>
            <ProviderIcon icon={STAGE_ICONS.Completed} label="Stage icon" />
            Move to stage
          </SubTrigger>
          <SubContent>{items}</SubContent>
        </Sub>
      )}
    </>
  );
}
