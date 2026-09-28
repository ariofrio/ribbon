import { AlbumNotFound01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";

const notFoundSlash = AlbumNotFound01Icon[3];

/** List view with its row outlines interrupted around the not-found slash. */
const ListViewOffIcon: IconSvgElement = [
  [
    "path",
    {
      d: "M2 3.4V4.6C2 5.75827 2.24173 6 3.4 6H6M6 2H20.6C21.7583 2 22 2.24173 22 3.4V4.6C22 5.75827 21.7583 6 20.6 6H10",
      stroke: "currentColor",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      strokeWidth: "1.5",
      key: "0",
    },
  ],
  [
    "path",
    {
      d: "M10 10H3.4C2.24173 10 2 10.2417 2 11.4V12.6C2 13.7583 2.24173 14 3.4 14H14M14 10H20.6C21.7583 10 22 10.2417 22 11.4V12.6C22 13.7583 21.7583 14 20.6 14H18",
      stroke: "currentColor",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      strokeWidth: "1.5",
      key: "1",
    },
  ],
  [
    "path",
    {
      d: "M18 18H3.4C2.24173 18 2 18.2417 2 19.4V20.6C2 21.7583 2.24173 22 3.4 22H22",
      stroke: "currentColor",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      strokeWidth: "1.5",
      key: "2",
    },
  ],
  notFoundSlash,
];

export function UnorganizedIcon({ className }: { className?: string }) {
  return (
    <HugeiconsIcon
      aria-hidden
      className={className ?? "size-4 shrink-0"}
      data-icon="ListViewOff"
      icon={ListViewOffIcon}
      size={16}
    />
  );
}
