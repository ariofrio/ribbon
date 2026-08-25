import type { ReactNode } from "react";
import type {
  PluginSidebarThread,
  PluginSidebarThreadActions,
} from "@get-bb/plugin-sdk/app";
import { WORKFLOW_STAGES, type WorkflowStage } from "../workflow-stage";
import { Icon, type IconName } from "./Icon";
import { WorkflowStageIcon } from "./WorkflowStageIcon";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuPortal,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/vendor/components/ui/context-menu";
import { CompactViewportOverrideProvider } from "@/vendor/components/ui/hooks/use-compact-viewport";
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
} from "@/vendor/components/ui/dropdown-menu";

const DROPDOWN_LAYER_CLASS = "z-[70]";

export interface ThreadSectionOption {
  id: string;
  name: string;
}

interface CommonMenuProps {
  actions: PluginSidebarThreadActions;
  disabled: boolean;
  sections: readonly ThreadSectionOption[];
  onNewSection: () => void;
  onRename: () => void;
  onSetSection: (sectionId: string | null) => void;
  onSetWorkflowStage: (stage: WorkflowStage) => void;
  workflowStage: WorkflowStage | null;
  workflowStages?: readonly WorkflowStage[];
  thread: PluginSidebarThread;
  splitAvailable: boolean;
}

interface MenuSurfaceProps extends CommonMenuProps {
  children: ReactNode;
  onOpenChange: (open: boolean) => void;
}

export function ThreadActionsContextMenu({
  children,
  onOpenChange,
  ...props
}: MenuSurfaceProps) {
  return (
    <ContextMenu onOpenChange={onOpenChange}>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent aria-label="Thread actions">
        <ContextMenuItems {...props} />
      </ContextMenuContent>
    </ContextMenu>
  );
}

const DESTRUCTIVE_CONTEXT_ITEM_CLASS =
  "text-destructive focus:bg-destructive/15 focus:text-destructive data-[last-hovered]:bg-destructive/15 data-[last-hovered]:text-destructive";

export function ThreadActionsDropdown({
  onOpenChange,
  ...props
}: CommonMenuProps & { onOpenChange: (open: boolean) => void }) {
  return (
    <CompactViewportOverrideProvider isCompactViewport={false}>
      <DropdownMenu onOpenChange={onOpenChange}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Thread actions"
            className="relative m-1 flex h-5 w-5 cursor-pointer items-center justify-center rounded-md p-0 text-subtle-foreground outline-none ring-sidebar-ring after:absolute after:left-1/2 after:top-1/2 after:h-7 after:w-7 after:-translate-x-1/2 after:-translate-y-1/2 after:content-[''] hover:text-foreground focus-visible:ring-2 data-[state=open]:bg-state-active data-[state=open]:text-foreground"
            onClick={(event) => event.stopPropagation()}
            onDragStart={(event) => event.preventDefault()}
          >
            <Icon name="MoreHorizontal" className="size-4" aria-hidden />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className={DROPDOWN_LAYER_CLASS}>
          <DropdownMenuItems {...props} />
        </DropdownMenuContent>
      </DropdownMenu>
    </CompactViewportOverrideProvider>
  );
}

