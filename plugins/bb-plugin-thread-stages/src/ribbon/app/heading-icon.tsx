import { useSettings } from "@get-bb/plugin-sdk/app";
import { useState, type CSSProperties } from "react";
import { IconGlyph } from "../../icons/IconGlyph";
import { IconPicker } from "../../icons/IconPicker";
import { iconFor } from "../../icons/icons-client";
import {
  PERSONAL_PROJECT_ID,
  defaultIcon,
  isEditable,
  type IconOwner,
} from "../../icons/store";
import { StandardHeadingIcon, headingColorStyle } from "./heading";
import { useIconsController, useOwnerColor } from "./icons";

/** Whether headings carry an icon; Ribbon's Off still reads as off. */
function useHeadingIconsSetting(): boolean {
  const settings = useSettings();
  const value = settings.values?.groupHeaderIcons;
  return value !== false && value !== "Off";
}

/** The wash and ink a heading takes from its owner's color, gray without one. */
export function useHeadingStyle(owner: IconOwner | null): CSSProperties {
  const color = useOwnerColor(owner);
  return headingColorStyle(color);
}

/**
 * The icon before a heading's label: the owner's own where one was chosen,
 * otherwise a standard book or folder that opens and shuts with the group,
 * or nothing while the setting is off. Threads owns no icon, so it gets
 * the section's book.
 */
export function RibbonHeadingIcon({
  owner,
  collapsed,
  unorganized = false,
}: {
  owner: IconOwner | null;
  collapsed: boolean;
  unorganized?: boolean;
}) {
  const enabled = useHeadingIconsSetting();
  const controller = useIconsController();
  if (!enabled) return null;
  const chosen =
    !unorganized &&
    owner !== null &&
    (controller?.state?.icons.some(
      (item) => item.kind === owner.kind && item.id === owner.id,
    ) ?? false);
  if (!chosen) {
    return (
      <StandardHeadingIcon
        kind={unorganized ? "section" : (owner?.kind ?? "section")}
        collapsed={collapsed}
      />
    );
  }
  const drawn = iconFor(controller?.state ?? null, owner as IconOwner, PERSONAL_PROJECT_ID);
  // The heading already wears the owner's color as its ink; the icon takes
  // that ink rather than the palette color it would draw in on its own.
  return (
    <IconGlyph
      icon={{ ...drawn, color: null }}
      className="size-4 shrink-0 [color:var(--ribbon-heading-on,currentColor)]"
    />
  );
}

/**
 * The picker a heading's menu opens for its owner's icon, anchored to the
 * heading's controls. Renders nothing for an owner whose icon is fixed.
 */
export function HeadingIconPicker({
  owner,
  ownerName,
  open,
  onOpenChange,
}: {
  owner: IconOwner;
  ownerName: string;
  open: boolean;
  onOpenChange(open: boolean): void;
}) {
  const controller = useIconsController();
  const [wanted, setWanted] = useState(false);
  if (controller === null || !isEditable(owner)) return null;
  if (open && !wanted) {
    setWanted(true);
    controller.loadCatalog();
  }
  const drawn = iconFor(controller.state, owner, PERSONAL_PROJECT_ID);
  return (
    <IconPicker
      catalog={controller.catalog}
      loading={controller.loadingCatalog}
      open={open}
      onOpenChange={onOpenChange}
      ownerName={ownerName}
      icon={drawn.name}
      defaultIcon={defaultIcon(owner)}
      stored={
        controller.state?.icons.some(
          (item) => item.kind === owner.kind && item.id === owner.id,
        ) ?? false
      }
      color={drawn.color}
      onPick={(next) => controller.apply(owner, { icon: next })}
      onPickColor={(next) => controller.apply(owner, { color: next })}
      onReset={() => controller.reset(owner)}
      trigger={<span aria-hidden className="absolute right-0 top-0 size-0" />}
    />
  );
}
