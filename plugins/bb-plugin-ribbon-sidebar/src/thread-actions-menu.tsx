import type { ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import type {
  PluginSidebarThread,
  PluginSidebarThreadActions,
} from "@get-bb/plugin-sdk/app";
import type { IconDataV1 } from "./contracts";
import type { EntityIconView } from "./icons";
import { ProviderIcon } from "./provider-icon";
import { UnorganizedIcon } from "./unorganized-icon";
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
} from "./vendor/components/ui/context-menu";
import { CompactViewportOverrideProvider } from "./vendor/components/ui/hooks/use-compact-viewport";
import {
  Icon as VendorIcon,
  type IconName,
  type IconProps,
} from "./vendor/components/ui/icon";
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
} from "./vendor/components/ui/dropdown-menu";

const MENU_LAYER_CLASS = "z-[70]";

function Icon({ className, ...props }: IconProps) {
  return (
    <VendorIcon
      {...props}
      className={`size-4 shrink-0${className ? ` ${className}` : ""}`}
    />
  );
}

export interface AssignmentGroupOption {
  id: string;
  label: string;
  icon?: IconDataV1;
  acceptsAssignments: boolean;
}

interface CommonMenuProps {
  actions: PluginSidebarThreadActions;
  assignments: readonly {
    groupingKey: string;
    currentGroupId: string;
    groups: readonly AssignmentGroupOption[];
    icon?: IconDataV1;
    singularLabel: string;
    onSetGroup(groupId: string): void;
  }[];
  disabled: boolean;
  onNewSection(): void;
  onRename(): void;
  onSetSection(sectionId: string | null): void;
  sectionIcons: ReadonlyMap<string, EntityIconView>;
  sections: readonly { id: string; label: string }[];
  splitAvailable: boolean;
  thread: PluginSidebarThread;
}

export function ThreadActionsContextMenu({
  children,
  onOpenChange,
  ...props
}: CommonMenuProps & {
  children: ReactNode;
  onOpenChange(open: boolean): void;
}) {
  return (
    <ContextMenu onOpenChange={onOpenChange}>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent aria-label="Thread actions">
        <ContextItems {...props} />
      </ContextMenuContent>
    </ContextMenu>
  );
}

export function ThreadActionsDropdown({
  onOpenChange,
  ...props
}: CommonMenuProps & { onOpenChange(open: boolean): void }) {
  return (
    <CompactViewportOverrideProvider isCompactViewport={false}>
      <DropdownMenu onOpenChange={onOpenChange}>
        <DropdownMenuTrigger asChild>
          <button
            aria-label="Thread actions"
            className="relative m-1 flex size-5 cursor-pointer items-center justify-center rounded-md p-0 text-subtle-foreground outline-none ring-sidebar-ring after:absolute after:left-1/2 after:top-1/2 after:size-7 after:-translate-x-1/2 after:-translate-y-1/2 after:content-[''] hover:text-foreground focus-visible:ring-2 data-[state=open]:bg-state-active data-[state=open]:text-foreground"
            onClick={(event) => event.stopPropagation()}
            onDragStart={(event) => event.preventDefault()}
            type="button"
          >
            <Icon name="MoreHorizontal" className="size-4" aria-hidden />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className={MENU_LAYER_CLASS}>
          <DropdownItems {...props} />
        </DropdownMenuContent>
      </DropdownMenu>
    </CompactViewportOverrideProvider>
  );
}

function ContextItems(props: CommonMenuProps) {
  const { actions, thread } = props;
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
      <ContextItem icon="Edit" onSelect={props.onRename}>Rename</ContextItem>
      <ContextMenuSeparator />
      <ContextSectionMenu {...props} />
      {props.assignments.map((assignment) => (
        <ContextAssignmentMenu
          assignment={assignment}
          disabled={props.disabled}
          key={assignment.groupingKey}
        />
      ))}
      <ContextMenuSeparator />
      <ContextItem
        icon="Archive"
        onSelect={() => void actions.archive(thread.id)}
      >
        Archive
      </ContextItem>
      <ContextItem
        destructive
        icon="Trash2"
        onSelect={() => actions.requestDelete(thread.id)}
      >
        Delete
      </ContextItem>
    </>
  );
}

