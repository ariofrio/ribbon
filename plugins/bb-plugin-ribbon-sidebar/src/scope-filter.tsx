import { HugeiconsIcon } from "@hugeicons/react";
import {
  createContext,
  useContext,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import {
  FilterMailCircleIcon,
  FolderLibraryIcon,
  ListTreeIcon,
} from "@hugeicons/core-free-icons";
import type { IconDataV1 } from "./contracts";
import type { EntityIconView } from "./icons";
import type { GroupingKey } from "./placement-store";
import {
  serializeScopeFilter,
  type ScopeFilterValue,
} from "./scope-filter-value";
import { cn } from "./vendor/lib/utils";
import { Icon, type IconName } from "./vendor/components/ui/icon";
import { ProviderIcon } from "./provider-icon";
import { UnorganizedIcon } from "./unorganized-icon";
import { ThreadFilterOptionsMenu } from "./sidebar-options-menu";
import { CompactViewportOverrideProvider } from "./vendor/components/ui/hooks/use-compact-viewport";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "./vendor/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./vendor/components/ui/tooltip";

interface ThreadFilterProject {
  id: string;
  isPersonal?: boolean;
  name: string;
}

interface ThreadFilterSection {
  id: string;
  name: string;
}

export interface GroupsMenuGrouping {
  groupingKey: string;
  singularLabel: string;
  pluralLabel: string;
  icon?: IconDataV1;
  groups: readonly {
    id: string;
    label: string;
    icon?: IconDataV1;
    acceptsAssignments: boolean;
  }[];
}

interface ThreadFilterProps {
  activeGroupingKey: string | null;
  groupings: readonly GroupsMenuGrouping[];
  newProjectDisabled?: boolean;
  onChange: (filter: ScopeFilterValue) => void;
  onGroupingChange: (groupingKey: string | null) => void;
  onHide?: () => void;
  onNewProject: () => void;
  onNewSection: () => void;
  onAddProjectLocalPath?: (project: ThreadFilterProject) => void;
  onOpenProjectSettings?: (project: ThreadFilterProject) => void;
  onRemoveProject?: (project: ThreadFilterProject) => void;
  onRemoveSection?: (section: ThreadFilterSection) => void;
  onRenameProject?: (project: ThreadFilterProject) => void;
  onRenameSection?: (section: ThreadFilterSection) => void;
  projectActionStates?: ReadonlyMap<string, { canAddLocalPath: boolean }>;
  projectIcons?: ReadonlyMap<string, EntityIconView>;
  sectionIcons?: ReadonlyMap<string, EntityIconView>;
  projects: readonly ThreadFilterProject[];
  sections: readonly ThreadFilterSection[];
  value: ScopeFilterValue;
}

const CONTENT_CLASS = "min-w-[var(--radix-dropdown-menu-trigger-width)]";
const FILTER_ITEM_CLASS = "gap-2 pl-7";
// Hides the circle bb hardcodes in DropdownMenuRadioItem's indicator slot; the
// row draws FilterRowCheck there instead. Direct-child only, so it never
// reaches an icon the row renders inside its own spans.
const HIDE_BUILTIN_INDICATOR_CLASS = "[&>span:first-child]:hidden";
// Same, for the chevron DropdownMenuSubTrigger appends after its children: the
// actionable row renders its own, as a separately hoverable target.
const HIDE_BUILTIN_SUBMENU_CHEVRON_CLASS = "[&>svg]:hidden";

function FilterRowCheck() {
  return (
    <span className="absolute left-2 inline-flex size-3.5 items-center justify-center">
      <Icon name="Check" className="size-3.5" aria-hidden />
    </span>
  );
}

const ACTIONABLE_ITEM_CLASS =
  "relative flex cursor-default select-none items-center gap-0 rounded-none p-0 pr-1 text-xs outline-none transition-none focus:bg-transparent focus:text-inherit data-[state=open]:bg-transparent data-[state=open]:text-inherit data-[last-hovered]:bg-transparent data-[last-hovered]:text-inherit";
const ACTIONABLE_SELECT_TARGET_CLASS =
  "relative flex min-w-0 flex-1 items-center gap-2 rounded-sm py-[0.3125rem] pl-7 pr-2 transition-colors data-[active]:bg-state-hover data-[active]:text-foreground";
const ACTION_CLASS =
  "inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground outline-none ring-sidebar-ring transition-none hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50 max-md:pointer-coarse:size-9";
const ACTION_TOOLTIP_DELAY_MS = 350;
const SubmenuPointerEnterContext = createContext<(() => void) | undefined>(
  undefined,
);

function ProjectsAndSectionsIcon() {
  return (
    <HugeiconsIcon
      icon={FolderLibraryIcon}
      size={16}
      className="size-4 shrink-0"
      aria-hidden
    />
  );
}

export function ScopeFilter({
  activeGroupingKey,
  groupings,
  newProjectDisabled = false,
  onChange,
  onGroupingChange,
  onHide = () => {},
  onNewProject,
  onNewSection,
  onAddProjectLocalPath = () => {},
  onOpenProjectSettings = () => {},
  onRemoveProject = () => {},
  onRemoveSection = () => {},
  onRenameProject = () => {},
  onRenameSection = () => {},
  projectActionStates = new Map(),
  projectIcons = new Map(),
  sectionIcons = new Map(),
  projects,
  sections,
  value,
}: ThreadFilterProps) {
  const [open, setOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const actionsOpen = open || optionsOpen;
  const activeGrouping = value
    ? groupings.find(({ groupingKey }) => groupingKey === value.groupingKey)
    : undefined;
  const activeGroup = activeGrouping?.groups.find(
    ({ id }) => id === value?.groupId,
  );
  const activeLabel = activeGroup?.label ??
    (value ? `${value.groupId} (unavailable)` : null);
  const scopeLabel = "Groups";
  const allLabel = "All groups";
  const selectedValue = serializeScopeFilter(value) ?? "";

  function handleFilterChange(nextValue: string): void {
    if (!nextValue) {
      onChange(null);
      return;
    }
    const separator = nextValue.indexOf("/");
    if (separator <= 0 || separator === nextValue.length - 1) return;
    onChange({
      groupingKey: nextValue.slice(0, separator) as GroupingKey,
      groupId: nextValue.slice(separator + 1),
    });
  }

  function groupIcon(grouping: GroupsMenuGrouping, groupId: string) {
    const group = grouping.groups.find(({ id }) => id === groupId);
    if (grouping.groupingKey === "builtin:projects") {
      const project = projects.find(({ id }) => id === groupId);
      return (
        <ProjectFilterIcon
          icon={projectIcons.get(groupId)}
          personal={project?.isPersonal}
        />
      );
    }
    if (grouping.groupingKey === "builtin:sections") {
      if (groupId === "unsectioned") return <UnorganizedIcon />;
      return (
        <ProjectFilterIcon
          icon={sectionIcons.get(groupId)}
          fallback="ListView"
        />
      );
    }
    return group?.icon ? (
      <ProviderIcon icon={group.icon} label={`${group.label} icon`} />
    ) : (
      <Icon name="Workflow" className="size-4 shrink-0" aria-hidden />
    );
  }

  function groupingIcon(grouping: GroupsMenuGrouping) {
    if (grouping.groupingKey === "builtin:sections") {
      return <Icon name="ListView" className="size-4 shrink-0" aria-hidden />;
    }
    if (grouping.groupingKey === "builtin:projects") {
      return <Icon name="Folder" className="size-4 shrink-0" aria-hidden />;
    }
    return grouping.icon ? (
      <span
        aria-hidden
        className="inline-flex size-4 shrink-0 items-center justify-center leading-none"
      >
        <ProviderIcon
          icon={grouping.icon}
          label={`${grouping.singularLabel} icon`}
        />
      </span>
    ) : (
      <Icon name="Workflow" className="size-4 shrink-0" aria-hidden />
    );
  }

  function groupingContents(
    grouping: GroupsMenuGrouping,
    allowGroupBy = true,
  ) {
    const canGroupBy = allowGroupBy;
    const selectGroup = (groupId: string) => {
      onChange({
        groupingKey: grouping.groupingKey as GroupingKey,
        groupId,
      });
      setOpen(false);
    };
    const groups =
      grouping.groupingKey === "builtin:projects"
        ? [...grouping.groups].sort((left, right) => {
            const leftPersonal = projects.find(({ id }) => id === left.id)?.isPersonal;
            const rightPersonal = projects.find(({ id }) => id === right.id)?.isPersonal;
            return leftPersonal === rightPersonal ? 0 : leftPersonal ? 1 : -1;
          })
        : grouping.groups;
    const rows = groups.map((group) => {
      const selected =
        value?.groupingKey === grouping.groupingKey &&
        value.groupId === group.id;
      if (grouping.groupingKey === "builtin:sections" && group.id !== "unsectioned") {
        const section = sections.find(({ id }) => id === group.id);
        if (!section) return null;
        return (
          <ActionableThreadFilterItem
            key={group.id}
            label={group.label}
            selected={selected}
            onSelect={() => selectGroup(group.id)}
          >
            {groupIcon(grouping, group.id)}
            <SectionActions
              onRemove={() => onRemoveSection(section)}
              onRename={() => onRenameSection(section)}
            />
          </ActionableThreadFilterItem>
        );
      }
      if (grouping.groupingKey === "builtin:projects") {
        const project = projects.find(({ id }) => id === group.id);
        if (!project) return null;
        if (project.isPersonal) {
          return (
            <ThreadFilterItem
              key={group.id}
              label={group.label}
              selectedValue={selectedValue}
              value={serializeScopeFilter({
                groupingKey: grouping.groupingKey as GroupingKey,
                groupId: group.id,
              })!}
            >
              {groupIcon(grouping, group.id)}
            </ThreadFilterItem>
          );
        }
        return (
          <ActionableThreadFilterItem
            key={group.id}
            label={group.label}
            selected={selected}
            onSelect={() => selectGroup(group.id)}
          >
            {groupIcon(grouping, group.id)}
            <ProjectActions
              canAddLocalPath={
                projectActionStates.get(project.id)?.canAddLocalPath ?? false
              }
              onAddLocalPath={() => onAddProjectLocalPath(project)}
              onOpenSettings={() => onOpenProjectSettings(project)}
              onRemove={() => onRemoveProject(project)}
              onRename={() => onRenameProject(project)}
            />
          </ActionableThreadFilterItem>
        );
      }
      return (
        <ThreadFilterItem
          key={group.id}
          label={group.label}
          selectedValue={selectedValue}
          value={serializeScopeFilter({
            groupingKey: grouping.groupingKey as GroupingKey,
            groupId: group.id,
          })!}
        >
          {groupIcon(grouping, group.id)}
        </ThreadFilterItem>
      );
    });

    const newEntityAction =
      grouping.groupingKey === "builtin:sections" ? (
        <DropdownMenuItem inset className="pl-7" onSelect={onNewSection}>
          <Icon name="SectionAdd" className="size-4 shrink-0" aria-hidden />
          <span>New section</span>
        </DropdownMenuItem>
      ) : grouping.groupingKey === "builtin:projects" ? (
        <DropdownMenuItem
          inset
          className="pl-7"
          disabled={newProjectDisabled}
          onSelect={onNewProject}
        >
          <Icon name="FolderPlus" className="size-4 shrink-0" aria-hidden />
          <span>New project</span>
        </DropdownMenuItem>
      ) : null;

    return (
      <>
        <DropdownMenuRadioGroup
          value={selectedValue}
          onValueChange={handleFilterChange}
        >
          {rows}
        </DropdownMenuRadioGroup>
        {newEntityAction !== null || canGroupBy ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              {newEntityAction}
              {canGroupBy ? (
                <DropdownMenuItem
                  className="pl-7"
                  role="menuitemcheckbox"
                  aria-checked={activeGroupingKey === grouping.groupingKey}
                  onSelect={() =>
                    onGroupingChange(
                      activeGroupingKey === grouping.groupingKey
                        ? null
                        : grouping.groupingKey,
                    )
                  }
                >
                  {activeGroupingKey === grouping.groupingKey ? (
                    <FilterRowCheck />
                  ) : null}
                  <HugeiconsIcon
                    icon={ListTreeIcon}
                    size={16}
                    className="size-4 shrink-0"
                    aria-hidden
                  />
                  Group by {grouping.singularLabel.toLocaleLowerCase()}
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuGroup>
          </>
        ) : null}
      </>
    );
  }

  function groupingSubmenu(grouping: GroupsMenuGrouping) {
    return (
      <DropdownMenuSub key={grouping.groupingKey}>
        <DropdownMenuSubTrigger className="pl-7">
          {groupingIcon(grouping)}
          <span className="truncate">{grouping.pluralLabel}</span>
        </DropdownMenuSubTrigger>
        <DropdownMenuPortal>
          <DropdownMenuSubContent>
            {groupingContents(grouping)}
          </DropdownMenuSubContent>
        </DropdownMenuPortal>
      </DropdownMenuSub>
    );
  }

  return (
    <div className="bb-sidebar-hover-actions-row group/thread-filter sticky top-[var(--bb-sidebar-sticky-stack-padding-top)] z-[70] mb-4 flex min-w-0 items-center gap-1 rounded-md bg-sidebar outline-none ring-sidebar-ring has-[.thread-filter-trigger:focus-visible]:ring-2 before:pointer-events-none before:absolute before:inset-x-0 before:bottom-full before:h-2 before:bg-sidebar before:content-[''] after:pointer-events-none after:absolute after:inset-x-0 after:top-full after:h-4 after:bg-sidebar after:content-['']">
      <div className="relative flex min-w-0 flex-1 items-center">
      <CompactViewportOverrideProvider isCompactViewport={false}>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            data-thread-filter-trigger=""
            aria-label={
              activeLabel === null ? scopeLabel : `${activeLabel}, filtered`
            }
            className="thread-filter-trigger flex h-7 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md px-2 text-sm text-sidebar-foreground/85 outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[state=open]:bg-state-active data-[state=open]:text-sidebar-foreground max-md:pointer-coarse:h-9 dark:text-sidebar-foreground"
          >
            {activeGrouping && activeGroup ? (
              groupIcon(activeGrouping, activeGroup.id)
            ) : (
              <ProjectsAndSectionsIcon />
            )}
            <span
              data-thread-filter-label-cluster=""
              // 10px, which is what a stage header leaves between its own
              // label and its chevron: 4px of gap plus the 6px of slack a
              // 12px glyph has inside its 24px button. This indicator is the
              // same shape of thing one column over — a small glyph trailing
              // a name — and its own box has no slack, so the gap carries it
              // all.
              className="flex min-w-0 items-center gap-2.5"
            >
              <span data-thread-filter-label="" className="truncate">
                {activeLabel ?? scopeLabel}
              </span>
              {value === null ? null : (
                <span
                  aria-label="Threads are filtered"
                  data-thread-filter-indicator=""
                  className="inline-flex size-4 shrink-0 items-center justify-center text-subtle-foreground/60"
                >
                  <HugeiconsIcon
                    icon={FilterMailCircleIcon}
                    size={16}
                    className="size-4"
                    aria-hidden
                  />
                </span>
              )}
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className={CONTENT_CLASS}>
          <DropdownMenuRadioGroup value={selectedValue} onValueChange={handleFilterChange}>
            <ThreadFilterItem
              label={allLabel}
              selectedValue={selectedValue}
              value=""
            >
              <ProjectsAndSectionsIcon />
            </ThreadFilterItem>
          </DropdownMenuRadioGroup>
          {activeGrouping ? (
            <>
              {groupings
                .filter(({ groupingKey }) => groupingKey !== activeGrouping.groupingKey)
                .map(groupingSubmenu)}
              {groupings.some(
                ({ groupingKey }) => groupingKey !== activeGrouping.groupingKey,
              ) ? <DropdownMenuSeparator /> : null}
              <DropdownMenuGroup>
                <DropdownMenuLabel>
                  {activeGrouping.pluralLabel}
                </DropdownMenuLabel>
                {groupingContents(activeGrouping, false)}
              </DropdownMenuGroup>
            </>
          ) : (
            groupings.map(groupingSubmenu)
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      </CompactViewportOverrideProvider>
      <TooltipProvider>
        <span
          data-thread-filter-actions=""
          data-testid="thread-filter-actions"
          data-state={actionsOpen ? "open" : "closed"}
          data-sidebar-hover-actions-open={actionsOpen ? "true" : undefined}
          data-sidebar-hover-actions-mobile="always"
          className="bb-sidebar-hover-actions relative z-20 flex shrink-0 items-center gap-1 bg-sidebar pl-1 opacity-0 pointer-events-none group-hover/thread-filter:opacity-100 group-hover/thread-filter:pointer-events-auto focus-within:opacity-100 focus-within:pointer-events-auto data-[state=open]:opacity-100 data-[state=open]:pointer-events-auto max-md:pointer-coarse:opacity-100 max-md:pointer-coarse:pointer-events-auto"
        >
          <ThreadFilterAction
            icon="SectionAdd"
            label="New section"
            onClick={onNewSection}
          />
          <ThreadFilterAction
            disabled={newProjectDisabled}
            icon="FolderPlus"
            label="New project"
            onClick={onNewProject}
          />
          <ThreadFilterOptionsMenu
            onHide={onHide}
            onOpenChange={setOptionsOpen}
          />
        </span>
      </TooltipProvider>
      </div>
    </div>
  );
}

function ActionableThreadFilterItem({
  children,
  label,
  onSelect,
  selected,
}: {
  children: React.ReactNode;
  label: string;
  onSelect: () => void;
  selected: boolean;
}) {
  const [submenuOpen, setSubmenuOpen] = useState(false);
  const [pointerTarget, setPointerTarget] = useState<"item" | "chevron" | null>(
    null,
  );
  const [keyboardFocused, setKeyboardFocused] = useState(false);
  const suppressSyntheticClick = useRef(false);
  const selectTargetActive =
    pointerTarget === "item" ||
    (pointerTarget === null && keyboardFocused && !submenuOpen);
  const chevronActive =
    pointerTarget === "chevron" || (pointerTarget === null && submenuOpen);

  function handleClick(event: ReactMouseEvent<HTMLDivElement>): void {
    if (
      !(event.target instanceof Node) ||
      !event.currentTarget.contains(event.target)
    ) {
      return;
    }
    if (suppressSyntheticClick.current) {
      suppressSyntheticClick.current = false;
      event.preventDefault();
      return;
    }
    if (
      event.target instanceof Element &&
      event.target.closest("[data-thread-filter-submenu-chevron]")
    ) {
      return;
    }
    event.preventDefault();
    onSelect();
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void {
    if (
      !(event.target instanceof Node) ||
      !event.currentTarget.contains(event.target)
    ) {
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect();
      return;
    }
    if (event.key === "ArrowRight") {
      suppressSyntheticClick.current = true;
      queueMicrotask(() => {
        suppressSyntheticClick.current = false;
      });
      return;
    }
    if (event.key === "F10" && event.shiftKey) {
      event.preventDefault();
      setSubmenuOpen(true);
    }
  }

  return (
    <DropdownMenuSub open={submenuOpen} onOpenChange={setSubmenuOpen}>
      <DropdownMenuSubTrigger
        role="menuitemradio"
        aria-checked={selected}
        className={cn(ACTIONABLE_ITEM_CLASS, HIDE_BUILTIN_SUBMENU_CHEVRON_CLASS)}
        onClick={handleClick}
        onContextMenu={(event) => {
          event.preventDefault();
          setSubmenuOpen(true);
        }}
        onBlur={() => setKeyboardFocused(false)}
        onFocus={(event) => {
          if (
            event.target instanceof Node &&
            event.currentTarget.contains(event.target)
          ) {
            setKeyboardFocused(true);
          }
        }}
        onKeyDown={handleKeyDown}
        onPointerEnter={() => setPointerTarget("item")}
        onPointerLeave={() => setPointerTarget(null)}
        onPointerMove={(event) => {
          if (!(event.target instanceof Element)) return;
          if (!event.currentTarget.contains(event.target)) return;
          setPointerTarget(
            event.target.closest("[data-thread-filter-submenu-chevron]")
              ? "chevron"
              : "item",
          );
        }}
      >
        <span
          data-thread-filter-select-target=""
          data-active={selectTargetActive ? "" : undefined}
          className={ACTIONABLE_SELECT_TARGET_CLASS}
        >
          {selected ? (
            <FilterRowCheck />
          ) : null}
          <SubmenuPointerEnterContext.Provider
            value={() => setPointerTarget(null)}
          >
            {children}
          </SubmenuPointerEnterContext.Provider>
          <span className="truncate">{label}</span>
        </span>
        <span
          data-thread-filter-submenu-chevron=""
          data-active={chevronActive ? "" : undefined}
          className="ml-1 inline-flex size-[1.625rem] shrink-0 items-center justify-center rounded-sm transition-colors data-[active]:bg-state-hover data-[active]:text-foreground"
        >
          <Icon name="ChevronRight" className="size-3.5" aria-hidden />
        </span>
      </DropdownMenuSubTrigger>
    </DropdownMenuSub>
  );
}

function ProjectActions({
  canAddLocalPath,
  onAddLocalPath,
  onOpenSettings,
  onRemove,
  onRename,
}: {
  canAddLocalPath: boolean;
  onAddLocalPath: () => void;
  onOpenSettings: () => void;
  onRemove: () => void;
  onRename: () => void;
}) {
  const onSubmenuPointerEnter = useContext(SubmenuPointerEnterContext);

  return (
    <DropdownMenuPortal>
      <DropdownMenuSubContent
        sideOffset={2}
        onPointerEnter={onSubmenuPointerEnter}
      >
        <FilterActionItem
          icon="Settings"
          label="Project settings"
          onSelect={onOpenSettings}
        />
        <DropdownMenuSeparator />
        <FilterActionItem icon="Edit" label="Rename" onSelect={onRename} />
        {canAddLocalPath ? (
          <FilterActionItem
            icon="FolderPlus"
            label="Add local path"
            onSelect={onAddLocalPath}
          />
        ) : null}
        <FilterActionItem
          destructive
          icon="Trash2"
          label="Remove"
          onSelect={onRemove}
        />
      </DropdownMenuSubContent>
    </DropdownMenuPortal>
  );
}

function SectionActions({
  onRemove,
  onRename,
}: {
  onRemove: () => void;
  onRename: () => void;
}) {
  const onSubmenuPointerEnter = useContext(SubmenuPointerEnterContext);

  return (
    <DropdownMenuPortal>
      <DropdownMenuSubContent
        sideOffset={2}
        onPointerEnter={onSubmenuPointerEnter}
      >
        <FilterActionItem icon="Edit" label="Rename" onSelect={onRename} />
        <FilterActionItem
          destructive
          icon="Trash2"
          label="Remove"
          onSelect={onRemove}
        />
      </DropdownMenuSubContent>
    </DropdownMenuPortal>
  );
}

function FilterActionItem({
  destructive = false,
  icon,
  label,
  onSelect,
}: {
  destructive?: boolean;
  icon: "Edit" | "FolderPlus" | "Settings" | "Trash2";
  label: string;
  onSelect: () => void;
}) {
  return (
    <DropdownMenuItem
      variant={destructive ? "destructive" : "default"}
      onSelect={onSelect}
    >
      <Icon name={icon} className="size-4 shrink-0" aria-hidden />
      <span>{label}</span>
    </DropdownMenuItem>
  );
}

function ProjectFilterIcon({
  icon,
  personal = false,
  fallback,
}: {
  icon?: EntityIconView;
  personal?: boolean;
  /** Drawn where the owner has no icon of its own. */
  fallback?: IconName;
}) {
  if (!icon) {
    return (
      <Icon
        name={fallback ?? (personal ? "MessageSquare" : "Folder")}
        className="size-4 shrink-0"
        aria-hidden
      />
    );
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

function ThreadFilterAction({
  disabled = false,
  icon,
  label,
  onClick,
}: {
  disabled?: boolean;
  icon: "FolderPlus" | "SectionAdd";
  label: string;
  onClick: () => void;
}) {
  function handleClick(event: ReactMouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    if (event.detail > 0) {
      event.currentTarget.blur();
    }
    onClick();
  }

  const button = (
    <button
      type="button"
      aria-label={label}
      className={ACTION_CLASS}
      disabled={disabled}
      onClick={handleClick}
    >
      <Icon name={icon} className="size-4" aria-hidden />
    </button>
  );

  return (
    <Tooltip delayDuration={ACTION_TOOLTIP_DELAY_MS} disableHoverableContent>
      <TooltipTrigger asChild>
        {disabled ? <span className="inline-flex">{button}</span> : button}
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

function ThreadFilterItem({
  children,
  label,
  selectedValue,
  value,
}: {
  children?: React.ReactNode;
  label: string;
  selectedValue: string;
  value: string;
}) {
  return (
    <DropdownMenuRadioItem
      value={value}
      className={cn(FILTER_ITEM_CLASS, HIDE_BUILTIN_INDICATOR_CLASS)}
    >
      {selectedValue === value ? <FilterRowCheck /> : null}
      {children}
      <span className="truncate">{label}</span>
    </DropdownMenuRadioItem>
  );
}
