import { HugeiconsIcon } from "@hugeicons/react";
import {
  createContext,
  useContext,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { FolderLibraryIcon } from "@hugeicons/core-free-icons";
import type { IconDataV1 } from "./contracts";
import type { IconFallback } from "./icon-styles";
import type { GroupingKey } from "./placement-store";
import {
  serializeScopeFilter,
  type ScopeFilterValue,
} from "./scope-filter-value";
import { cn } from "./vendor/lib/utils";
import { Icon, type IconName } from "./vendor/components/ui/icon";
import { ProviderIcon } from "./provider-icon";
import { UnorganizedIcon } from "./unorganized-icon";
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
  filterGroupingKey: string;
  groupings: readonly GroupsMenuGrouping[];
  newProjectDisabled?: boolean;
  onChange: (filter: ScopeFilterValue) => void;
  onNewProject: () => void;
  onNewSection: () => void;
  onAddProjectLocalPath?: (project: ThreadFilterProject) => void;
  onOpenProjectSettings?: (project: ThreadFilterProject) => void;
  onRemoveProject?: (project: ThreadFilterProject) => void;
  onRemoveSection?: (section: ThreadFilterSection) => void;
  onRenameProject?: (project: ThreadFilterProject) => void;
  onRenameSection?: (section: ThreadFilterSection) => void;
  projectActionStates?: ReadonlyMap<string, { canAddLocalPath: boolean }>;
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
  filterGroupingKey,
  groupings,
  newProjectDisabled = false,
  onChange,
  onNewProject,
  onNewSection,
  onAddProjectLocalPath = () => {},
  onOpenProjectSettings = () => {},
  onRemoveProject = () => {},
  onRemoveSection = () => {},
  onRenameProject = () => {},
  onRenameSection = () => {},
  projectActionStates = new Map(),
  projects,
  sections,
  value,
}: ThreadFilterProps) {
  const [open, setOpen] = useState(false);
  const activeGrouping = value
    ? groupings.find(({ groupingKey }) => groupingKey === value.groupingKey)
    : undefined;
  const expandedGrouping =
    groupings.find(
      ({ groupingKey }) =>
        groupingKey === (value?.groupingKey ?? filterGroupingKey),
    ) ??
    groupings.find(({ groupingKey }) => groupingKey === "builtin:sections") ??
    groupings[0];
  const activeGroup = activeGrouping?.groups.find(
    ({ id }) => id === value?.groupId,
  );
  const activeLabel = activeGroup?.label ??
    (value ? `${value.groupId} (unavailable)` : null);
  const scopeLabel = "All groups";
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
        <ScopeOwnerIcon
          id={groupId}
          fallback={project?.isPersonal ? "personal" : "project"}
        />
      );
    }
    if (grouping.groupingKey === "builtin:sections") {
      if (groupId === "unsectioned") return <UnorganizedIcon />;
      return <ScopeOwnerIcon id={groupId} fallback="section" />;
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

  function switcherIcon() {
    const tileClass =
      "inline-flex size-8 shrink-0 items-center justify-center rounded-lg";
    const semanticIconClass =
      `${tileClass} text-primary-foreground [&_svg]:text-primary-foreground`;
    if (
      activeGrouping?.groupingKey === "builtin:projects" &&
      activeGroup
    ) {
      const project = projects.find(({ id }) => id === activeGroup.id);
      return (
        <span
          aria-hidden
          className={semanticIconClass}
          data-ribbon-icons-project={activeGroup.id}
          style={{
            backgroundColor:
              "var(--ribbon-icons-project-color-light, var(--primary))",
          }}
        >
          <span
            data-ribbon-icons-project={activeGroup.id}
            data-ribbon-sidebar-icon={
              project?.isPersonal ? "personal" : "project"
            }
            style={{
              backgroundColor:
                "var(--ribbon-icons-project-on-color-light, var(--primary-foreground))",
            }}
          />
        </span>
      );
    }
    if (
      activeGrouping?.groupingKey === "builtin:sections" &&
      activeGroup
    ) {
      return (
        <span
          aria-hidden
          className={semanticIconClass}
          {...(activeGroup.id === "unsectioned"
            ? {}
            : { "data-ribbon-icons-section": activeGroup.id })}
          style={{
            backgroundColor:
              "var(--ribbon-icons-section-color-light, var(--primary))",
          }}
        >
          {activeGroup.id === "unsectioned" ? (
            <Icon className="size-4" name="ListView" />
          ) : (
            <span
              data-ribbon-icons-section={activeGroup.id}
              data-ribbon-sidebar-icon="section"
              style={{
                backgroundColor:
                  "var(--ribbon-icons-section-on-color-light, var(--primary-foreground))",
              }}
            />
          )}
        </span>
      );
    }
    return (
      <span
        aria-hidden
        className={`${semanticIconClass} bg-primary`}
      >
        {activeGrouping && activeGroup
          ? groupIcon(activeGrouping, activeGroup.id)
          : <ProjectsAndSectionsIcon />}
      </span>
    );
  }

  function groupingContents(grouping: GroupsMenuGrouping) {
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
        {newEntityAction}
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

  const pagesLabel = expandedGrouping?.singularLabel ?? "Section";

  return (
    <div className="relative flex min-w-0 flex-1 items-center">
      <CompactViewportOverrideProvider isCompactViewport={false}>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            data-thread-filter-trigger=""
            aria-label={
              activeLabel === null
                ? `${scopeLabel}, Pages by ${pagesLabel}`
                : `${activeLabel}, filtered`
            }
            className="thread-filter-trigger flex h-11 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md px-2 text-sidebar-foreground outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring data-[state=open]:bg-state-active data-[state=open]:text-sidebar-foreground dark:text-sidebar-foreground"
          >
            {switcherIcon()}
            <span
              data-thread-filter-label-cluster=""
              className="flex min-w-0 flex-col items-start justify-center leading-tight"
            >
              <span data-thread-filter-label="" className="max-w-full truncate text-sm font-medium">
                {activeLabel ?? scopeLabel}
              </span>
              <span className="max-w-full truncate text-xs text-subtle-foreground/75">
                {activeGrouping?.singularLabel ?? pagesLabel}
              </span>
            </span>
            <span
              aria-hidden
              className="inline-flex shrink-0 text-muted-foreground"
              style={{ marginLeft: 4 }}
            >
              <Icon aria-hidden className="size-3.5" name="ChevronDown" />
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className={CONTENT_CLASS}>
          {expandedGrouping ? (
            <>
              <DropdownMenuGroup>
                {groupingContents(expandedGrouping)}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuRadioGroup value={selectedValue} onValueChange={handleFilterChange}>
                <ThreadFilterItem
                  label={allLabel}
                  selectedValue={selectedValue}
                  value=""
                >
                  <ProjectsAndSectionsIcon />
                </ThreadFilterItem>
              </DropdownMenuRadioGroup>
              {groupings
                .filter(
                  ({ groupingKey }) =>
                    groupingKey !== expandedGrouping.groupingKey,
                )
                .map(groupingSubmenu)}
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      </CompactViewportOverrideProvider>
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
        <ProjectGroupActionItems
          canAddLocalPath={canAddLocalPath}
          onAddLocalPath={onAddLocalPath}
          onOpenSettings={onOpenSettings}
          onRemove={onRemove}
          onRename={onRename}
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
        <SectionGroupActionItems onRemove={onRemove} onRename={onRename} />
      </DropdownMenuSubContent>
    </DropdownMenuPortal>
  );
}

export function ProjectGroupActionItems({
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
  return (
    <>
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
    </>
  );
}

export function SectionGroupActionItems({
  onRemove,
  onRename,
}: {
  onRemove: () => void;
  onRename: () => void;
}) {
  return (
    <>
      <FilterActionItem icon="Edit" label="Rename" onSelect={onRename} />
      <FilterActionItem
        destructive
        icon="Trash2"
        label="Remove"
        onSelect={onRemove}
      />
    </>
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

/** Empty by design: the box names its owner, and icon-styles.ts paints it. */
function ScopeOwnerIcon({
  id,
  fallback,
}: {
  id: string;
  fallback: IconFallback;
}) {
  const named =
    fallback === "section"
      ? { "data-ribbon-icons-section": id }
      : { "data-ribbon-icons-project": id };
  return <span aria-hidden data-ribbon-sidebar-icon={fallback} {...named} />;
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