function DropdownItems(props: CommonMenuProps) {
  const { actions, thread } = props;
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
      <DropdownItem icon="Edit" onSelect={props.onRename}>Rename</DropdownItem>
      <DropdownMenuSeparator />
      <DropdownSectionMenu {...props} />
      {props.assignments.map((assignment) => (
        <DropdownAssignmentMenu
          assignment={assignment}
          disabled={props.disabled}
          key={assignment.groupingKey}
        />
      ))}
      <DropdownMenuSeparator />
      <DropdownItem
        icon="Archive"
        onSelect={() => void actions.archive(thread.id)}
      >
        Archive
      </DropdownItem>
      <DropdownItem
        destructive
        icon="Trash2"
        onSelect={() => actions.requestDelete(thread.id)}
      >
        Delete
      </DropdownItem>
    </>
  );
}

function ContextAssignmentMenu({
  assignment,
  disabled,
}: {
  assignment: CommonMenuProps["assignments"][number];
  disabled: boolean;
}) {
  return (
    <ContextMenuSub>
      <ContextMenuSubTrigger disabled={disabled}>
        {assignment.icon ? (
          <ProviderIcon
            icon={assignment.icon}
            label={`${assignment.singularLabel} icon`}
          />
        ) : (
          <Icon name="Workflow" aria-hidden />
        )}
        Move to {assignment.singularLabel.toLocaleLowerCase()}
      </ContextMenuSubTrigger>
      <ContextMenuPortal>
        <ContextMenuSubContent>
          {assignment.groups
            .filter(({ acceptsAssignments }) => acceptsAssignments)
            .map((group) => (
              <ContextMenuItem
                key={group.id}
                onSelect={() => {
                  if (group.id !== assignment.currentGroupId) {
                    assignment.onSetGroup(group.id);
                  }
                }}
              >
                <span className="w-4">
                  {group.id === assignment.currentGroupId ? (
                    <Icon name="Check" aria-hidden />
                  ) : null}
                </span>
                {group.icon ? (
                  <ProviderIcon icon={group.icon} label={`${group.label} icon`} />
                ) : null}
                {group.label}
              </ContextMenuItem>
            ))}
        </ContextMenuSubContent>
      </ContextMenuPortal>
    </ContextMenuSub>
  );
}

function DropdownAssignmentMenu({
  assignment,
  disabled,
}: {
  assignment: CommonMenuProps["assignments"][number];
  disabled: boolean;
}) {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger disabled={disabled}>
        {assignment.icon ? (
          <ProviderIcon
            icon={assignment.icon}
            label={`${assignment.singularLabel} icon`}
          />
        ) : (
          <Icon name="Workflow" aria-hidden />
        )}
        Move to {assignment.singularLabel.toLocaleLowerCase()}
      </DropdownMenuSubTrigger>
      <DropdownMenuPortal>
        <DropdownMenuSubContent className={MENU_LAYER_CLASS}>
          {assignment.groups
            .filter(({ acceptsAssignments }) => acceptsAssignments)
            .map((group) => (
              <DropdownMenuItem
                key={group.id}
                onSelect={() => {
                  if (group.id !== assignment.currentGroupId) {
                    assignment.onSetGroup(group.id);
                  }
                }}
              >
                <span className="w-4">
                  {group.id === assignment.currentGroupId ? (
                    <Icon name="Check" aria-hidden />
                  ) : null}
                </span>
                {group.icon ? (
                  <ProviderIcon icon={group.icon} label={`${group.label} icon`} />
                ) : null}
                {group.label}
              </DropdownMenuItem>
            ))}
        </DropdownMenuSubContent>
      </DropdownMenuPortal>
    </DropdownMenuSub>
  );
}

