import { useState, type ComponentProps } from "react";
import { IconGlyph } from "./IconGlyph";
import { iconFor } from "./icons-client";
import { IconPicker } from "./IconPicker";
import { PERSONAL_PROJECT_ID, defaultIcon, isEditable, type IconOwner } from "./store";
import type { IconsController } from "./use-icons";

/**
 * One owner's icon, and the picker behind it where the icon may be changed.
 *
 * Every place that offers the picker wants the same wiring — fetch the catalog
 * on approach, apply on click, reset on remove — and differs only in what the
 * trigger looks like and what a click there must not also do. So the wiring
 * lives here and the surface passes its own classes and handlers.
 */
export function IconControl({
  owner,
  name,
  controller,
  glyphClassName,
  triggerClassName,
  readOnlyClassName = "inline-flex items-center justify-center",
  triggerProps,
}: {
  owner: IconOwner;
  /** What the picker calls this project, for its label and its heading. */
  name: string;
  controller: IconsController;
  glyphClassName?: string;
  triggerClassName: string;
  readOnlyClassName?: string;
  triggerProps?: ComponentProps<"button">;
}) {
  const [picking, setPicking] = useState(false);
  const { state, catalog, loadingCatalog, loadCatalog, apply, reset } = controller;
  const drawn = iconFor(state, owner, PERSONAL_PROJECT_ID);
  const glyph = <IconGlyph icon={drawn} className={glyphClassName} />;

  if (!isEditable(owner)) {
    return <span className={readOnlyClassName}>{glyph}</span>;
  }

  const trigger = (
    <button
      type="button"
      aria-label={`Icon for ${name}`}
      title="Change icon"
      // Fetched on approach, so the picker is whole when it opens rather than
      // arriving and then filling in. loadCatalog only ever runs once.
      onPointerEnter={loadCatalog}
      onFocus={loadCatalog}
      {...triggerProps}
      className={triggerClassName}
    >
      {glyph}
    </button>
  );

  return (
    <IconPicker
      catalog={catalog}
      loading={loadingCatalog}
      open={picking}
      onOpenChange={(next) => {
        setPicking(next);
        if (next) loadCatalog();
      }}
      ownerName={name}
      icon={drawn.name}
      defaultIcon={defaultIcon(owner)}
      color={drawn.color}
      onPick={(next) => apply(owner, { icon: next })}
      onPickColor={(next) => apply(owner, { color: next })}
      onReset={() => reset(owner)}
      trigger={trigger}
    />
  );
}