function ContextMenuItems(props: CommonMenuProps) {
  const { actions, disabled, workflowStage, thread } = props;
  return (
    <>
      {props.splitAvailable ? (
        <>
          <ContextItem
            icon="Columns2"
            onSelect={() => actions.open(thread.id, { split: true })}
          >
            Open in split
          </ContextItem>
          <ContextMenuSeparator />
        </>
      ) : null}
      <ContextItem
        icon={thread.isUnread ? "MailOpen" : "Mail"}
        onSelect={() => void actions.setRead(thread.id, thread.isUnread)}
      >
        {thread.isUnread ? "Mark read" : "Mark unread"}
      </ContextItem>
      <ContextItem
        icon={thread.isPinned ? "PinOff" : "Pin"}
        onSelect={() => void actions.setPinned(thread.id, !thread.isPinned)}
      >
        {thread.isPinned ? "Unpin" : "Pin"}
      </ContextItem>
      <ContextItem icon="Edit" onSelect={props.onRename}>
        Rename
      </ContextItem>
      <ContextMenuSeparator />
      {workflowStage === null ? null : (
        <ContextMenuSub>
          <ContextMenuSubTrigger disabled={disabled}>
            <Icon name="Progress02" aria-hidden />
            Move to stage
          </ContextMenuSubTrigger>
          <ContextMenuPortal>
            <ContextMenuSubContent>
              {(props.workflowStages ?? WORKFLOW_STAGES).map((stage) => (
                <ContextMenuItem
                  key={stage}
                  onSelect={() => {
                    if (stage !== workflowStage)
                      props.onSetWorkflowStage(stage);
                  }}
                >
                  <span className="w-4">
                    {stage === workflowStage ? (
                      <Icon name="Check" aria-hidden />
                    ) : null}
                  </span>
                  <WorkflowStageIcon stage={stage} />
                  {stage}
                </ContextMenuItem>
              ))}
            </ContextMenuSubContent>
          </ContextMenuPortal>
        </ContextMenuSub>
      )}
      <ContextMenuSub>
        <ContextMenuSubTrigger>
          <Icon name="ListView" aria-hidden />
          Move to section
        </ContextMenuSubTrigger>
        <ContextMenuPortal>
          <ContextMenuSubContent>
            {props.sections.map((section) => (
              <ContextMenuItem
                key={section.id}
                onSelect={() => {
                  if (section.id !== thread.sectionId) {
                    props.onSetSection(section.id);
                  }
                }}
              >
                <span className="w-4">
                  {section.id === thread.sectionId ? (
                    <Icon name="Check" aria-hidden />
                  ) : null}
                </span>
                <SectionMenuIcon id={section.id} />
                {section.name}
              </ContextMenuItem>
            ))}
            <ContextMenuItem
              onSelect={() => {
                if (thread.sectionId !== null) props.onSetSection(null);
              }}
            >
              <span className="w-4">
                {thread.sectionId === null ? (
                  <Icon name="Check" aria-hidden />
                ) : null}
              </span>
              <Icon name="ListViewOff" aria-hidden />
              Unorganized
            </ContextMenuItem>
            <ContextMenuItem inset onSelect={props.onNewSection}>
              <Icon name="SectionAdd" aria-hidden />
              New section
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuPortal>
      </ContextMenuSub>
      <ContextMenuSeparator />
      <ContextItem icon="Archive" onSelect={() => actions.archive(thread.id)}>
        Archive
      </ContextItem>
      <ContextItem
        destructive
        icon="Trash"
        onSelect={() => actions.requestDelete(thread.id)}
      >
        Delete
      </ContextItem>
    </>
  );
}