function ContextSectionMenu(props: CommonMenuProps) {
  return (
    <ContextMenuSub>
      <ContextMenuSubTrigger>
        <Icon name="ListView" aria-hidden />Move to section
      </ContextMenuSubTrigger>
      <ContextMenuPortal>
        <ContextMenuSubContent>
          {props.sections.map((section) => (
            <ContextMenuItem
              key={section.id}
              onSelect={() => {
                if (section.id !== props.thread.sectionId) {
                  props.onSetSection(section.id);
                }
              }}
            >
              <span className="w-4">
                {section.id === props.thread.sectionId ? (
                  <Icon name="Check" aria-hidden />
                ) : null}
              </span>
              <SectionMenuIcon icon={props.sectionIcons.get(section.id)} />
              {section.label}
            </ContextMenuItem>
          ))}
          <ContextMenuItem
            onSelect={() => {
              if (props.thread.sectionId !== null) props.onSetSection(null);
            }}
          >
            <span className="w-4">
              {props.thread.sectionId === null ? (
                <Icon name="Check" aria-hidden />
              ) : null}
            </span>
            <UnorganizedIcon />Unorganized
          </ContextMenuItem>
          <ContextMenuItem inset onSelect={props.onNewSection}>
            <Icon name="SectionAdd" aria-hidden />New section
          </ContextMenuItem>
        </ContextMenuSubContent>
      </ContextMenuPortal>
    </ContextMenuSub>
  );
}

function DropdownSectionMenu(props: CommonMenuProps) {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <Icon name="ListView" aria-hidden />Move to section
      </DropdownMenuSubTrigger>
      <DropdownMenuPortal>
        <DropdownMenuSubContent className={MENU_LAYER_CLASS}>
          {props.sections.map((section) => (
            <DropdownMenuItem
              key={section.id}
              onSelect={() => {
                if (section.id !== props.thread.sectionId) {
                  props.onSetSection(section.id);
                }
              }}
            >
              <span className="w-4">
                {section.id === props.thread.sectionId ? (
                  <Icon name="Check" aria-hidden />
                ) : null}
              </span>
              <SectionMenuIcon icon={props.sectionIcons.get(section.id)} />
              {section.label}
            </DropdownMenuItem>
          ))}
          <DropdownMenuItem
            onSelect={() => {
              if (props.thread.sectionId !== null) props.onSetSection(null);
            }}
          >
            <span className="w-4">
              {props.thread.sectionId === null ? (
                <Icon name="Check" aria-hidden />
              ) : null}
            </span>
            <UnorganizedIcon />Unorganized
          </DropdownMenuItem>
          <DropdownMenuItem inset onSelect={props.onNewSection}>
            <Icon name="SectionAdd" aria-hidden />New section
          </DropdownMenuItem>
        </DropdownMenuSubContent>
      </DropdownMenuPortal>
    </DropdownMenuSub>
  );
}

function SectionMenuIcon({ icon }: { icon?: EntityIconView }) {
  if (!icon) {
    return <Icon name="ListView" className="size-4 shrink-0" aria-hidden />;
  }
  return (
    <HugeiconsIcon
      icon={icon.glyph}
      className="size-4 shrink-0"
      style={icon.color === null ? undefined : { color: icon.color }}
      aria-hidden
    />
  );
}

function ContextItem({
  children,
  destructive = false,
  icon,
  onSelect,
}: {
  children: ReactNode;
  destructive?: boolean;
  icon: IconName;
  onSelect(): void;
}) {
  return (
    <ContextMenuItem
      className={
        destructive
          ? "text-destructive focus:bg-destructive/15 focus:text-destructive"
          : undefined
      }
      onSelect={onSelect}
    >
      <Icon name={icon} aria-hidden />{children}
    </ContextMenuItem>
  );
}

function DropdownItem({
  children,
  destructive = false,
  icon,
  onSelect,
}: {
  children: ReactNode;
  destructive?: boolean;
  icon: IconName;
  onSelect(): void;
}) {
  return (
    <DropdownMenuItem
      variant={destructive ? "destructive" : "default"}
      onSelect={onSelect}
    >
      <Icon name={icon} aria-hidden />{children}
    </DropdownMenuItem>
  );
}
