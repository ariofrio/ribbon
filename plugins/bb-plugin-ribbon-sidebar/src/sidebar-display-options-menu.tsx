import {
  DropdownMenuCheckboxItem,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "./vendor/components/ui/dropdown-menu";
import type {
  HiddenThreadKinds,
  SidebarGroupingKey,
  PullRequestNumberPosition,
} from "./view-state";

interface SidebarDisplayOptionsItemsProps {
  groupingKey: SidebarGroupingKey;
  onGroupingChange(groupingKey: SidebarGroupingKey): void;
  hide: HiddenThreadKinds;
  onHideChange(kind: keyof HiddenThreadKinds, hidden: boolean): void;
  onPullRequestNumberPositionChange(position: PullRequestNumberPosition): void;
  pullRequestNumberPosition: PullRequestNumberPosition;
}

const PR_NUMBER_OPTIONS: readonly {
  value: PullRequestNumberPosition;
  label: string;
}[] = [
  { value: "left", label: "Left" },
  { value: "right", label: "Right" },
  { value: "hidden", label: "Hidden" },
];

function MenuValueRow({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex flex-1 items-center justify-between gap-4">
      <span>{label}</span>
      <span className="whitespace-nowrap text-muted-foreground">{value}</span>
    </span>
  );
}

export function SidebarDisplayOptionsItems({
  groupingKey,
  onGroupingChange,
  hide,
  onHideChange,
  onPullRequestNumberPositionChange,
  pullRequestNumberPosition,
}: SidebarDisplayOptionsItemsProps) {
  const hiddenLabels = [
    hide.hidden ? "Hidden" : null,
    hide.archived ? "Archived" : null,
    hide.visible ? "Visible" : null,
    hide.notArchived ? "Not archived" : null,
  ].filter((label): label is string => label !== null);

  return (
    <>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger
          aria-label={`Group by ${groupingKey === "builtin:projects" ? "Project" : "Section"}`}
        >
          <MenuValueRow
            label="Group by"
            value={groupingKey === "builtin:projects" ? "Project" : "Section"}
          />
        </DropdownMenuSubTrigger>
        <DropdownMenuPortal>
          <DropdownMenuSubContent>
            {(
              [
                { value: "builtin:sections", label: "Section" },
                { value: "builtin:projects", label: "Project" },
              ] as const
            ).map((option) => (
              <DropdownMenuCheckboxItem
                key={option.value}
                checked={groupingKey === option.value}
                onCheckedChange={() => onGroupingChange(option.value)}
              >
                {option.label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuPortal>
      </DropdownMenuSub>

      <DropdownMenuSub>
        <DropdownMenuSubTrigger
          aria-label={`PR number ${PR_NUMBER_OPTIONS.find(({ value }) => value === pullRequestNumberPosition)?.label}`}
        >
          <MenuValueRow
            label="PR number"
            value={
              PR_NUMBER_OPTIONS.find(
                ({ value }) => value === pullRequestNumberPosition,
              )?.label ?? "Right"
            }
          />
        </DropdownMenuSubTrigger>
        <DropdownMenuPortal>
          <DropdownMenuSubContent>
            {PR_NUMBER_OPTIONS.map((option) => (
              <DropdownMenuCheckboxItem
                checked={pullRequestNumberPosition === option.value}
                key={option.value}
                onCheckedChange={() =>
                  onPullRequestNumberPositionChange(option.value)
                }
              >
                {option.label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuPortal>
      </DropdownMenuSub>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger
          aria-label={`Hide ${hiddenLabels.length > 0 ? hiddenLabels.join(", ") : "Nothing"}`}
        >
          <MenuValueRow
            label="Hide"
            value={
              hiddenLabels.length > 0 ? hiddenLabels.join(", ") : "Nothing"
            }
          />
        </DropdownMenuSubTrigger>
        <DropdownMenuPortal>
          <DropdownMenuSubContent>
            <DropdownMenuCheckboxItem
              checked={hide.notArchived}
              onCheckedChange={(checked) =>
                onHideChange("notArchived", checked === true)
              }
            >
              Not archived
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={hide.archived}
              onCheckedChange={(checked) =>
                onHideChange("archived", checked === true)
              }
            >
              Archived
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem
              checked={hide.visible}
              onCheckedChange={(checked) =>
                onHideChange("visible", checked === true)
              }
            >
              Visible
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={hide.hidden}
              onCheckedChange={(checked) =>
                onHideChange("hidden", checked === true)
              }
            >
              Hidden
            </DropdownMenuCheckboxItem>
          </DropdownMenuSubContent>
        </DropdownMenuPortal>
      </DropdownMenuSub>
    </>
  );
}