function DropdownMenuItems(props: CommonMenuProps) {
  const { actions, disabled, workflowStage, thread } = props;
  return (
    <>
      {props.splitAvailable ? (
        <>
          <DropdownItem
            icon="Columns2"
            onSelect={() => actions.open(thread.id, { split: true })}
          >
            Open in split
          </DropdownItem>
          <DropdownMenuSeparator />
        </>
      ) : null}
      <DropdownItem
        icon={thread.isUnread ? "MailOpen" : "Mail"}
        onSelect={() => void actions.setRead(thread.id, thread.isUnread)}
      >
        {thread.isUnread ? "Mark read" : "Mark unread"}
      </DropdownItem>
      <DropdownItem
        icon={thread.isPinned ? "PinOff" : "Pin"}
        onSelect={() => void actions.setPinned(thread.id, !thread.isPinned)}
      >
        {thread.isPinned ? "Unpin" : "Pin"}
      </DropdownItem>
      <DropdownItem icon="Edit" onSelect={props.onRename}>
        Rename
      </DropdownItem>
      <DropdownMenuSeparator />
      {workflowStage === null ? null : (
        <DropdownMenuSub>
          <DropdownMenuSubTrigger disabled={disabled}>
            <Icon name="Progress02" aria-hidden />
            Move to stage
          </DropdownMenuSubTrigger>
          <DropdownMenuPortal>
            <DropdownMenuSubContent className={DROPDOWN_LAYER_CLASS}>
              {(props.workflowStages ?? WORKFLOW_STAGES).map((stage) => (
                <DropdownMenuItem
                  key={stage}
                  onSelect={() => {
                    if (stage !== workflowStage)
                      props.onSetWorkflowStage(stage);
                  }}
                >
                  <span className="w-4">
                    {stage === workflowStage ? (
                      <Icon name="Check" aria-hidden />
                    ) : null}
                  </span>
                  <WorkflowStageIcon stage={stage} />
                  {stage}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuPortal>
        </DropdownMenuSub>
      )}
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <Icon name="ListView" aria-hidden />
          Move to section
        </DropdownMenuSubTrigger>
        <DropdownMenuPortal>
          <DropdownMenuSubContent className={DROPDOWN_LAYER_CLASS}>
            {props.sections.map((section) => (
              <DropdownMenuItem
                key={section.id}
                onSelect={() => {
                  if (section.id !== thread.sectionId) {
                    props.onSetSection(section.id);
                  }
                }}
              >
                <span className="w-4">
                  {section.id === thread.sectionId ? (
                    <Icon name="Check" aria-hidden />
                  ) : null}
                </span>
                <SectionMenuIcon id={section.id} />
                {section.name}
              </DropdownMenuItem>
            ))}
            <DropdownMenuItem
              onSelect={() => {
                if (thread.sectionId !== null) props.onSetSection(null);
              }}
            >
              <span className="w-4">
                {thread.sectionId === null ? (
                  <Icon name="Check" aria-hidden />
                ) : null}
              </span>
              <Icon name="ListViewOff" aria-hidden />
              Unorganized
            </DropdownMenuItem>
            <DropdownMenuItem inset onSelect={props.onNewSection}>
              <Icon name="SectionAdd" aria-hidden />
              New section
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuPortal>
      </DropdownMenuSub>
      <DropdownMenuSeparator />
      <DropdownItem icon="Archive" onSelect={() => actions.archive(thread.id)}>
        Archive
      </DropdownItem>
      <DropdownItem
        destructive
        icon="Trash"
        onSelect={() => actions.requestDelete(thread.id)}
      >
        Delete
      </DropdownItem>
    </>
  );
}

/** Empty by design: the box names its section, and icon-styles.ts paints it. */
function SectionMenuIcon({ id }: { id: string }) {
  return (
    <span aria-hidden data-ribbon-icons-section={id} data-thread-stages-icon="section" />
  );
}

function ContextItem({
  children,
  destructive = false,
  disabled,
  icon,
  onSelect,
}: {
  children: ReactNode;
  destructive?: boolean;
  disabled?: boolean;
  icon: IconName;
  onSelect: () => void;
}) {
  return (
    <ContextMenuItem
      disabled={disabled}
      className={destructive ? DESTRUCTIVE_CONTEXT_ITEM_CLASS : undefined}
      onSelect={onSelect}
    >
      <Icon name={icon} aria-hidden />
      {children}
    </ContextMenuItem>
  );
}

function DropdownItem({
  children,
  destructive = false,
  disabled,
  icon,
  onSelect,
}: {
  children: ReactNode;
  destructive?: boolean;
  disabled?: boolean;
  icon: IconName;
  onSelect: () => void;
}) {
  return (
    <DropdownMenuItem
      disabled={disabled}
      variant={destructive ? "destructive" : "default"}
      onSelect={onSelect}
    >
      <Icon name={icon} aria-hidden />
      {children}
    </DropdownMenuItem>
  );
}
