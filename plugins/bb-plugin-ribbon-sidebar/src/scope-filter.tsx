import { HugeiconsIcon } from "@hugeicons/react";
import {
  createContext,
  useContext,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { FilterMailCircleIcon } from "@hugeicons/core-free-icons";
import type { EntityIconView } from "./icons";
import {
  serializeScopeFilter,
  type ScopeFilterValue,
} from "./scope-filter-value";
import { cn } from "./vendor/lib/utils";
import { Icon, type IconName } from "./vendor/components/ui/icon";
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

interface ThreadFilterProps {
  activeOverride?: { icon?: ReactNode; label: string };
  newProjectDisabled?: boolean;
  onChange: (filter: ScopeFilterValue) => void;
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
  trailing?: ReactNode;
  value: ScopeFilterValue;
}

const CHROME_SECTION_LABEL_CLASS =
  "text-xs font-normal leading-5 text-subtle-foreground/75";
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

export function ScopeFilter({
  activeOverride,
  newProjectDisabled = false,
  onChange,
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
  trailing,
  value,
}: ThreadFilterProps) {
  const [open, setOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const actionsOpen = open || optionsOpen;
  const activeProject =
    value?.kind === "project"
      ? projects.find((project) => project.id === value.id)
      : undefined;
  const activeSection =
    value?.kind === "section"
      ? sections.find((section) => section.id === value.id)
      : undefined;
  const activeUncategorized = value?.kind === "uncategorized";
  const activeLabel =
    activeOverride?.label ??
    (activeProject?.isPersonal
      ? "Threads"
      : (activeProject?.name ??
        activeSection?.name ??
        (activeUncategorized ? "Unorganized" : null)));
  const personalProject = projects.find((project) => project.isPersonal);
  const regularProjects = projects.filter((project) => !project.isPersonal);
  const scopeLabel = "Projects and sections";
  const allLabel = "All projects and sections";
  const selectedValue = serializeScopeFilter(value) ?? "";

  function handleFilterChange(nextValue: string): void {
    if (!nextValue) {
      onChange(null);
      return;
    }
    if (nextValue === "uncategorized") {
      onChange({ kind: "uncategorized" });
      return;
    }
    const [kind, id] = nextValue.split(":", 2);
    if ((kind === "project" || kind === "section") && id) {
      onChange({ kind, id });
    }
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
              activeLabel === null
                ? scopeLabel
                : `${scopeLabel}: ${activeLabel}`
            }
            className="thread-filter-trigger flex h-7 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md px-2 text-sm text-sidebar-foreground/85 outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[state=open]:bg-state-active data-[state=open]:text-sidebar-foreground max-md:pointer-coarse:h-9 dark:text-sidebar-foreground"
          >
            {activeOverride?.icon ? (
              activeOverride.icon
            ) : activeProject ? (
              <ProjectFilterIcon
                icon={projectIcons.get(activeProject.id)}
                personal={activeProject.isPersonal}
              />
            ) : activeSection ? (
              <ProjectFilterIcon
                icon={sectionIcons.get(activeSection.id)}
                fallback="ListView"
              />
            ) : activeUncategorized ? (
              <Icon
                name="ListView"
                className="size-4 shrink-0"
                aria-hidden
              />
            ) : (
              <Icon
                name="FolderOpen"
                className="size-4 shrink-0"
                aria-hidden
              />
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
              {value === null && activeOverride === undefined ? null : (
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
          <DropdownMenuRadioGroup
            aria-label="All threads"
            value={selectedValue}
            onValueChange={handleFilterChange}
          >
            <ThreadFilterItem
              label={allLabel}
              selectedValue={selectedValue}
              value=""
            >
              <Icon
                name="FolderOpen"
                className="size-4 shrink-0"
                aria-hidden
              />
            </ThreadFilterItem>
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup aria-labelledby="thread-filter-sections-label">
            <DropdownMenuLabel
              id="thread-filter-sections-label"
              className={CHROME_SECTION_LABEL_CLASS}
            >
              Sections
            </DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={selectedValue}
              onValueChange={handleFilterChange}
            >
              {sections.map((section) => (
                <ActionableThreadFilterItem
                  key={section.id}
                  label={section.name}
                  selected={
                    value?.kind === "section" && value.id === section.id
                  }
                  onSelect={() => {
                    onChange({ kind: "section", id: section.id });
                    setOpen(false);
                  }}
                >
                  <ProjectFilterIcon
                    icon={sectionIcons.get(section.id)}
                    fallback="ListView"
                  />
                  <SectionActions
                    onRemove={() => onRemoveSection(section)}
                    onRename={() => onRenameSection(section)}
                  />
                </ActionableThreadFilterItem>
              ))}
              {sections.length > 0 ? (
                <ThreadFilterItem
                  label="Unorganized"
                  selectedValue={selectedValue}
                  value="uncategorized"
                >
                  <Icon
                    name="ListView"
                    className="size-4 shrink-0"
                    aria-hidden
                  />
                </ThreadFilterItem>
              ) : null}
            </DropdownMenuRadioGroup>
            <DropdownMenuItem inset className="pl-7" onSelect={onNewSection}>
              <Icon name="SectionAdd" className="size-4 shrink-0" aria-hidden />
              <span>New section</span>
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup aria-labelledby="thread-filter-projects-label">
            <DropdownMenuLabel
              id="thread-filter-projects-label"
              className={CHROME_SECTION_LABEL_CLASS}
            >
              Projects
            </DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={selectedValue}
              onValueChange={handleFilterChange}
            >
              {regularProjects.map((project) => (
                <ActionableThreadFilterItem
                  key={project.id}
                  label={project.name}
                  selected={
                    value?.kind === "project" && value.id === project.id
                  }
                  onSelect={() => {
                    onChange({ kind: "project", id: project.id });
                    setOpen(false);
                  }}
                >
                  <ProjectFilterIcon icon={projectIcons.get(project.id)} />
                  <ProjectActions
                    canAddLocalPath={
                      projectActionStates.get(project.id)?.canAddLocalPath ??
                      false
                    }
                    onAddLocalPath={() => onAddProjectLocalPath(project)}
                    onOpenSettings={() => onOpenProjectSettings(project)}
                    onRemove={() => onRemoveProject(project)}
                    onRename={() => onRenameProject(project)}
                  />
                </ActionableThreadFilterItem>
              ))}
              {personalProject ? (
                <ThreadFilterItem
                  label="Threads"
                  selectedValue={selectedValue}
                  value={`project:${personalProject.id}`}
                >
                  <ProjectFilterIcon
                    icon={projectIcons.get(personalProject.id)}
                    personal
                  />
                </ThreadFilterItem>
              ) : null}
            </DropdownMenuRadioGroup>
            <DropdownMenuItem
              inset
              className="pl-7"
              disabled={newProjectDisabled}
              onSelect={onNewProject}
            >
              <Icon name="FolderPlus" className="size-4 shrink-0" aria-hidden />
              <span>New project</span>
            </DropdownMenuItem>
          </DropdownMenuGroup>
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
          className="bb-sidebar-hover-actions absolute inset-y-0 right-0 z-20 flex shrink-0 items-center gap-1 bg-sidebar pl-1 opacity-0 pointer-events-none group-hover/thread-filter:opacity-100 group-hover/thread-filter:pointer-events-auto focus-within:opacity-100 focus-within:pointer-events-auto data-[state=open]:opacity-100 data-[state=open]:pointer-events-auto max-md:pointer-coarse:static max-md:pointer-coarse:opacity-100 max-md:pointer-coarse:pointer-events-auto"
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
      {trailing}
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
