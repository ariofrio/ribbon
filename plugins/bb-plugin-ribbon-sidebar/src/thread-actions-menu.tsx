import { HugeiconsIcon } from "@hugeicons/react";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import type { EntityIconView } from "./icons";
import { Icon } from "./vendor/components/ui/icon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "./vendor/components/ui/dropdown-menu";

export function ThreadActionsMenu({
  sectionIcons,
  sections,
  thread,
  onNewSection,
  onSetSection,
}: {
  sectionIcons: ReadonlyMap<string, EntityIconView>;
  sections: readonly { id: string; label: string }[];
  thread: PluginSidebarThread;
  onNewSection(): void;
  onSetSection(sectionId: string | null): void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label={`Thread actions for ${thread.title ?? thread.titleFallback ?? "Untitled thread"}`}
          className="shrink-0 rounded px-1 text-muted-foreground outline-none hover:bg-state-hover hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring"
          onClick={(event) => event.stopPropagation()}
          type="button"
        >
          <Icon name="MoreHorizontal" className="size-4" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="z-[70]">
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Icon name="ListView" aria-hidden />
            Move to section
          </DropdownMenuSubTrigger>
          <DropdownMenuPortal>
            <DropdownMenuSubContent className="z-[70]">
              {sections.map((section) => (
                <DropdownMenuItem
                  key={section.id}
                  onSelect={() => {
                    if (section.id !== thread.sectionId) onSetSection(section.id);
                  }}
                >
                  <span className="w-4">
                    {section.id === thread.sectionId ? (
                      <Icon name="Check" aria-hidden />
                    ) : null}
                  </span>
                  <SectionMenuIcon icon={sectionIcons.get(section.id)} />
                  {section.label}
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem
                onSelect={() => {
                  if (thread.sectionId !== null) onSetSection(null);
                }}
              >
                <span className="w-4">
                  {thread.sectionId === null ? <Icon name="Check" aria-hidden /> : null}
                </span>
                <Icon name="ListView" aria-hidden />
                Unorganized
              </DropdownMenuItem>
              <DropdownMenuItem inset onSelect={onNewSection}>
                <Icon name="SectionAdd" aria-hidden />
                New section
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuPortal>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
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
