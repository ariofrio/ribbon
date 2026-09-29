import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { iconColorStyle } from "./icon-colors";
import type { IconColor } from "./store";

/** One owner's drawing, as `iconFor` resolves it. */
export interface DrawnIcon {
  name: string;
  glyph: IconSvgElement | undefined;
  color: IconColor | null;
}

/**
 * The icon itself, wherever it is drawn.
 *
 * Nothing renders until the glyph arrives, so a header that mounts before the
 * backend answers stays as bb drew it rather than flashing a placeholder.
 */
export function IconGlyph({
  icon,
  className = "size-4 shrink-0",
}: {
  icon: DrawnIcon;
  className?: string;
}) {
  if (icon.glyph === undefined) return null;
  return (
    <HugeiconsIcon
      icon={icon.glyph}
      className={className}
      style={iconColorStyle(icon.color)}
      data-icon={icon.name}
      aria-hidden
    />
  );
}
