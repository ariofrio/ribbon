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
import { UnorganizedIcon } from "./unorganized-icon";

export type HeadingIconsSetting = "On" | "Off" | "Standardized";

export function useHeadingIconsSetting(): HeadingIconsSetting {
  const settings = useSettings();
  const value = settings.values?.groupHeaderIcons;
  return value === "Off" || value === "Standardized" ? value : "On";
}

/** The wash and ink a heading takes from its owner's color, gray without one. */
export function useHeadingStyle(owner: IconOwner | null): CSSProperties {
  const color = useOwnerColor(owner);
  return headingColorStyle(color);
}

/**
 * The icon before a heading's label: the owner's own, a standard book or
 * folder that opens and shuts with the group, or nothing, as the setting
 * says. Unorganized, which owns no icon, keeps its own glyph.
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
  const setting = useHeadingIconsSetting();
  const controller = useIconsController();
  if (setting === "Off") return null;
  if (setting === "Standardized") {
    return (
      <StandardHeadingIcon
        kind={unorganized ? "section" : (owner?.kind ?? "section")}
        collapsed={collapsed}
      />
    );
  }
  if (unorganized || owner === null) return <UnorganizedIcon />;
  const drawn = iconFor(controller?.state ?? null, owner, PERSONAL_PROJECT_ID);
  return (
    <IconGlyph
      icon={drawn}
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
