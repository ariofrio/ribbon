import { useRibbonEnabled } from "../../ribbon/app/data.js";
import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  experimental_Icon as RegisteredIcon,
  experimental_THREAD_ACTION_GROUPS,
  type PluginThreadActionEntry,
} from "@get-bb/plugin-sdk/app";
import {
  ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSub,
  ContextMenuSubContent, ContextMenuSubTrigger, ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent,
  DropdownMenuSubTrigger, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon, type IconName } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { COARSE_POINTER_ICON_SIZE_CLASS } from "@/components/ui/coarse-pointer-sizing";
import { useIsCompactViewport } from "@/components/ui/hooks/use-compact-viewport";
import { cn } from "@/lib/utils";
import { ActionMenuItem, ActionMenuSeparator } from "@/components/ui/action-menu-items";
import { CompactLongPressMenu } from "@/components/ui/compact-long-press-menu";
import type { SidebarThread } from "../model/sidebar-thread.js";
import { useRibbonThreadActions } from "../../ribbon/app/row-actions.js";
import { useCustomizeThreadRowActions } from "../list/customizeRowActionsContext.js";
import { RibbonThreadActionsMenu, RibbonThreadStageMenu } from "../../ribbon/app/menu.js";
import { ThreadActionsEditor } from "../../ribbon/app/ThreadActionsEditor.js";

interface ThreadActionsMenuBaseProps {
  thread: SidebarThread;
  onOpenInSplit?: () => void;
  onRename: () => void;
  onCloseAutoFocus?: (event: Event) => void;
}
export interface ThreadActionsMenuResponsiveAction {
  icon: IconName;
  label: string;
  onSelect: () => void | Promise<void>;
}
interface ThreadActionsMenuProps extends ThreadActionsMenuBaseProps {
  onOpenChange?: (open: boolean) => void;
  triggerClassName?: string;
  responsiveActions?: readonly ThreadActionsMenuResponsiveAction[];
}
interface ThreadActionsContextMenuProps extends ThreadActionsMenuBaseProps {
  children: ReactNode;
  disabled?: boolean;
  dragging?: boolean;
  onOpenChange?: (open: boolean) => void;
}
type ThreadActionsMenuSurface = "context" | "dropdown";
type ThreadActionsCompactStep = "actions" | "stage" | "edit" | `choice:${string}`;
interface ThreadActionsMenuItemsProps extends ThreadActionsMenuBaseProps {
  compactStep?: ThreadActionsCompactStep;
  onCompactStepChange?: (step: ThreadActionsCompactStep) => void;
  responsiveActions?: readonly ThreadActionsMenuResponsiveAction[];
  surface: ThreadActionsMenuSurface;
}

function ChoiceItems({ entry, surface }: { entry: PluginThreadActionEntry; surface: ThreadActionsMenuSurface }) {
  const Item = surface === "context" ? ContextMenuItem : DropdownMenuItem;
  return <>{entry.action.choices?.items.map(choice => (
    <Item key={choice.id} aria-current={choice.selected ? "true" : undefined}
      disabled={choice.disabled} className="flex items-center justify-between gap-3"
      onSelect={() => { void entry.action.run(choice.id); }}>
      {choice.icon ? <RegisteredIcon name={choice.icon} aria-hidden /> : null}
      <span className="min-w-0 flex-1 truncate">{choice.label}</span>
      {choice.selected ? <Icon name="Check" className="ml-auto" aria-hidden /> : null}
    </Item>
  ))}{entry.action.choices?.hint ? <div className="max-w-56 px-2 py-1 text-xs text-muted-foreground">{entry.action.choices.hint}</div> : null}</>;
}

