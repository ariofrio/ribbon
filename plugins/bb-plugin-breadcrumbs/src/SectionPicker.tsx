import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/vendor/components/ui/dropdown-menu";
import { Icon } from "@/vendor/components/ui/icon";

interface SectionPickerProps {
  sections: ReadonlyArray<{ id: string; name: string }>;
  selectedSectionId: string | null;
  isLoading: boolean;
  onOpen(): void;
  onSelect(sectionId: string | null): void;
}

export function InheritedForkSection({
  section,
}: {
  section: { id: string; name: string } | null;
}) {
  const label = section?.name ?? "Unorganized";
  return (
    <span
      data-inherited-fork-section=""
      aria-label={`${label}, inherited from fork source`}
      title="Inherited from fork source"
      className="inline-flex min-h-7 min-w-0 shrink-0 items-center text-muted-foreground"
    >
      <span className="max-w-48 truncate">{label}</span>
    </span>
  );
}

export function SectionPicker({
  sections,
  selectedSectionId,
  isLoading,
  onOpen,
  onSelect,
}: SectionPickerProps) {
  const selected = sections.find(({ id }) => id === selectedSectionId);
  const label = isLoading
    ? "Loading sections…"
    : (selected?.name ?? "Unorganized");

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (open) onOpen();
      }}
    >
      <DropdownMenuTrigger asChild disabled={isLoading}>
        <button
          type="button"
          aria-label="Section"
          disabled={isLoading}
          className="relative z-50 -mx-2 inline-flex min-h-7 min-w-0 shrink-0 cursor-pointer items-center gap-1 rounded-md px-2 text-muted-foreground transition-colors duration-150 hover:duration-0 hover:bg-state-hover hover:text-foreground data-[state=open]:bg-state-active data-[state=open]:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-default [app-region:no-drag] [-webkit-app-region:no-drag]"
        >
          <span className="max-w-48 truncate">{label}</span>
          <Icon
            name="ChevronDown"
            className="size-3.5 shrink-0"
            aria-hidden="true"
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" mobileTitle="Section">
        <DropdownMenuLabel>Section</DropdownMenuLabel>
        {sections.map((section) => (
          <DropdownMenuItem
            key={section.id}
            onSelect={() => onSelect(section.id)}
          >
            {section.name}
            <Icon
              name="Check"
              className={
                section.id === selectedSectionId
                  ? "ml-auto size-4 opacity-100"
                  : "ml-auto size-4 opacity-0"
              }
              aria-hidden="true"
            />
          </DropdownMenuItem>
        ))}
        {sections.length > 0 ? <DropdownMenuSeparator /> : null}
        <DropdownMenuItem onSelect={() => onSelect(null)}>
          Unorganized
          <Icon
            name="Check"
            className={
              selectedSectionId === null
                ? "ml-auto size-4 opacity-100"
                : "ml-auto size-4 opacity-0"
            }
            aria-hidden="true"
          />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
