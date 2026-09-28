import {
  DropdownMenuCheckboxItem,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/ui/icon";
import { useRibbonData } from "./data";
import type { PullRequestNumberPosition } from "./view-state";

const PR_NUMBER_OPTIONS: readonly { value: PullRequestNumberPosition; label: string }[] = [
  { value: "left", label: "Left" },
  { value: "right", label: "Right" },
  { value: "hidden", label: "Hidden" },
];

/**
 * Ribbon's own display option in a heading's menu: where a thread's pull
 * request number sits, or that it is hidden along with its status mark.
 */
export function RibbonViewMenuItems({ compact }: { compact: boolean }) {
  const ribbon = useRibbonData();
  if (ribbon === null) return null;
  const { pullRequestNumberPosition, tabularPullRequestDigits } = ribbon.view;
  const current =
    PR_NUMBER_OPTIONS.find(({ value }) => value === pullRequestNumberPosition)?.label ??
    "Right";
  const items = (
    <>
      {PR_NUMBER_OPTIONS.map((option) => (
        <DropdownMenuCheckboxItem
          key={option.value}
          checked={pullRequestNumberPosition === option.value}
          onCheckedChange={() =>
            ribbon.changeView((view) => ({
              ...view,
              pullRequestNumberPosition: option.value,
            }))
          }
        >
          {option.label}
        </DropdownMenuCheckboxItem>
      ))}
      <DropdownMenuSeparator />
      <DropdownMenuCheckboxItem
        checked={tabularPullRequestDigits}
        onCheckedChange={(checked) =>
          ribbon.changeView((view) => ({
            ...view,
            tabularPullRequestDigits: checked === true,
          }))
        }
      >
        Equal-width digits
      </DropdownMenuCheckboxItem>
    </>
  );
  if (compact) {
    return (
      <>
        <DropdownMenuSeparator />
        {items}
      </>
    );
  }
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger aria-label={`PR number ${current}`}>
        <Icon name="GitPullRequestArrow" />
        <span className="flex flex-1 items-center justify-between gap-4">
          <span>PR number</span>
          <span className="whitespace-nowrap text-muted-foreground">{current}</span>
        </span>
      </DropdownMenuSubTrigger>
      <DropdownMenuPortal>
        <DropdownMenuSubContent>{items}</DropdownMenuSubContent>
      </DropdownMenuPortal>
    </DropdownMenuSub>
  );
}