function RegisteredAction({ entry, surface, isDrawer, openChoices }: {
  entry: PluginThreadActionEntry; surface: ThreadActionsMenuSurface; isDrawer: boolean; openChoices: () => void;
}) {
  const { action } = entry;
  const content = <><RegisteredIcon name={action.icon} aria-hidden /><span className="min-w-0 flex-1">
    <span className="block truncate">{action.label}</span>
    {action.detail ? <span className="block truncate text-xs text-muted-foreground">{action.detail}</span> : null}
  </span></>;
  if (action.choices) {
    if (isDrawer) return <DropdownMenuItem disabled={action.disabled} onSelect={event => {
      event.preventDefault(); openChoices();
    }}>{content}<Icon name="ChevronRight" className="ml-auto" aria-hidden /></DropdownMenuItem>;
    const Sub = surface === "context" ? ContextMenuSub : DropdownMenuSub;
    const Trigger = surface === "context" ? ContextMenuSubTrigger : DropdownMenuSubTrigger;
    const Content = surface === "context" ? ContextMenuSubContent : DropdownMenuSubContent;
    return <Sub><Trigger disabled={action.disabled}>{content}</Trigger>
      <Content className="max-h-[min(24rem,calc(100vh-2rem))] min-w-44 overflow-y-auto"><ChoiceItems entry={entry} surface={surface} /></Content>
    </Sub>;
  }
  const Item = surface === "context" ? ContextMenuItem : DropdownMenuItem;
  return <Item disabled={action.disabled}
    className={action.variant === "destructive" ? "text-destructive focus:bg-destructive/15 focus:text-destructive" : undefined}
    onSelect={() => { void action.run(); }}>{content}</Item>;
}

function ThreadActionsMenuItems({ thread, onRename, compactStep = "actions",
  onCompactStepChange, responsiveActions = [], surface }: ThreadActionsMenuItemsProps) {
  const ribbonEnabled = useRibbonEnabled();
  const entries = useRibbonThreadActions(thread, { requestRename: onRename });
  const customizeRowActions = useCustomizeThreadRowActions();
  const isCompactViewport = useIsCompactViewport();
  const isDrawer = surface === "dropdown" && isCompactViewport;
  const editorBack = useRef<HTMLElement | null>(null);
  const back = () => onCompactStepChange?.("actions");
  if (isDrawer && compactStep === "stage") return <RibbonThreadStageMenu thread={thread} surface={surface} drawer drawerStep onBack={back} />;
  if (isDrawer && compactStep === "edit") return <>
    <DropdownMenuItem ref={node => { editorBack.current = node; }} onSelect={event => { event.preventDefault(); back(); }}><Icon name="ChevronLeft" aria-hidden />Back</DropdownMenuItem>
    <DropdownMenuSeparator /><DropdownMenuLabel>Edit thread actions</DropdownMenuLabel>
    <ThreadActionsEditor threadId={thread.id} onTabBoundary={() => editorBack.current?.focus()} />
  </>;
  if (isDrawer && compactStep.startsWith("choice:")) {
    const entry = entries.find(item => `choice:${item.key}` === compactStep);
    return <><DropdownMenuItem onSelect={event => { event.preventDefault(); back(); }}><Icon name="ChevronLeft" aria-hidden />Back</DropdownMenuItem>
      <DropdownMenuSeparator />{entry ? <><DropdownMenuLabel>{entry.action.choices?.heading ?? entry.action.label}</DropdownMenuLabel><ChoiceItems entry={entry} surface={surface} /></> : null}</>;
  }
  const separator = isDrawer ? null : <ActionMenuSeparator surface={surface} />;
  return <>
    {responsiveActions.map(action => <ActionMenuItem key={action.label} surface={surface} icon={action.icon} onSelect={() => { void action.onSelect(); }}>{action.label}</ActionMenuItem>)}
    {responsiveActions.length ? separator : null}
    {entries.map((entry, index) => <Fragment key={entry.key}>
      {index > 0 && entries[index - 1].group !== entry.group ? separator : null}
      {ribbonEnabled && entry.key === "bb--core/rename" ? <><RibbonThreadStageMenu thread={thread} surface={surface} drawer={isDrawer} onOpenDrawerStep={() => onCompactStepChange?.("stage")} />{separator}</> : null}
      {entry.group === experimental_THREAD_ACTION_GROUPS.lifecycle && (index === 0 || entries[index - 1].group !== entry.group) && customizeRowActions ? <>
        <ActionMenuItem surface={surface} icon="FilterHorizontal" onSelect={() => customizeRowActions(thread.id)}>Customize row actions</ActionMenuItem>{separator}
      </> : null}
      <RegisteredAction entry={entry} surface={surface} isDrawer={isDrawer} openChoices={() => onCompactStepChange?.(`choice:${entry.key}`)} />
      {entry.key === "bb--core/rename" ? <><RibbonThreadActionsMenu thread={thread} surface={surface} drawer={isDrawer} onOpenEditor={() => onCompactStepChange?.("edit")} /></> : null}
    </Fragment>)}
    {!entries.some(entry => entry.key === "bb--core/rename") ? <>
      {ribbonEnabled ? <RibbonThreadStageMenu thread={thread} surface={surface} drawer={isDrawer} onOpenDrawerStep={() => onCompactStepChange?.("stage")} /> : null}
      <RibbonThreadActionsMenu thread={thread} surface={surface} drawer={isDrawer} onOpenEditor={() => onCompactStepChange?.("edit")} />
    </> : null}
  </>;
}

function useThreadActionsMenuLifecycle(onOpenChange?: (open: boolean) => void) {
  const [open, setOpen] = useState(false);
  const [compactStep, setCompactStep] =
    useState<ThreadActionsCompactStep>("actions");
  const handleOpenChange = useCallback(
    (open: boolean) => {
      setOpen(open);
      if (!open) {
        setCompactStep("actions");
      }
      onOpenChange?.(open);
    },
    [onOpenChange],
  );

  return { open, compactStep, setCompactStep, handleOpenChange };
}

export function ThreadActionsMenu({
  thread,
  onOpenInSplit,
  onRename,
  onCloseAutoFocus,
  responsiveActions,
  onOpenChange,
  triggerClassName,
}: ThreadActionsMenuProps) {
  const { open, compactStep, setCompactStep, handleOpenChange } =
    useThreadActionsMenuLifecycle(onOpenChange);

  return (
    <DropdownMenu modal={false} open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(
            "rounded-md p-0",
            "data-[state=open]:bg-state-active data-[state=open]:text-foreground",
            triggerClassName,
          )}
          aria-label="Thread actions"
          data-thread-actions-trigger=""
          onClick={(event) => {
            event.stopPropagation();
          }}
        >
          <Icon
            name="MoreHorizontal"
            className={COARSE_POINTER_ICON_SIZE_CLASS}
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onCloseAutoFocus={onCloseAutoFocus}>
        <ThreadActionsMenuItems
          thread={thread}
          onOpenInSplit={onOpenInSplit}
          onRename={onRename}
          compactStep={compactStep}
          onCompactStepChange={setCompactStep}
          responsiveActions={responsiveActions}
          surface="dropdown"
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ThreadActionsContextMenu(props: ThreadActionsContextMenuProps) {
  const isCompactViewport = useIsCompactViewport();
  if (isCompactViewport) {
    return <ThreadActionsCompactLongPressMenu {...props} />;
  }
  return <ThreadActionsDesktopContextMenu {...props} />;
}

function ThreadActionsCompactLongPressMenu({
  children,
  disabled,
  dragging,
  thread,
  onOpenInSplit,
  onOpenChange,
  onRename,
}: ThreadActionsContextMenuProps) {
  const { compactStep, setCompactStep, handleOpenChange } =
    useThreadActionsMenuLifecycle(onOpenChange);

  return (
    <CompactLongPressMenu
      label="Thread actions"
      disabled={disabled}
      dragging={dragging}
      onOpenChange={handleOpenChange}
      items={
        <ThreadActionsMenuItems
          thread={thread}
          onOpenInSplit={onOpenInSplit}
          onRename={onRename}
          compactStep={compactStep}
          onCompactStepChange={setCompactStep}
          surface="dropdown"
        />
      }
    >
      {children}
    </CompactLongPressMenu>
  );
}

function ThreadActionsDesktopContextMenu({
  children,
  disabled,
  dragging,
  thread,
  onOpenInSplit,
  onOpenChange,
  onRename,
  onCloseAutoFocus,
}: ThreadActionsContextMenuProps) {
  const [open, setOpen] = useState(false);
  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen && dragging) return;
      setOpen(nextOpen);
      onOpenChange?.(nextOpen);
    },
    [dragging, onOpenChange],
  );
  useEffect(() => {
    if (dragging && open) handleOpenChange(false);
  }, [dragging, handleOpenChange, open]);

  return (
    <ContextMenu modal={false} open={open} onOpenChange={handleOpenChange}>
      <ContextMenuTrigger asChild disabled={disabled || dragging}>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent
        aria-label="Thread actions"
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <ThreadActionsMenuItems
          thread={thread}
          onOpenInSplit={onOpenInSplit}
          onRename={onRename}
          surface="context"
        />
      </ContextMenuContent>
    </ContextMenu>
  );
}
